const ccxt = require('ccxt');

const exchange = new ccxt.okx({ apiKey: process.env.OKX_API_KEY, secret: process.env.OKX_SECRET, password: process.env.OKX_PASSPHRASE, enableRateLimit: true, options: { defaultType: 'spot' } });

const SYMBOL = 'XAUT/USDT'; const LOOP_MS = 3000; const HEARTBEAT_MS = 5 * 60 * 1000; const PROFIT_TRIGGER = 0.6; const TRAILING_DROP = 0.25; const STOP_LOSS = -0.35;

let inPosition = false; let entryPrice = 0; let peakPnl = 0; let lastHeartbeat = 0;

async function sendTelegram(text) { const token = process.env.TELEGRAM_BOT_TOKEN; const chatId = process.env.TELEGRAM_CHAT_ID; if (!token || !chatId) return;

const url = https://api.telegram.org/bot${token}/sendMessage; try { await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }) }); } catch (_) {} }

async function heartbeat() { const now = Date.now(); if (now - lastHeartbeat >= HEARTBEAT_MS) { lastHeartbeat = now; await sendTelegram('💓 FAST TRAILING BOT alive'); } }

async function getSignal() { const candles = await exchange.fetchOHLCV(SYMBOL, '1m', undefined, 30); const closes = candles.map(c => c[4]); const highs = candles.map(c => c[2]); const vols = candles.map(c => c[5]);

const ma5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5; const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20; const last = closes[closes.length - 1]; const prev = closes[closes.length - 2]; const avgVol = vols.slice(-10).reduce((a, b) => a + b, 0) / 10; const lastVol = vols[vols.length - 1];

return ( ma5 > ma20 && last > prev && lastVol > avgVol * 1.2 && last > Math.max(...highs.slice(-6, -1)) ); }

async function buyAll() { const balance = await exchange.fetchBalance(); const usdt = Number(balance.free?.USDT || 0); if (usdt <= 1) return;

const ticker = await exchange.fetchTicker(SYMBOL); const amount = exchange.amountToPrecision(SYMBOL, usdt / ticker.last);

await exchange.createMarketBuyOrder(SYMBOL, amount); inPosition = true; entryPrice = ticker.last; peakPnl = 0;

await sendTelegram(🚀 FULL BUY ${SYMBOL} @ ${entryPrice}); }

async function sellAll(reason) { const balance = await exchange.fetchBalance(); const base = SYMBOL.split('/')[0]; let amount = Number(balance.free?.[base] || 0); if (amount <= 0) return;

amount = exchange.amountToPrecision(SYMBOL, amount); await exchange.createMarketSellOrder(SYMBOL, amount);

inPosition = false; entryPrice = 0; peakPnl = 0;

await sendTelegram(✅ FULL SELL ${SYMBOL} | ${reason}); }

async function manageTrade() { if (!inPosition) return;

const ticker = await exchange.fetchTicker(SYMBOL); const pnl = ((ticker.last - entryPrice) / entryPrice) * 100;

if (pnl > peakPnl) peakPnl = pnl;

if (pnl <= STOP_LOSS) { await sellAll(SL ${pnl.toFixed(2)}%); return; }

if (peakPnl >= PROFIT_TRIGGER) { const trailLevel = peakPnl - TRAILING_DROP; if (pnl <= trailLevel) { await sellAll(TRAIL ${pnl.toFixed(2)}%); } } }

async function main() { await exchange.loadMarkets(); await sendTelegram('🥇 FAST TRAILING FINAL STARTED');

while (true) { try { await heartbeat();

if (!inPosition) {
    const signal = await getSignal();
    if (signal) await buyAll();
  } else {
    await manageTrade();
  }
} catch (e) {
  console.log('LOOP ERROR', e.message);
}

await new Promise(r => setTimeout(r, LOOP_MS));

} }

main();
