// 🚀 SMART GOLD BOT V4 - Continuous All-in XAUT Sniper Scalper // Full replacement for bot.js

const ccxt = require('ccxt'); const fetch = global.fetch || require('node-fetch');

const exchange = new ccxt.okx({ apiKey: process.env.OKX_API_KEY, secret: process.env.OKX_SECRET, password: process.env.OKX_PASSPHRASE, enableRateLimit: true, options: { defaultType: 'spot' }, });

const symbol = 'XAUT/USDT'; const TAKE_PROFIT = 0.7; // % const STOP_LOSS = -0.2; // % const LOOP_MS = 2000;

let inPosition = false; let entryPrice = 0; let lastHeartbeat = 0;

async function sendTelegram(msg) { const token = process.env.TELEGRAM_BOT_TOKEN; const chatId = process.env.TELEGRAM_CHAT_ID; if (!token || !chatId) return;

await fetch(https://api.telegram.org/bot${token}/sendMessage, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: msg }), }); }

async function sendHeartbeat() { const now = Date.now(); if (now - lastHeartbeat < 10 * 60 * 1000) return; lastHeartbeat = now; await sendTelegram('💓 Bot heartbeat: still running on Railway'); }

async function strongEntrySignal() { const candles = await exchange.fetchOHLCV(symbol, '1m', undefined, 50); if (!candles || candles.length < 30) return false;

const closes = candles.map(c => c[4]); const volumes = candles.map(c => c[5]);

const ema5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5; const ema20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20; const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20; const lastVol = volumes[volumes.length - 1]; const breakoutHigh = Math.max(...closes.slice(-10, -1)); const last = closes[closes.length - 1]; const prev = closes[closes.length - 2];

const bullishTrend = ema5 > ema20; const volumeSpike = lastVol > avgVol * 1.2; const breakout = last > breakoutHigh; const momentum = last > prev;

return bullishTrend && volumeSpike && breakout && momentum; }

async function buyWithAllBalance() { const balance = await exchange.fetchBalance(); const usdt = balance.free?.USDT || 0; if (usdt <= 1) return false;

const ticker = await exchange.fetchTicker(symbol); const amount = exchange.amountToPrecision(symbol, usdt / ticker.last);

const order = await exchange.createMarketBuyOrder(symbol, amount); inPosition = true; entryPrice = ticker.last;

await sendTelegram(🚀 BUY ${symbol} @ ${entryPrice}); return order; }

async function sellFullPosition() { const balance = await exchange.fetchBalance(); const base = symbol.split('/')[0]; let amount = balance.free?.[base] || 0; if (!amount || amount <= 0) return false;

const market = exchange.market(symbol); amount = exchange.amountToPrecision(symbol, amount); const minAmount = market.limits?.amount?.min || 0;

if (parseFloat(amount) < minAmount) { console.log(⚠️ Amount too small: ${amount}); return false; }

const order = await exchange.createMarketSellOrder(symbol, amount); inPosition = false;

await sendTelegram(✅ SOLD FULL ${symbol}); return order; }

async function managePosition() { if (!inPosition) return;

const ticker = await exchange.fetchTicker(symbol); const pnl = ((ticker.last - entryPrice) / entryPrice) * 100;

if (pnl >= TAKE_PROFIT || pnl <= STOP_LOSS) { await sellFullPosition(); } }

async function botLoop() { await exchange.loadMarkets(); await sendTelegram('🥇 XAUT Sniper Scalper Started');

while (true) { try { await sendHeartbeat();

if (!inPosition) {
    const signal = await strongEntrySignal();
    if (signal) await buyWithAllBalance();
  } else {
    await managePosition();
  }

  console.log('🔥 sniper heartbeat', { inPosition });
} catch (e) {
  console.error('loop error', e.message);
}

await new Promise(r => setTimeout(r, LOOP_MS));

} }

botLoop();
