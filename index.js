import cors from "cors";
import { Expo } from "expo-server-sdk";
import express from "express";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const expo = new Expo();

// In-memory storage (Reset on Railway restart, but okay for this use case)
let lastHeartbeat = Date.now();
let registeredTokens = new Set();
let isAlarmState = false;

/* ================= ROUTES ================= */

// 1. Mobile App registers its token here
app.post('/register-token', (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).send({ error: 'Token required' });
    }

    if (!Expo.isExpoPushToken(token)) {
        console.error(`Token ${token} is not a valid Expo push token`);
        // We might validly receive a token that Expo lib doesn't like strictly, 
        // but usually it's correct. Let's log and try anyway or fail?
        // Let's safe fail.
        return res.status(400).send({ error: 'Invalid Expo Push Token' });
    }

    registeredTokens.add(token);
    console.log('Token Registered:', token);
    res.send({ status: 'registered' });
});

// 2. Home Server sends "I am alive" here
app.post('/heartbeat', (req, res) => {
    lastHeartbeat = Date.now();

    // Valid heartbeat means power is back
    if (isAlarmState) {
        console.log('Power Restored!');
        isAlarmState = false;
        sendPushNotification("🟢 Power Restored", "Server is back online.");
    }

    res.send({ status: 'ok', timestamp: lastHeartbeat });
});

// 3. Home Server sends specific alerts (e.g. Miner High Temp)
app.post('/alert', (req, res) => {
    const { title, body } = req.body;
    console.log('Received Alert:', title, body);
    sendPushNotification(title || 'Miner Alert', body || 'Check miners!');
    res.send({ status: 'sent' });
});

// 4. Status Check for Monitor App
app.get('/', (req, res) => {
    // If heartbeat is fresh (< 2 mins), return UP
    const isUp = (Date.now() - lastHeartbeat) < 120000;
    res.json({
        status: isUp ? 'UP' : 'DOWN',
        last_seen_seconds_ago: Math.floor((Date.now() - lastHeartbeat) / 1000)
    });
});

/* ================= WATCHDOG LOOP ================= */
// Check every 30 seconds
setInterval(() => {
    const now = Date.now();
    const diff = now - lastHeartbeat;

    // Threshold: 2 Minutes (120,000 ms)
    if (diff > 120000 && !isAlarmState) {
        console.log('🚨 ALARM: Server Down / Power Lost!');
        isAlarmState = true;

        sendPushNotification(
            "🚨 CRITICAL ALERT",
            "Server Unreachable (>2 mins). Power/Internet might be down!"
        );
    }
}, 30000);


/* ================= HELPER ================= */
async function sendPushNotification(title, body) {
    let messages = [];
    for (let pushToken of registeredTokens) {
        if (!Expo.isExpoPushToken(pushToken)) {
            console.error(`Push token ${pushToken} is not a valid Expo push token`);
            continue;
        }

        messages.push({
            to: pushToken,
            sound: 'siren.mp3',
            title: title,
            body: body,
            data: { action: 'TRIGGER_ALARM' },
            priority: 'high',
            channelId: 'critical_alert',
        });
    }

    let chunks = expo.chunkPushNotifications(messages);
    for (let chunk of chunks) {
        try {
            let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
            console.log('Push Sent:', ticketChunk);
        } catch (error) {
            console.error(error);
        }
    }
}

app.listen(PORT, () => {
    console.log(`Railway Watchdog running on port ${PORT}`);
});
