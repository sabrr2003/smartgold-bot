const ccxt = require("ccxt");
const http = require("http");
const fetch = global.fetch;

// ===== TELEGRAM =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(text) {
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
      }),
    });
  } catch (e) {
    console.log("telegram fail", e.message);
  }
}

// ===== KEEP ALIVE =====
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("BOT LIVE");
}).listen(process.env.PORT || 3000);

// ===== OKX SPOT =====
const exchange = new ccxt.okx({
  apiKey: process.env.OKX_API_KEY,
  secret: process.env.OKX_SECRET,
  password: process.env.OKX_PASSPHRASE,
  enableRateLimit: true,
  options: {
    defaultType: "spot",
  },
});

// ===== SETTINGS =====
const LOOP_MS = 4000;
const USDT_RESERVE = 1; // leave 1$ for fees
const FULL_BUY_PCT = 0.98;
const STOP_LOSS_PCT = -2.0;
const TRAIL_DROP_FROM_PEAK = 1.0;

let pairs = [];
let position = null;
let peakPnl = 0;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function loadPairs() {
  const markets = await exchange.loadMarkets();
  pairs = Object.keys(markets).filter(
    (s) =>
      s.endsWith("/USDT") &&
      markets[s].spot &&
      markets[s].active
  );

  console.log(`Loaded ${pairs.length} full USDT spot pairs`);
  await sendTelegram(`🧠 Loaded ${pairs.length} full USDT spot pairs`);
}

async function getSignal(symbol) {
  const candles = await exchange.fetchOHLCV(symbol, "1m", undefined, 20);
  if (!candles || candles.length < 10) return false;

  const closes = candles.map((c) => c[4]);
  const highs = candles.map((c) => c[2]);
  const volumes = candles.map((c) => c[5]);

  const last = closes.at(-1);
  const prev = closes.at(-2);

  const high = Math.max(...highs.slice(-5, -1));
  const breakoutPct = ((last - high) / high) * 100;

  const avgVol = volumes.slice(-6, -1).reduce((a, b) => a + b, 0) / 5;
  const volBoost = volumes.at(-1) / avgVol;

  return last > prev && breakoutPct >= 0.15 && volBoost >= 1.05;
}

async function findBestSignal() {
  for (const symbol of pairs) {
    try {
      const ok = await getSignal(symbol);
      if (ok) return symbol;
    } catch (_) {}
  }
  return null;
}

async function buyFull(symbol) {
  const balance = await exchange.fetchBalance();
  const freeUsdt = Number(balance.free.USDT || 0);
  const usdtToUse = Math.max(0, (freeUsdt - USDT_RESERVE) * FULL_BUY_PCT);

  if (usdtToUse < 5) {
    await sendTelegram(`⚠️ USDT too low: ${freeUsdt}`);
    return;
  }

  const ticker = await exchange.fetchTicker(symbol);
  const price = ticker.last;

  let amount = usdtToUse / price;
  amount = Number(exchange.amountToPrecision(symbol, amount));
  if (!amount || amount <= 0) return;

  await exchange.createMarketBuyOrder(symbol, amount);

  position = {
    symbol,
    entry: price,
    amount,
  };
  peakPnl = 0;

  const msg = `🚀 REAL BUY ${symbol} @ ${price}`;
  console.log(msg);
  await sendTelegram(msg);
}

async function sellAll(reason) {
  if (!position) return;

  const base = position.symbol.split("/")[0];
  const balance = await exchange.fetchBalance();

  let amount = Number(balance.free[base] || 0);
  amount = Number(exchange.amountToPrecision(position.symbol, amount));
  if (!amount || amount <= 0) return;

  await exchange.createMarketSellOrder(position.symbol, amount);

  const msg = `💰 SELL ${position.symbol} | ${reason}`;
  console.log(msg);
  await sendTelegram(msg);

  position = null;
  peakPnl = 0;
}

async function managePosition() {
  if (!position) return;

  const ticker = await exchange.fetchTicker(position.symbol);
  const pnl = ((ticker.last - position.entry) / position.entry) * 100;

  if (pnl > peakPnl) peakPnl = pnl;

  if (pnl <= STOP_LOSS_PCT) {
    await sellAll(`🛑 STOP LOSS ${pnl.toFixed(2)}%`);
    return;
  }

  if (peakPnl > 0 && pnl <= peakPnl - TRAIL_DROP_FROM_PEAK) {
    await sellAll(`🎯 PEAK TRAIL ${pnl.toFixed(2)}% | peak ${peakPnl.toFixed(2)}%`);
  }
}

async function main() {
  await loadPairs();
  console.log("🤖 JABBAR FULL SPOT BOT STARTED");
  await sendTelegram("🤖 JABBAR FULL SPOT BOT STARTED");

  while (true) {
    try {
      if (!position) {
        const symbol = await findBestSignal();
        if (symbol) await buyFull(symbol);
      } else {
        await managePosition();
      }
    } catch (e) {
      console.log("loop error", e.message);
      await sendTelegram(`❌ ${e.message}`);
    }

    await sleep(LOOP_MS);
  }
}

main();
