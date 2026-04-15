const axios = require("axios");
const bs58 = require("bs58");
const { Keypair, Connection, PublicKey } = require("@solana/web3.js");

// ================= CONFIG =================
const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY";

const PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY || "";
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const connection = new Connection(RPC_URL, "confirmed");

// ================= TELEGRAM =================
async function sendTelegram(msg) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;

  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text: msg,
      }
    );
  } catch (e) {
    console.log("Telegram error:", e.message);
  }
}

// ================= WALLET LOAD =================
let wallet = null;

try {
  if (!PRIVATE_KEY) throw new Error("missing private key");

  let secret;

  if (PRIVATE_KEY.startsWith("[")) {
    secret = Uint8Array.from(JSON.parse(PRIVATE_KEY));
  } else {
    secret = bs58.decode(PRIVATE_KEY);
  }

  wallet = Keypair.fromSecretKey(secret);

  console.log("✅ wallet loaded successfully");
  console.log("Wallet:", wallet.publicKey.toBase58());

  sendTelegram(`✅ WALLET LOADED\n${wallet.publicKey.toBase58()}`);
} catch (e) {
  console.log("⚠️ wallet not loaded:", e.message);
  sendTelegram(`⚠️ Monitor mode only\n${e.message}`);
}

// ================= BUY SETTINGS =================
const BUY_AMOUNT_USD = 8.8; // يخلي 1.2$ رسوم احتياط
const FEE_RESERVE = 1.2;
const MIN_VOLUME = 50000;
const MIN_LIQUIDITY = 30000;
const TAKE_PROFIT = 25;
const STOP_LOSS = 10;

// ================= TOKEN FILTER =================
function isGoodToken(token) {
  if (!token) return false;

  const volume = token.volume24h || 0;
  const liquidity = token.liquidity || 0;
  const age = token.ageMinutes || 9999;
  const buys = token.buys5m || 0;
  const sells = token.sells5m || 0;

  if (volume < MIN_VOLUME) return false;
  if (liquidity < MIN_LIQUIDITY) return false;
  if (age < 3) return false;
  if (buys <= sells) return false;

  return true;
}

// ================= BUY FUNCTION =================
async function buyToken(tokenAddress, symbol) {
  if (!wallet) {
    console.log("⚠️ monitor mode - no wallet");
    return;
  }

  try {
    console.log(`🚀 BUY ${symbol}`);
    await sendTelegram(`🚀 REAL BUY ${symbol}`);

    // هنا تربط Jupiter swap الحقيقي
    // swap transaction goes here

  } catch (e) {
    console.log("BUY ERROR:", e.message);
    await sendTelegram(`❌ BUY ERROR ${symbol}\n${e.message}`);
  }
}

// ================= DEX SCANNER =================
async function scanDex() {
  try {
    console.log("🧠 scanning DEX Solana...");

    // هنا تجيب توكنات DEX من API
    // مثال Jupiter / Birdeye / Dexscreener

    const fakeTokens = [
      {
        symbol: "PUMP",
        address: "token123",
        volume24h: 90000,
        liquidity: 60000,
        ageMinutes: 10,
        buys5m: 40,
        sells5m: 10,
      },
    ];

    for (const token of fakeTokens) {
      if (isGoodToken(token)) {
        await buyToken(token.address, token.symbol);
      }
    }
  } catch (e) {
    console.log("SCAN ERROR:", e.message);
    await sendTelegram(`❌ SCAN ERROR\n${e.message}`);
  }
}

// ================= START =================
console.log("🔥 SMART GOLD BOT STARTED");
sendTelegram("🔥 SMART GOLD BOT STARTED");

setInterval(scanDex, 15000);
