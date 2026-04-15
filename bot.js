// CRYPTO MEME HUNTER BOT - Railway + OKX
const ccxt = require('ccxt');

const exchange = new ccxt.okx({
  apiKey: process.env.OKX_API_KEY,
  secret: process.env.OKX_SECRET,
  password: process.env.OKX_PASSPHRASE,
  enableRateLimit: true,
  options: { defaultType: 'spot' }
});

const SYMBOLS = ['DOGE/USDT', 'PEPE/USDT', 'SOL/USDT', 'BONK/USDT'];
const LOOP_MS = 5000;
const RISK_FRACTION = 0.95;
const PROFIT_TRIGGER = 1.2;
const TRAILING_DROP = 0.5;
const STOP_LOSS = -0.8;
const DAILY_MAX_LOSSES = 3;

let position = null;
let peakPnl = 0;
let lossCount = 0;
let lastDay = new Date().getDate();

function resetDaily() {
  const day = new Date().getDate();
  if (day !== lastDay) {
    lastDay = day;
    lossCount = 0;
  }
}

async function getSignal(symbol) {
  const candles = await exchange.fetchOHLCV(symbol, '5m', undefined, 40);
  const closes = candles.map(c => c[4]);
  const highs = candles.map(c => c[2]);
  const vols = candles.map(c => c[5]);

  const ema9 = closes.slice(-9).reduce((a,b)=>a+b,0)/9;
  const ema21 = closes.slice(-21).reduce((a,b)=>a+b,0)/21;
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const breakout = last > Math.max(...highs.slice(-8, -1));
  const avgVol = vols.slice(-10).reduce((a,b)=>a+b,0)/10;
  const volSpike = vols[vols.length - 1] > avgVol * 1.4;

  return ema9 > ema21 && last > prev && breakout && volSpike;
}

async function scanBestCoin() {
  for (const symbol of SYMBOLS) {
    try {
      const ok = await getSignal(symbol);
      if (ok) return symbol;
    } catch (e) {
      console.log('scan fail', symbol, e.message);
    }
  }
  return null;
}

async function buy(symbol) {
  const balance = await exchange.fetchBalance();
  const usdt = Number(balance.free.USDT || 0) * RISK_FRACTION;
  if (usdt < 5) return;

  const ticker = await exchange.fetchTicker(symbol);
  let amount = usdt / ticker.last;
  amount = Number(exchange.amountToPrecision(symbol, amount));
  if (amount <= 0) return;

  await exchange.createMarketBuyOrder(symbol, amount);
  position = { symbol, entry: ticker.last };
  peakPnl = 0;
  console.log('🚀 BUY', symbol, ticker.last);
}

async function sell(reason) {
  if (!position) return;
  const symbol = position.symbol;
  const base = symbol.split('/')[0];
  const balance = await exchange.fetchBalance();
  let amount = Number(balance.free[base] || 0);
  amount = Number(exchange.amountToPrecision(symbol, amount));
  if (amount <= 0) return;

  await exchange.createMarketSellOrder(symbol, amount);
  console.log('✅ SELL', symbol, reason);
  if (reason.includes('SL')) lossCount += 1;
  position = null;
  peakPnl = 0;
}

async function managePosition() {
  const ticker = await exchange.fetchTicker(position.symbol);
  const pnl = ((ticker.last - position.entry) / position.entry) * 100;

  if (pnl > peakPnl) peakPnl = pnl;

  if (pnl <= STOP_LOSS) {
    await sell('SL ' + pnl.toFixed(2) + '%');
    return;
  }

  if (peakPnl >= PROFIT_TRIGGER && pnl <= peakPnl - TRAILING_DROP) {
    await sell('TRAIL ' + pnl.toFixed(2) + '%');
  }
}

async function main() {
  await exchange.loadMarkets();
  console.log('🦈 CRYPTO MEME HUNTER STARTED');

  while (true) {
    try {
      resetDaily();
      if (lossCount >= DAILY_MAX_LOSSES) {
        console.log('🛑 daily lock');
      } else if (!position) {
        const symbol = await scanBestCoin();
        if (symbol) await buy(symbol);
      } else {
        await managePosition();
      }
    } catch (e) {
      console.log('loop error', e.message);
    }

    await new Promise(r => setTimeout(r, LOOP_MS));
  }
}

main();
