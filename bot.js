const ccxt = require('ccxt');

const exchange = new ccxt.okx({ apiKey: process.env.OKX_API_KEY, secret: process.env.OKX_SECRET, password: process.env.OKX_PASSPHRASE, enableRateLimit: true, options: { defaultType: 'spot' } });

const SYMBOL = 'XAUT/USDT'; const LOOP_MS = 3000; const HEARTBEAT_MS = 5 * 60 * 1000; const TAKE_PROFIT = 0.6; // trigger trailing const TRAILING_DROP = 0.25; const STOP_LOSS = -0.35;

let inPosition = false; let entryPrice = 0; peakPnl = 0; let lastHeartbeat = 0; let peakPnl = 0;

async function sendTelegram(text) { const token = process.env.TELEGRAM_BOT_TOKEN; const chatId = process.env.TELEGRAM_CHAT_ID; if (!token || !chatId) return;

const url = https://api.telegram.org/bot${token}/sendMessage; await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }) }).catch(() => {}); }

async function heartbeat() { const now = Date.now(); if (now - lastHeartbeat >= HEARTBEAT_MS) { lastHeartbeat = now; await sendTelegram('💓 FAST GOLD BOT running - 5m heartbeat'); } }

async function getSignal() { const candles = await exchange.fetchOHLCV(SYMBOL, '1m', undefined, 30); const closes = candles.map(c => c[4]); const highs = candles.map(c => c[2]); const vols = candles.map(c => c[5]);

const ma5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5; const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20; const last = closes.at(-1); const prev = closes.at(-2); const avgVol = vols.slice(-10).reduce((a, b) => a + b, 0) / 10; const lastVol = vols.at(-1);

const trendFilter = ma5 > ma20; const momentumFilter = last > prev; const volumeFilter = lastVol > avgVol * 1.2; const breakoutFilter = last > Math.max(...highs.slice(-6, -1));

return trendFilter && momentumFilter && volumeFilter && breakoutFilter; }

async function buyAll() { const balance = await exchange.fetchBalance(); const usdt = Number(balance.free?.USDT || 0); if (usdt <= 1) return;

const ticker = await exchange.fetchTicker(SYMBOL); const amount = exchange.amountToPrecision(SYMBOL, usdt / ticker.last);

await exchange.createMarketBuyOrder(SYMBOL, amount); inPosition = true; entryPrice = ticker.last; await sendTelegram(🚀 FULL BUY ${SYMBOL} @ ${entryPrice}); }

async function sellAll() { const balance = await exchange.fetchBalance(); const base = SYMBOL.split('/')[0]; let amount = Number(balance.free?.[base] || 0); if (amount <= 0) return;

amount = exchange.amountToPrecision(SYMBOL, amount); await exchange.createMarketSellOrder(SYMBOL, amount); await sendTelegram(✅ FULL SELL ${SYMBOL});

inPosition = false; entryPrice = 0; }

async function manageTrade() { if (!inPosition) return;

const ticker = await exchange.fetchTicker(SYMBOL); const pnl = ((ticker.last - entryPrice) / entryPrice) * 100;

if (pnl > peakPnl) peakPnl = pnl;

// hard stop loss if (pnl <= STOP_LOSS) { await sellAll(); peakPnl = 0; return; }

// trailing after profit trigger if (peakPnl >= TAKE_PROFIT && pnl <= peakPnl - TRAILING_DROP) { await sellAll(); peakPnl = 0; } }

async function main() { await exchange.loadMarkets(); await sendTelegram('🥇 FAST GOLD BOT FINAL STARTED');

while (true) { try { await heartbeat();

if (!inPosition) {
    const signal = await getSignal();
    if (signal) await buyAll();
  } else {
    await manageTrade();
  }

  console.log('FAST LOOP', { inPosition, entryPrice });
} catch (e) {
  console.log('LOOP ERROR', e.message);
}

await new Promise(r => setTimeout(r, LOOP_MS));

} }

main();
