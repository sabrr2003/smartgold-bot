// OKX ADAPTIVE GOLD BOT V2 (FINAL) const CONFIG_KEYS = { OKX_API_KEY: 'ضع_api_key', OKX_SECRET: 'ضع_secret_key', OKX_PASSPHRASE: 'ضع_passphrase', TELEGRAM_BOT_TOKEN: 'ضع_telegram_bot_token', TELEGRAM_CHAT_ID: 'ضع_chat_id', };

process.env.OKX_API_KEY = CONFIG_KEYS.OKX_API_KEY; process.env.OKX_SECRET = CONFIG_KEYS.OKX_SECRET; process.env.OKX_PASSPHRASE = CONFIG_KEYS.OKX_PASSPHRASE; process.env.TELEGRAM_BOT_TOKEN = CONFIG_KEYS.TELEGRAM_BOT_TOKEN; process.env.TELEGRAM_CHAT_ID = CONFIG_KEYS.TELEGRAM_CHAT_ID;

const ccxt = require('ccxt'); const fetch = global.fetch;

let openPositions = new Map(); let consecutiveLosses = 0; let pauseUntil = 0;

const CONFIG = { TOTAL_CAPITAL: 15, RESERVE_USDT: 2, BASE_USDT_SIZE: 6.5, SAFE_USDT_SIZE: 5.5, MAX_OPEN_POSITIONS: 2, BASE_TP: 1.4, STRONG_TP: 3.2, PARTIAL_TP: 1.2, STOP_LOSS: 0.8, TRAILING_STOP: 0.6, SCAN_INTERVAL_MS: 4000, WATCHLIST: ['XAUT/USDT', 'PAXG/USDT'] };

const exchange = new ccxt.okx({ apiKey: process.env.OKX_API_KEY, secret: process.env.OKX_SECRET, password: process.env.OKX_PASSPHRASE, enableRateLimit: true, timeout: 30000, options: { defaultType: 'spot', adjustForTimeDifference: true } });

async function sendTelegram(message) { try { if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return; await fetch(https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: message }) }); } catch {} }

function calcATR(ohlcv) { const ranges = []; for (let i = 1; i < ohlcv.length; i++) { const high = ohlcv[i][2]; const low = ohlcv[i][3]; const prevClose = ohlcv[i - 1][4]; ranges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose))); } return ranges.reduce((a, b) => a + b, 0) / ranges.length; }

async function getTradeSize(volatilityHigh) { const balance = await exchange.fetchBalance(); const free = balance.free?.USDT || 0; const tradable = Math.max(0, free - CONFIG.RESERVE_USDT); const size = volatilityHigh ? CONFIG.SAFE_USDT_SIZE : CONFIG.BASE_USDT_SIZE; return Math.max(0, Math.min(size, tradable)); }

async function analyzeSignal(symbol) { const ohlcv = await exchange.fetchOHLCV(symbol, '5m', undefined, 10); if (!ohlcv || ohlcv.length < 10) return null;

const closes = ohlcv.map(c => c[4]); const vols = ohlcv.map(c => c[5]); const last = closes[9]; const prev = closes[8]; const maxPrev = Math.max(...closes.slice(0, 9)); const avgVol = vols.slice(0, 9).reduce((a, b) => a + b, 0) / 9; const lastVol = vols[9];

const atr = calcATR(ohlcv); const atrPct = (atr / last) * 100;

const breakoutConfirmed = last > maxPrev && last > prev; const volumeBreakout = lastVol > avgVol * 1.35; const noChase = ((last - prev) / prev) * 100 < 0.7;

if (!(breakoutConfirmed && volumeBreakout && noChase)) return null;

return { volatilityHigh: atrPct > 0.45, strongMove: atrPct > 0.65 }; }

async function buySymbol(symbol, volatilityHigh, strongMove) { const ticker = await exchange.fetchTicker(symbol); const usdt = await getTradeSize(volatilityHigh); if (usdt <= 0 || !ticker.last) return false;

const amount = usdt / ticker.last; await exchange.createMarketBuyOrder(symbol, amount);

openPositions.set(symbol, { entry: ticker.last, high: ticker.last, amount, partialTaken: false, target: strongMove ? CONFIG.STRONG_TP : CONFIG.BASE_TP });

await sendTelegram(🥇 ADAPTIVE BUY ${symbol} @ ${ticker.last}); return true; }

async function syncPositionsFromBalance() { try { const balance = await exchange.fetchBalance(); for (const [symbol] of openPositions.entries()) { const base = symbol.split('/')[0]; const remaining = Number(balance.free?.[base] || 0) + Number(balance.used?.[base] || 0); if (remaining <= 0.0001) openPositions.delete(symbol); } } catch {} }

async function monitorPositions() { for (const [symbol, pos] of openPositions.entries()) { try { const ticker = await exchange.fetchTicker(symbol); const price = ticker.last; if (price > pos.high) pos.high = price;

const pnl = ((price - pos.entry) / pos.entry) * 100;
  const dd = ((pos.high - price) / pos.high) * 100;

  if (!pos.partialTaken && pnl >= CONFIG.PARTIAL_TP) {
    const half = pos.amount / 2;
    await exchange.createMarketSellOrder(symbol, half);
    pos.amount -= half;
    pos.partialTaken = true;
    await sendTelegram(`💰 PARTIAL SELL ${symbol} @ ${pnl.toFixed(2)}%`);
  }

  if (pnl >= pos.target || pnl <= -CONFIG.STOP_LOSS || dd >= CONFIG.TRAILING_STOP) {
    await exchange.createMarketSellOrder(symbol, pos.amount);
    openPositions.delete(symbol);

    if (pnl < 0) consecutiveLosses++;
    else consecutiveLosses = 0;

    if (consecutiveLosses >= 2) {
      pauseUntil = Date.now() + 15 * 60 * 1000;
      consecutiveLosses = 0;
      await sendTelegram('🛡️ Pause mode 15m after 2 losses');
    }

    await sendTelegram(`💰 FINAL SELL ${symbol} | ${pnl.toFixed(2)}%`);
  }
} catch {}

} }

async function mainLoop() { await sendTelegram('🥇 Adaptive Gold Bot V2 Started');

while (true) { try { if (Date.now() < pauseUntil) { console.log('⏸️ pause mode active'); } else if (openPositions.size < CONFIG.MAX_OPEN_POSITIONS) { for (const symbol of CONFIG.WATCHLIST) { if (openPositions.has(symbol)) continue; const signal = await analyzeSignal(symbol); if (!signal) continue; const bought = await buySymbol(symbol, signal.volatilityHigh, signal.strongMove); if (bought) break; } }

await syncPositionsFromBalance();
  await monitorPositions();
  console.log('🥇 adaptive heartbeat', { open: openPositions.size });
} catch (e) {
  console.error('LOOP ERROR', e.message);
}

await new Promise(r => setTimeout(r, CONFIG.SCAN_INTERVAL_MS));

} }

mainLoop();
