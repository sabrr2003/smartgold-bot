require("dotenv").config();
const express = require("express");

const token = process.env.BOT_TOKEN;
const chatId = process.env.CHAT_ID;
const port = process.env.PORT || 3000;

if (!token || !chatId) {
  throw new Error("BOT_TOKEN or CHAT_ID is missing in Railway Variables");
}

async function sendTelegramMessage(msg) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: msg
      })
    });

    const data = await res.json();
    console.log("Telegram response:", data);
  } catch (error) {
    console.error("Telegram send error:", error.message);
  }
}

// إشعار عند بدء التشغيل
sendTelegramMessage("🚀 smartgold-bot started successfully on Railway");

// إشعار كل 10 ثواني
setInterval(() => {
  sendTelegramMessage("📢 تنبيه تلقائي من smartgold-bot كل 10 ثواني");
}, 10000);

// Health check server حتى Railway لا يوقف الخدمة
const app = express();
app.get("/", (req, res) => {
  res.send("smartgold-bot is running ✅");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Keep alive log
setInterval(() => {
  console.log("Bot is alive and running...");
}, 30000);
