import fetch from "node-fetch";
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET = process.env.TARGET_URL;

app.get("/", async (req, res) => {
  try {
    const r = await fetch(TARGET, { timeout: 5000 });
    if (!r.ok) throw new Error("Bad response");
    res.status(200).json({ status: "UP" });
  } catch (e) {
    res.status(503).json({ status: "DOWN" });
  }
});

app.listen(PORT, () => {
  console.log("Relay running on", PORT);
});
