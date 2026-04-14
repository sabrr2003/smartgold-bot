// 🚀 SMART GOLD BOT V5 - Clean Stable Version const ccxt = require('ccxt'); const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const exchange = new ccxt.okx({ apiKey: process.env.OKX_API_KEY, secret: process.env.OKX_SECRET, password: process.env.OKX_PASSPHRASE, enableRateLimit: true, options: { defaultType: 'spot' }, });

const SYMBOL = 'XAUT/USDT'; const TAKE_PROFIT = 0.7; const STOP_LOSS = -0.2; const LOOP_MS = 3000; const HEARTBEAT_MS = 5 * 60 * 1000;

let inPosition = false; let entryPrice = 0; let lastHeartbeat = 0;

async function sendTelegram(text) { const token = process.env.TELEGRAM_BOT_TOKEN; const chatId = process.env.TELEGRAM_CHAT_ID; if (!token || !chatId) return;

try { await fetch(https://api.telegram.org/bot${token}/sendMessage, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }), }); } catch (err) { console.error('telegram error', err.message); } }

async function sendHeartbeat() { const now = Date.now(); if (now - lastHeartbeat >= HEARTBEAT_MS) { lastHeartbeat = now; await sendTelegram('💓 Bot is running normally every 5m on Railway'); } }

async function strongEntrySignal() { const candles = await exchange.fetchOHLCV(SYMBOL, '1m', undefined, 30); if (!candles || candles.length < 20) return false;

const closes = candles.map(c => c[4]); const volumes = candles.map(c => c[5]);

const ema5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5; const ema20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20; const avgVol = volumes.slice(-10).reduce((a, b) => a + b, 0) / 10; const lastVol = volumes[volumes.length - 1]; const last = closes[closes.length - 1]; const prev = closes[closes.length - 2]; const breakout = last > Math.max(...closes.slice(-6, -1));

return ema5 > ema20 && lastVol > avgVol * 1.1 && breakout && last > prev; }

async function buyAll() { const balance = await exchange.fetchBalance(); const usdt = balance.free?.USDT || 0; if (usdt <= 1) return;

const ticker = await exchange.fetchTicker(SYMBOL); const amount = exchange.amountToPrecision(SYMBOL, usdt / ticker.last);

await exchange.createMarketBuyOrder(SYMBOL, amount); entryPrice = ticker.last; inPosition = true; await sendTelegram(🚀 BUY ${SYMBOL} @ ${entryPrice}); }

async function sellAll() { const balance = await exchange.fetchBalance(); const base = SYMBOL.split('/')[0]; let amount = balance.free?.[base] || 0; if (!amount || amount <= 0) return;

amount = exchange.amountToPrecision(SYMBOL, amount); await exchange.createMarketSellOrder(SYMBOL, amount); inPosition = false; await sendTelegram(✅ SOLD ${SYMBOL}); }

async function manageTrade() { if (!inPosition) return;

const ticker = await exchange.fetchTicker(SYMBOL); const pnl = ((ticker.last - entryPrice) / entryPrice) * 100;

if (pnl >= TAKE_PROFIT || pnl <= STOP_LOSS) { await sellAll(); } }

async function botLoop() { await exchange.loadMarkets(); await sendTelegram('🥇 Smart Gold Bot V5 Started');

while (true) { try { await sendHeartbeat();

if (!inPosition) {
    const signal = await strongEntrySignal();
    if (signal) await buyAll();
  } else {
    await manageTrade();
  }

  console.log('🔥 bot loop', { inPosition, entryPrice });
} catch (err) {
  console.error('loop error', err.message);
}

await new Promise(resolve => setTimeout(resolve, LOOP_MS));

} }

botLoop();
