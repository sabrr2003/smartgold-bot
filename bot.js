// ✅ SMART GOLD BOT - SAFE FULL SELL PATCH V3 // Replace your old sell logic with this section

async function sellFullPosition(exchange, symbol) { try { const balance = await exchange.fetchBalance(); const base = symbol.split('/')[0]; // PAXG or XAUT

let amount = balance.free?.[base] || 0;

if (!amount || amount <= 0) {
  console.log(`⚠️ No balance available to sell for ${symbol}`);
  return false;
}

// Load market details
const market = exchange.market(symbol);

// Round amount to exchange precision
amount = exchange.amountToPrecision(symbol, amount);

const minAmount = market.limits?.amount?.min || 0;

// Skip too-small balances
if (parseFloat(amount) < minAmount) {
  console.log(`⚠️ ${symbol} balance too small for API sell (${amount} < ${minAmount})`);
  return false;
}

const order = await exchange.createMarketSellOrder(symbol, amount);

console.log(`✅ SOLD FULL ${symbol} => ${amount}`);
return order;

} catch (err) { console.error(❌ SELL ERROR ${symbol}:, err.message); return false; } }

// ✅ Example monitor exit logic async function checkTakeProfit(exchange) { const symbols = ['PAXG/USDT', 'XAUT/USDT'];

for (const symbol of symbols) { const ticker = await exchange.fetchTicker(symbol); const change = ticker.percentage || 0;

// Fast scalp: sell on 0.25% profit
if (change >= 0.25) {
  await sellFullPosition(exchange, symbol);
}

} }

// ✅ Dynamic buy size: use all available USDT minus reserve async function getDynamicBuyAmount(exchange, reserve = 0) { const balance = await exchange.fetchBalance(); const free = balance.free?.USDT || 0; const usable = Math.max(0, free - reserve); return usable; }

// Example buy helper using full available balance async function buyWithAllAvailable(exchange, symbol = 'XAUT/USDT') { const ticker = await exchange.fetchTicker(symbol); const usdt = await getDynamicBuyAmount(exchange, 0); if (!ticker.last || usdt <= 0) return false;

const amount = exchange.amountToPrecision(symbol, usdt / ticker.last); return exchange.createMarketBuyOrder(symbol, amount); }

// ✅ Strong diversified entry filters async function strongEntrySignal(exchange, symbol = 'XAUT/USDT') { const ohlcv = await exchange.fetchOHLCV(symbol, '1m', undefined, 50); if (!ohlcv || ohlcv.length < 30) return false;

const closes = ohlcv.map(c => c[4]); const volumes = ohlcv.map(c => c[5]); const last = closes[closes.length - 1];

const ema5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5; const ema20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20; const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20; const lastVol = volumes[volumes.length - 1]; const breakoutHigh = Math.max(...closes.slice(-10, -1));

const bullishTrend = ema5 > ema20; const volumeSpike = lastVol > avgVol * 1.2; const breakout = last > breakoutHigh; const momentum = closes[closes.length - 1] > closes[closes.length - 2];

return bullishTrend && volumeSpike && breakout && momentum; }

// ✅ Telegram heartbeat every 10 minutes let lastHeartbeat = 0;

async function sendHeartbeat(fetchFn) { const now = Date.now(); if (now - lastHeartbeat < 10 * 60 * 1000) return;

lastHeartbeat = now;

const token = process.env.TELEGRAM_BOT_TOKEN; const chatId = process.env.TELEGRAM_CHAT_ID; if (!token || !chatId) return;

try { await fetchFn(https://api.telegram.org/bot${token}/sendMessage, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: '💓 Bot heartbeat: still running on Railway', }), }); } catch (e) { console.error('heartbeat telegram error', e.message); } }

// ✅ Main loop example async function botLoop(exchange) { while (true) { try { await checkTakeProfit(exchange); console.log('🔥 smart heartbeat'); } catch (e) { console.error('loop error', e.message); }

await new Promise(r => setTimeout(r, 3000));

} }
