// ===============================
// CRYPTO MEME HUNTER BOT
// COPY-READY CLEAN VERSION
// Railway + OKX + KeepAlive
// ===============================

const ccxt = require('ccxt');
const http = require('http');

// ===== Railway Keep Alive =====
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('BOT LIVE');
}).listen(process.env.PORT || 3000);

// ===== API KEYS =====
const OKX_API_KEY = process.env.OKX_API_KEY || 'PUT_API_KEY_HERE';
const OKX_SECRET = process.env.OKX_SECRET || 'PUT_SECRET_HERE';
const OKX_PASSPHRASE = process.env.OKX_PASSPHRASE || 'PUT_PASSPHRASE_HERE';

const exchange = new ccxt.okx({
  apiKey: OKX_API_KEY,
  secret: OKX_SECRET,
  password: OKX_PASSPHRASE,
  enableRateLimit: true,
  options: { defaultType: 'spot' }
});

// ===== SETTINGS =====
const SYMBOLS = ['DOGE/USDT', 'PEPE/USDT', 'SOL/USDT', 'BONK/USDT'];
const LOOP_MS = 5000;
const HEARTBEAT_MS = 5 * 60 * 1000;
const ENTRY_BALANCE_USE = 0.95;
const STOP_LOSS_PCT = -1.0;
const TRAIL_TRIGGER_PCT = 1.2;
const TRAIL_GIVEBACK_PCT = 0.5;
const DAILY_MAX_LOSSES = 3;

let position = null;
let peakPnl = 0;
let lastHeartbeat = 0;
let lossCount = 0;
let lastDay = new Date().getUTCDate();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function heartbeat() {
  const now = Date.now();
  if (now - lastHeartbeat >= HEARTBEAT_MS) {
    lastHeartbeat = now;
    console.log('💓 BOT WORKING', new Date().toISOString());
  }
}

function resetDailyLosses() {
  const day = new Date().getUTCDate();
  if (day !== lastDay) {
    lastDay = day;
    lossCount = 0;
  }
}

async function getBreakoutSignal(symbol) {
  const candles = await exchange.fetchOHLCV(symbol, '5m', undefined, 40);
  if (!candles || candles.length < 30) return false;

  const closes = candles.map(c => c[4]);
  const highs = candles.map(c => c[2]);
  const volumes = candles.map(c => c[5]);

  const ema9 = closes.slice(-9).reduce((a, b) => a + b, 0) / 9;
  const ema21 = closes.slice(-21).reduce((a, b) => a + b, 0) / 21;

  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const rangeHigh = Math.max(...highs.slice(-8, -1));
  const breakout = last > rangeHigh;

  const avgVol = volumes.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const volSpike = volumes[volumes.length - 1] > avgVol * 1.4;

  return ema9 > ema21 && last > prev && breakout && volSpike;
}

async function scanBestSymbol() {
  for (const symbol of SYMBOLS) {
    try {
      const signal = await getBreakoutSignal(symbol);
      if (signal) return symbol;
    } catch (err) {
      console.log('⚠️ scan fail', symbol, err.message);
    }
  }
  return null;
}

async function buyFull(symbol) {
  const balance = await exchange.fetchBalance();
  const usdt = Number(balance.free.USDT || 0) * ENTRY_BALANCE_USE;

  if (usdt < 5) {
    console.log('⚠️ no enough USDT');
    return;
  }

  const ticker = await exchange.fetchTicker(symbol);
  const price = ticker.last;

  let amount = usdt / price;
  amount = Number(exchange.amountToPrecision(symbol, amount));

  if (!amount || amount <= 0) return;

  await exchange.createMarketBuyOrder(symbol, amount);

  position = { symbol, entry: price };
  peakPnl = 0;

  console.log(`🚀 FULL BUY ${symbol} @ ${price}`);
}

async function sellAll(reason) {
  if (!position) return;

  const symbol = position.symbol;
  const base = symbol.split('/')[0];
  const balance = await exchange.fetchBalance();

  let amount = Number(balance.free[base] || 0);
  amount = Number(exchange.amountToPrecision(symbol, amount));

  if (!amount || amount <= 0) {
    position = null;
    return;
  }

  await exchange.createMarketSellOrder(symbol, amount);
  console.log(`✅ FULL SELL ${symbol} | ${reason}`);

  if (reason.includes('SL')) lossCount += 1;

  position = null;
  peakPnl = 0;
}

async function manageOpenPosition() {
  if (!position) return;

  const ticker = await exchange.fetchTicker(position.symbol);
  const pnl = ((ticker.last - position.entry) / position.entry) * 100;

  if (pnl > peakPnl) peakPnl = pnl;

  if (pnl <= STOP_LOSS_PCT) {
    await sellAll(`SL ${pnl.toFixed(2)}%`);
    return;
  }

  if (peakPnl >= TRAIL_TRIGGER_PCT && pnl <= peakPnl - TRAIL_GIVEBACK_PCT) {
    await sellAll(`TRAIL ${pnl.toFixed(2)}%`);
  }
}

async function main() {
  await exchange.loadMarkets();
  console.log('🦈 CRYPTO MEME HUNTER STARTED');

  while (true) {
    try {
      heartbeat();
      resetDailyLosses();

      if (lossCount >= DAILY_MAX_LOSSES) {
        console.log('🛑 DAILY LOSS LOCK');
        await sleep(LOOP_MS);
        continue;
      }

      if (!position) {
        const symbol = await scanBestSymbol();
        if (symbol) await buyFull(symbol);
      } else {
        await manageOpenPosition();
      }
    } catch (err) {
      console.log('❌ LOOP ERROR', err.message);
    }

    await sleep(LOOP_MS);
  }
}

main();
