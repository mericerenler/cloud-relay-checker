import cors from "cors";
import { Expo } from "expo-server-sdk";
import express from "express";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const expo = new Expo();
let lastHeartbeat = Date.now();
const registeredTokens = new Map();
let isAlarmState = false;
const DEFAULT_CHANNEL = 'critical_faded_v2';

app.post('/register-token', (req, res) => {
    const { token, channelId } = req.body;
    if (!token) return res.status(400).send({ error: 'Token required' });
    if (!Expo.isExpoPushToken(token)) {
        console.error(`Token ${token} is not a valid Expo push token`);
        return res.status(400).send({ error: 'Invalid Expo Push Token' });
    }
    registeredTokens.set(token, channelId || DEFAULT_CHANNEL);
    console.log(`Token Registered: ${token} -> channel: ${channelId || DEFAULT_CHANNEL}`);
    res.send({ status: 'registered' });
});

app.post('/heartbeat', (req, res) => {
    lastHeartbeat = Date.now();
    if (isAlarmState) {
        console.log('Power Restored!');
        isAlarmState = false;
        sendPushNotification('🟢 Server Geri Geldi', 'Sistem Çalışıyor.');
    }
    res.send({ status: 'ok', timestamp: lastHeartbeat });
});

app.post('/alert', (req, res) => {
    const { title, body } = req.body;
    console.log('Received Alert:', title, body);
    sendPushNotification(title || 'Miner Alert', body || 'Check miners!');
    res.send({ status: 'sent' });
});

app.get('/', (req, res) => {
    const isUp = Date.now() - lastHeartbeat < 120000;
    res.json({ status: isUp ? 'UP' : 'DOWN', last_seen_seconds_ago: Math.floor((Date.now() - lastHeartbeat) / 1000) });
});

setInterval(() => {
    if (Date.now() - lastHeartbeat > 120000 && !isAlarmState) {
        console.log('🚨 ALARM: Server Down / Power Lost!');
        isAlarmState = true;
        sendPushNotification('🔴 KRİTİK UYARI', '2 Dakikadır Sunucuya Ulaşılamıyor. Kesinti olabilir.');
    }
}, 30000);

async function sendPushNotification(title, body) {
    // Expo rejects mixed-project batches; isolate every token.
    for (const [pushToken, channelId] of registeredTokens) {
        if (!Expo.isExpoPushToken(pushToken)) continue;
        const message = {
            to: pushToken,
            sound: 'default',
            title,
            body,
            data: { action: 'TRIGGER_ALARM', title, body },
            priority: 'high',
            channelId: channelId || DEFAULT_CHANNEL,
            ttl: 3600,
            expiration: Math.floor(Date.now() / 1000) + 3600,
            mutableContent: true,
        };
        try {
            const ticket = await expo.sendPushNotificationsAsync([message]);
            console.log('Push Sent:', pushToken.slice(0, 28), ticket);
        } catch (error) {
            console.error('Push send failed for token:', pushToken.slice(0, 28), error);
        }
    }
}

app.listen(PORT, () => console.log(`Koyeb Watchdog running on port ${PORT}`));
