const ccxt = require("ccxt");
const http = require("http");
const fetch = global.fetch;

// ===== TELEGRAM =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    });
  } catch {}
}

// ===== KEEP ALIVE =====
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("SOLANA SPOT AUTO SCANNER");
}).listen(process.env.PORT || 3000);

// ===== OKX =====
const exchange = new ccxt.okx({
  apiKey: process.env.OKX_API_KEY,
  secret: process.env.OKX_SECRET_KEY,
  password: process.env.OKX_API_PASSPHRASE,
  enableRateLimit: true,
  options: { defaultType: "spot" },
});

// ===== SETTINGS =====
let SYMBOLS = [];
let position = null;
let peakPnl = 0;
let lastRefresh = 0;
const cooldowns = {};

const LOOP_MS = 5000;
const REFRESH_MS = 5 * 60 * 1000;
const USDT_RESERVE = 1;
const STOP_LOSS_PCT = -2.5;
const TRAIL_TRIGGER_PCT = 1.2;
const TRAIL_DROP_PCT = 0.7;
const COOLDOWN_MS = 15 * 60 * 1000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ===== AUTO LOAD SOLANA/MEME SPOT =====
async function refreshSymbols() {
  const now = Date.now();
  if (now - lastRefresh < REFRESH_MS && SYMBOLS.length) return;
  lastRefresh = now;

  const markets = Object.values(exchange.markets);

  SYMBOLS = markets
    .filter((m) =>
      m.quote === "USDT" &&
      m.spot &&
      (
        (m.base && (
          m.base.includes("BONK") ||
          m.base.includes("WIF") ||
          m.base.includes("BOME") ||
          m.base.includes("POPCAT") ||
          m.base.includes("MEW") ||
          m.base.includes("MEME") ||
          m.base.includes("DOGS") ||
          m.base.includes("PEPE")
        )) ||
        (m.info && JSON.stringify(m.info).toUpperCase().includes("SOL"))
      )
    )
    .map((m) => m.symbol);

  await sendTelegram(`🧠 Loaded ${SYMBOLS.length} Solana/meme spot pairs`);
}

async function getSignal(symbol) {
  const candles = await exchange.fetchOHLCV(symbol, "5m", undefined, 30);
  if (!candles || candles.length < 20) return false;

  const closes = candles.map((c) => c[4]);
  const highs = candles.map((c) => c[2]);
  const volumes = candles.map((c) => c[5]);

  const last = closes.at(-1);
  const prev = closes.at(-2);
  const high = Math.max(...highs.slice(-8, -1));
  const breakoutPct = ((last - high) / high) * 100;

  const avgVol = volumes.slice(-10, -1).reduce((a, b) => a + b, 0) / 9;
  const volBoost = volumes.at(-1) / avgVol;

  return last > prev && breakoutPct >= 0.3 && volBoost >= 1.15;
}

async function scanBest() {
  const now = Date.now();

  for (const symbol of SYMBOLS) {
    if (now - (cooldowns[symbol] || 0) < COOLDOWN_MS) continue;

    try {
      if (await getSignal(symbol)) return symbol;
    } catch {}
  }

  return null;
}

async function buyFull(symbol) {
  const bal = await exchange.fetchBalance();
  const freeUsdt = Number(bal.free.USDT || 0);
  const use = Math.max(0, freeUsdt - USDT_RESERVE);
  if (use < 5) return;

  const ticker = await exchange.fetchTicker(symbol);
  let amount = use / ticker.last;
  amount = Number(exchange.amountToPrecision(symbol, amount));

  await exchange.createMarketBuyOrder(symbol, amount);

  position = { symbol, entry: ticker.last };
  peakPnl = 0;

  await sendTelegram(`🚀 REAL BUY ${symbol}\n💵 ${use.toFixed(2)} USDT`);
}

async function sellAll(reason) {
  if (!position) return;

  const base = position.symbol.split("/")[0];
  const bal = await exchange.fetchBalance();
  let amount = Number(bal.free[base] || 0);
  amount = Number(exchange.amountToPrecision(position.symbol, amount));

  if (amount > 0) {
    await exchange.createMarketSellOrder(position.symbol, amount);
  }

  cooldowns[position.symbol] = Date.now();
  await sendTelegram(`💰 REAL SELL ${position.symbol}\n${reason}`);

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

  if (peakPnl >= TRAIL_TRIGGER_PCT && peakPnl - pnl >= TRAIL_DROP_PCT) {
    await sellAll(`🎯 TRAIL ${pnl.toFixed(2)}%`);
  }
}

async function main() {
  await exchange.loadMarkets();
  await sendTelegram("🤖 SOLANA SPOT AUTO SCANNER STARTED");

  while (true) {
    try {
      await refreshSymbols();

      if (!position) {
        const symbol = await scanBest();
        if (symbol) await buyFull(symbol);
      } else {
        await managePosition();
      }
    } catch (e) {
      await sendTelegram(`❌ ${e.message}`);
    }

    await sleep(LOOP_MS);
  }
}

main();
