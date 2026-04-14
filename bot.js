require("dotenv").config();
const express = require("express");
const crypto = require("crypto");

const {
  BOT_TOKEN,
  CHAT_ID,
  OKX_API_KEY,
  OKX_SECRET_KEY,
  OKX_PASSPHRASE,
  PORT = 3000,
} = process.env;

const SYMBOL = "XAU-USDT-SWAP"; // gold only
const BASE_URL = "https://www.okx.com";
const USE_BALANCE_PERCENT = 0.90; // tuned for 15$ micro account
let inPosition = false;

if (!BOT_TOKEN || !CHAT_ID) throw new Error("Telegram variables missing");
if (!OKX_API_KEY || !OKX_SECRET_KEY || !OKX_PASSPHRASE) {
  throw new Error("OKX API variables missing");
}

async function sendTelegramMessage(text) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text }),
    });
  } catch (e) {
    console.error("Telegram error:", e.message);
  }
}

function sign(timestamp, method, path, body = "") {
  return crypto
    .createHmac("sha256", OKX_SECRET_KEY)
    .update(timestamp + method + path + body)
    .digest("base64");
}

async function okxRequest(method, path, bodyObj = null) {
  const body = bodyObj ? JSON.stringify(bodyObj) : "";
  const ts = new Date().toISOString();
  const headers = {
    "OK-ACCESS-KEY": OKX_API_KEY,
    "OK-ACCESS-SIGN": sign(ts, method, path, body),
    "OK-ACCESS-TIMESTAMP": ts,
    "OK-ACCESS-PASSPHRASE": OKX_PASSPHRASE,
    "Content-Type": "application/json",
  };

  const res = await fetch(BASE_URL + path, {
    method,
    headers,
    body: body || undefined,
  });
  return res.json();
}

async function getBalance() {
  const data = await okxRequest("GET", "/api/v5/account/balance");
  const usdt = Number(data?.data?.[0]?.details?.find(x => x.ccy === "USDT")?.availBal || 0);
  return usdt;
}

async function getCandles() {
  const res = await fetch(`${BASE_URL}/api/v5/market/candles?instId=${SYMBOL}&bar=1m&limit=6`);
  const data = await res.json();
  return (data.data || []).map(c => ({
    open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4])
  })).reverse();
}

function candleSignal(c) {
  const [a,b,c3,d,e,f] = c;
  const avgBody = [a,b,c3,d,e].reduce((s,x)=>s+Math.abs(x.close-x.open),0)/5;
  const lastBody = Math.abs(f.close - f.open);
  const bullishEngulf = f.close > f.open && e.close < e.open && f.close > e.open && f.open < e.close;
  const bearishEngulf = f.close < f.open && e.close > e.open && f.open > e.close && f.close < e.open;
  const breakoutUp = f.close > e.high;
  const breakoutDown = f.close < e.low;
  const strong = lastBody > avgBody * 1.2;

  if (strong && bullishEngulf && breakoutUp) return "buy";
  if (strong && bearishEngulf && breakoutDown) return "sell";
  return null;
}

async function placeOrder(side, usdtSize) {
  const body = {
    instId: SYMBOL,
    tdMode: "cross",
    side,
    posSide: side === "buy" ? "long" : "short",
    ordType: "market",
    sz: String(Math.max(usdtSize, 1)),
  };
  return okxRequest("POST", "/api/v5/trade/order", body);
}

async function strategyLoop() {
  try {
    if (inPosition) return;

    const candles = await getCandles();
    if (candles.length < 6) return;

    const signal = candleSignal(candles);
    if (!signal) return;

    const balance = await getBalance();
    const size = +(balance * USE_BALANCE_PERCENT).toFixed(2);
    if (size < 1) {
      await sendTelegramMessage("⚠️ Balance too low for gold scalping");
      return;
    }

    inPosition = true;
    const result = await placeOrder(signal, size);
    await sendTelegramMessage(`🚀 GOLD ${signal.toUpperCase()}\nSymbol: ${SYMBOL}\nSize: ${size} USDT\nRef: ${result?.data?.[0]?.ordId || "pending"}`);

    // cooldown for fast scalp
    setTimeout(() => {
      inPosition = false;
    }, 45000);
  } catch (e) {
    inPosition = false;
    console.error("Strategy error:", e.message);
  }
}

// fast execution loop
setInterval(strategyLoop, 5000);

// alive notification every 10 seconds
setInterval(() => {
  sendTelegramMessage("✅ SmartGold V5 alive | Gold only | 1m scalp");
}, 10000);

// startup message
sendTelegramMessage("🔥 SmartGold V5 started | Gold only micro scalper");

const app = express();
app.get("/", (_, res) => res.send("SmartGold V5 running ✅"));
app.listen(PORT, "0.0.0.0", () => console.log(`Running on ${PORT}`));
