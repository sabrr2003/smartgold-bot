const http = require("http");
const fetch = global.fetch;

// ===== TELEGRAM =====
const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN || "PUT_TELEGRAM_BOT_TOKEN";
const TELEGRAM_CHAT_ID =
  process.env.TELEGRAM_CHAT_ID || "PUT_CHAT_ID";

async function sendTelegram(text) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    });
  } catch (e) {
    console.log("telegram fail", e.message);
  }
}

// ===== KEEP ALIVE =====
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("OKX DEX LIVE");
}).listen(process.env.PORT || 3000);

// ===== SETTINGS =====
const LOOP_MS = 1000;
const MIN_PUMP = 3;
const MIN_LIQ = 500000;
const MAX_PRICE = 1;
const STOP_LOSS = -3;
const TRAIL_DROP = 1; // 1% from peak
const HEARTBEAT_MS = 5 * 60 * 1000;

// ضع توكنات الخانة اللي تريد يراقبها من OKX DEX Solana
const DEX_TAB_TOKENS = [
  "jellyjelly",
  "PUMPCADE",
  "SHDW",
  "pippin",
  "CLOUD",
];

let position = null;
let lastHeartbeat = 0;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function heartbeat() {
  const now = Date.now();
  if (now - lastHeartbeat >= HEARTBEAT_MS) {
    lastHeartbeat = now;
    sendTelegram("💓 OKX DEX LIVE FILTER WORKING");
  }
}

// ===== LIVE PRICE INFO =====
// هذا قالب live-ready: تربطه لاحقًا بـ market/price-info
async function fetchDexTokens() {
  // TODO: replace with real OKX DEX market price-info POST
  // https://web3.okx.com/api/v6/dex/market/price-info
  const seed = Date.now() % 10;

  return [
    { symbol: "jellyjelly", price: 0.045 + seed * 0.0001, change5m: 5.2, liquidity: 1200000 },
    { symbol: "PUMPCADE", price: 0.041 + seed * 0.0002, change5m: 14.6, liquidity: 4200000 },
    { symbol: "SHDW", price: 0.033 + seed * 0.00015, change5m: 11.8, liquidity: 5600000 },
    { symbol: "pippin", price: 0.026 + seed * 0.00005, change5m: 4.1, liquidity: 2100000 },
    { symbol: "CLOUD", price: 0.021 + seed * 0.00004, change5m: 3.8, liquidity: 1800000 },
  ];
}

function dynamicFilter(tokens) {
  return tokens
    .filter((t) => DEX_TAB_TOKENS.includes(t.symbol))
    .filter((t) => t.price <= MAX_PRICE)
    .filter((t) => t.change5m >= MIN_PUMP)
    .filter((t) => t.liquidity >= MIN_LIQ)
    .sort((a, b) => {
      const scoreA = a.change5m * Math.log10(a.liquidity);
      const scoreB = b.change5m * Math.log10(b.liquidity);
      return scoreB - scoreA;
    });
}

async function buyBest(token) {
  position = {
    symbol: token.symbol,
    entry: token.price,
    peak: token.price,
  };

  sendTelegram(`🚀 BUY ${token.symbol} @ ${token.price}`);
}

async function managePosition(tokens) {
  if (!position) return;

  const live = tokens.find((t) => t.symbol === position.symbol);
  if (!live) return;

  // update peak forever
  if (live.price > position.peak) {
    position.peak = live.price;
  }

  const pnl = ((live.price - position.entry) / position.entry) * 100;
  const dropFromPeak =
    ((position.peak - live.price) / position.peak) * 100;

  // stop loss
  if (pnl <= STOP_LOSS) {
    sendTelegram(`🛑 SL SELL ${position.symbol} ${pnl.toFixed(2)}%`);
    position = null;
    return;
  }

  // trailing from any peak, even 50%+
  if (dropFromPeak >= TRAIL_DROP) {
    sendTelegram(
      `💰 PEAK TRAIL SELL ${position.symbol} PROFIT ${pnl.toFixed(2)}%`
    );
    position = null;
  }
}

async function main() {
  sendTelegram("😈 OKX DEX LIVE PEAK HUNTER STARTED");

  while (true) {
    try {
      heartbeat();

      const tokens = await fetchDexTokens();
      const filtered = dynamicFilter(tokens);

      if (!position && filtered.length > 0) {
        await buyBest(filtered[0]);
      } else {
        await managePosition(tokens);
      }
    } catch (e) {
      console.log("loop error", e.message);
    }

    await sleep(LOOP_MS);
  }
}

main();
