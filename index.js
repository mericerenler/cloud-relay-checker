import cors from "cors";
import express from "express";
import { Expo } from "expo-server-sdk";

/* ================= SETUP ================= */

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const expo = new Expo();

/* ================= STATE ================= */

// In-memory (Railway restart -> reset olur, bilinçli)
let lastHeartbeat = Date.now();
let registeredTokens = new Set();
let isAlarmState = false;

/* ================= ROUTES ================= */

// Healthcheck (Railway sever)
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

// Mobile app token register
app.post("/register-token", (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Token required" });
  }

  if (!Expo.isExpoPushToken(token)) {
    console.error("Invalid Expo token:", token);
    return res.status(400).json({ error: "Invalid Expo push token" });
  }

  registeredTokens.add(token);
  console.log("Token registered:", token);

  res.json({ status: "registered", count: registeredTokens.size });
});

// Heartbeat (home server)
app.post("/heartbeat", (req, res) => {
  lastHeartbeat = Date.now();

  if (isAlarmState) {
    console.log("🟢 Power restored");
    isAlarmState = false;

    sendPushNotification(
      "🟢 Power Restored",
      "Server is back online."
    ).catch(console.error);
  }

  res.json({ status: "ok", timestamp: lastHeartbeat });
});

// Manual alert
app.post("/alert", (req, res) => {
  const { title, body } = req.body;

  console.log("Alert received:", title, body);

  sendPushNotification(
    title || "⚠️ Alert",
    body || "Check the system"
  ).catch(console.error);

  res.json({ status: "sent" });
});

/* ================= WATCHDOG ================= */

// Every 30 seconds
setInterval(() => {
  const diff = Date.now() - lastHeartbeat;

  if (diff > 120000 && !isAlarmState) {
    console.log("🚨 ALARM: Server Down / Power Lost");

    isAlarmState = true;

    sendPushNotification(
      "🚨 CRITICAL ALERT",
      "Server unreachable for more than 2 minutes!"
    ).catch(console.error);
  }
}, 30000);

/* ================= PUSH HELPER ================= */

async function sendPushNotification(title, body) {
  if (registeredTokens.size === 0) return;

  const messages = [];

  for (const token of registeredTokens) {
    if (!Expo.isExpoPushToken(token)) continue;

    messages.push({
      to: token,
      sound: "default", // safest
      title,
      body,
      priority: "high",
      data: { action: "ALERT" },
    });
  }

  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      console.log("Push sent:", tickets);
    } catch (err) {
      console.error("Push error:", err);
    }
  }
}

/* ================= START ================= */

app.listen(PORT, () => {
  console.log(`🚀 Railway Watchdog running on port ${PORT}`);
});
