const ccxt = require("ccxt");
const http = require("http");
const fetch = global.fetch;

// ===== TELEGRAM =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
      }
    );
  } catch (e) {
    console.log("telegram fail", e.message);
  }
}

// ===== KEEP ALIVE =====
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("DEX SOLANA FULL TAB BOT");
  })
  .listen(process.env.PORT || 3000);

// ===== OKX SPOT =====
const exchange = new ccxt.okx({
  apiKey: process.env.OKX_API_KEY,
  secret: process.env.OKX_SECRET_KEY,
  password: process.env.OKX_API_PASSPHRASE,
  enableRateLimit: true,
  options: { defaultType: "spot" },
});

// ===== SETTINGS =====
let SYMBOLS = [];
let lastRefresh = 0;
let position = null;
let peakPnl = 0;
let lastHeartbeat = 0;
const cooldowns = {};

const LOOP_MS = 5000;
const HEARTBEAT_MS = 5 * 60 * 1000;
const REFRESH_SYMBOLS_MS = 5 * 60 * 1000;

const USDT_RESERVE = 1;
const MIN_BREAKOUT_PCT = 0.3;
const MIN_VOL_BOOST = 1.15;
const STOP_LOSS_PCT = -2.5;
const TRAIL_TRIGGER_PCT = 1.2;
const TRAIL_DROP_PCT = 0.7;
const COOLDOWN_MS = 15 * 60 * 1000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function heartbeat() {
  const now = Date.now();

  if (now - lastHeartbeat >= HEARTBEAT_MS) {
    lastHeartbeat = now;

    await sendTelegram(
      `💓 BOT WORKING | watching ${SYMBOLS.length} Solana DEX spot pairs`
    );
  }
}

// ===== LOAD DEX SOLANA + MATCH SPOT =====
async function refreshDexSolanaSymbols() {
  const now = Date.now();

  if (
    now - lastRefresh < REFRESH_SYMBOLS_MS &&
    SYMBOLS.length
  ) {
    return;
  }

  lastRefresh = now;

  try {
    const res = await fetch(
      "https://web3.okx.com/api/v6/dex/aggregator/all-tokens?chainIndex=501"
    );

    const json = await res.json();
    const list = json.data || [];

    const allSpot = Object.keys(exchange.markets).filter(
      (s) => s.endsWith("/USDT")
    );

    const dexBases = new Set(
      list.map((t) => String(t.tokenSymbol).toUpperCase())
    );

    SYMBOLS = allSpot.filter((pair) => {
      const base = pair.split("/")[0].toUpperCase();
      return dexBases.has(base);
    });

    await sendTelegram(
      `🧠 Loaded ${SYMBOLS.length} DEX Solana spot pairs`
    );
  } catch (e) {
    console.log("refresh token list fail", e.message);
    await sendTelegram(`❌ TOKEN LOAD FAIL ${e.message}`);
  }
}

async function getSignal(symbol) {
  const candles = await exchange.fetchOHLCV(
    symbol,
    "5m",
    undefined,
    30
  );

  if (!candles || candles.length < 20) return false;

  const closes = candles.map((c) => c[4]);
  const highs = candles.map((c) => c[2]);
  const volumes = candles.map((c) => c[5]);

  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const rangeHigh = Math.max(...highs.slice(-8, -1));

  const breakoutPct =
    ((last - rangeHigh) / rangeHigh) * 100;

  const avgVol =
    volumes.slice(-10, -1).reduce((a, b) => a + b, 0) / 9;

  const volBoost =
    volumes[volumes.length - 1] / avgVol;

  return (
    last > prev &&
    breakoutPct >= MIN_BREAKOUT_PCT &&
    volBoost >= MIN_VOL_BOOST
  );
}

async function scanBestSymbol() {
  const now = Date.now();

  for (const symbol of SYMBOLS) {
    const cd = cooldowns[symbol] || 0;
    if (now - cd < COOLDOWN_MS) continue;

    try {
      const signal = await getSignal(symbol);
      if (signal) return symbol;
    } catch (e) {
      console.log("scan fail", symbol, e.message);
    }
  }

  return null;
}

async function buyFull(symbol) {
  const balance = await exchange.fetchBalance();
  const freeUsdt = Number(balance.free.USDT || 0);

  const usdtToUse = Math.max(
    0,
    freeUsdt - USDT_RESERVE
  );

  if (usdtToUse < 5) return;

  const ticker = await exchange.fetchTicker(symbol);
  const price = ticker.last;

  let amount = usdtToUse / price;
  amount = Number(
    exchange.amountToPrecision(symbol, amount)
  );

  if (!amount || amount <= 0) return;

  await exchange.createMarketBuyOrder(symbol, amount);

  position = {
    symbol,
    entry: price,
  };

  peakPnl = 0;

  await sendTelegram(
    `🚀 REAL BUY ${symbol}\n💵 ${usdtToUse.toFixed(
      2
    )} USDT\n💸 reserved 1 USDT`
  );
}

async function sellAll(reason) {
  if (!position) return;

  const symbol = position.symbol;
  const base = symbol.split("/")[0];

  const balance = await exchange.fetchBalance();
  let amount = Number(balance.free[base] || 0);

  amount = Number(
    exchange.amountToPrecision(symbol, amount)
  );

  if (!amount || amount <= 0) {
    position = null;
    return;
  }

  await exchange.createMarketSellOrder(symbol, amount);

  cooldowns[symbol] = Date.now();

  await sendTelegram(`💰 REAL SELL ${symbol}\n${reason}`);

  position = null;
  peakPnl = 0;
}

async function managePosition() {
  if (!position) return;

  const ticker = await exchange.fetchTicker(
    position.symbol
  );

  const pnl =
    ((ticker.last - position.entry) /
      position.entry) *
    100;

  if (pnl > peakPnl) peakPnl = pnl;

  if (pnl <= STOP_LOSS_PCT) {
    await sellAll(`🛑 STOP LOSS ${pnl.toFixed(2)}%`);
    return;
  }

  if (peakPnl >= TRAIL_TRIGGER_PCT) {
    const drop = peakPnl - pnl;

    if (drop >= TRAIL_DROP_PCT) {
      await sellAll(
        `🎯 TRAIL PROFIT ${pnl.toFixed(2)}%`
      );
    }
  }
}

async function main() {
  await exchange.loadMarkets();
  await sendTelegram("🤖 DEX SOLANA FULL TAB BOT STARTED");

  while (true) {
    try {
      await heartbeat();
      await refreshDexSolanaSymbols();

      if (!position) {
        const symbol = await scanBestSymbol();
        if (symbol) await buyFull(symbol);
      } else {
        await managePosition();
      }
    } catch (e) {
      console.log("LOOP ERROR", e.message);
      await sendTelegram(`❌ ERROR ${e.message}`);
    }

    await sleep(LOOP_MS);
  }
}

main();
