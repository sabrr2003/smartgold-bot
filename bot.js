const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
const { Connection, Keypair } = require("@solana/web3.js");
const bs58 = require("bs58");

// ===== ENV =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  "https://mainnet.helius-rpc.com/?api-key=b24fa717-c2d7-425d-9b3e-9b4df931c04f";

const PRIVATE_KEY =
  process.env.SOLANA_PRIVATE_KEY ||
  "PUT_YOUR_BASE58_PRIVATE_KEY_HERE";

// ===== SAFE INIT =====
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
const connection = new Connection(RPC_URL, "confirmed");

let wallet = null;
try {
  wallet = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
  console.log("✅ wallet loaded");
} catch (e) {
  console.log("⚠️ wallet not loaded, running in monitor mode");
}

// ===== CONFIG =====
const CONFIG = {
  feeReserveUsd: 1.2,
  buyUsdMin: 5,
  maxBuyUsd: 10,

  minLiquidity: 80000,
  minVolume5m: 150000,
  minPriceChange: 4,
  minBuysRatio: 1.4,
  minTxns5m: 120,

  maxTopHolderPct: 18,
  minAgeMinutes: 3,
  maxAgeHours: 24,

  takeProfit: 12,
  stopLoss: -4,
  trailFrom: 8,
  trailDrop: 1,

  scanMs: 3000,
};

const seen = new Set();
const positions = new Map();

// ===== HELPERS =====
function send(msg) {
  if (!CHAT_ID) return;
  bot.sendMessage(CHAT_ID, msg).catch(() => {});
}

function ageMinutes(pair) {
  const created = pair.pairCreatedAt || Date.now();
  return (Date.now() - created) / 60000;
}

// ===== FILTERS =====
function whaleScore(pair) {
  const buys = pair.txns?.m5?.buys || 0;
  const sells = pair.txns?.m5?.sells || 0;
  const vol = pair.volume?.m5 || 0;
  let score = 0;

  if (buys >= 80) score += 30;
  if (buys > sells * 1.8) score += 25;
  if (vol >= 250000) score += 25;
  if ((pair.liquidity?.usd || 0) >= 120000) score += 20;

  return score;
}

function antiScam(pair) {
  const liq = pair.liquidity?.usd || 0;
  const vol = pair.volume?.m5 || 0;
  const chg = pair.priceChange?.m5 || 0;
  const buys = pair.txns?.m5?.buys || 0;
  const sells = pair.txns?.m5?.sells || 1;
  const txns = buys + sells;
  const ratio = buys / sells;
  const ageMin = ageMinutes(pair);
  const whale = whaleScore(pair);

  return (
    liq >= CONFIG.minLiquidity &&
    vol >= CONFIG.minVolume5m &&
    chg >= CONFIG.minPriceChange &&
    ratio >= CONFIG.minBuysRatio &&
    txns >= CONFIG.minTxns5m &&
    ageMin >= CONFIG.minAgeMinutes &&
    ageMin <= CONFIG.maxAgeHours * 60 &&
    whale >= 55
  );
}

// ===== DISCOVER DEX SOLANA =====
async function fetchDexSolanaPairs() {
  const url = "https://api.dexscreener.com/latest/dex/search/?q=solana";
  const { data } = await axios.get(url, { timeout: 10000 });

  return (data.pairs || [])
    .filter((p) => p.chainId === "solana")
    .slice(0, 250);
}

// ===== BUY (MONITOR / PAPER) =====
async function executeBuy(pair) {
  const walletUsd = 100;
  const spend = Math.min(
    CONFIG.maxBuyUsd,
    Math.max(0, walletUsd - CONFIG.feeReserveUsd)
  );

  if (spend < CONFIG.buyUsdMin) return;

  positions.set(pair.pairAddress, {
    symbol: pair.baseToken.symbol,
    entry: Number(pair.priceUsd),
    peak: Number(pair.priceUsd),
    amount: spend,
  });

  send(
    `🚀 BUY ${pair.baseToken.symbol}\n💵 ${spend.toFixed(
      2
    )}$\n🛡️ passed filters`
  );
}

// ===== SELL (MONITOR / PAPER) =====
async function monitorPositions(pairs) {
  for (const pair of pairs) {
    const pos = positions.get(pair.pairAddress);
    if (!pos) continue;

    const price = Number(pair.priceUsd);
    const pnl = ((price - pos.entry) / pos.entry) * 100;

    if (price > pos.peak) pos.peak = price;
    const drawdown = ((price - pos.peak) / pos.peak) * 100;

    if (
      pnl >= CONFIG.takeProfit ||
      pnl <= CONFIG.stopLoss ||
      (pnl >= CONFIG.trailFrom &&
        drawdown <= -CONFIG.trailDrop)
    ) {
      positions.delete(pair.pairAddress);
      send(`💰 SELL ${pos.symbol}\n📈 ${pnl.toFixed(2)}%`);
    }
  }
}

// ===== MAIN LOOP =====
async function scanLoop() {
  try {
    const pairs = await fetchDexSolanaPairs();

    for (const pair of pairs) {
      const id = pair.pairAddress;
      if (seen.has(id)) continue;
      seen.add(id);

      if (antiScam(pair)) {
        await executeBuy(pair);
      }
    }

    await monitorPositions(pairs);
  } catch (e) {
    send(`❌ scanner error: ${e.message}`);
  }
}

send("👹 MONSTER ULTRA STARTED");
setInterval(scanLoop, CONFIG.scanMs);
scanLoop();
