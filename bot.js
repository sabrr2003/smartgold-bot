const axios = require("axios");
const bs58 = require("bs58");
const { Connection, Keypair } = require("@solana/web3.js");

// =========================
// CONFIG
// =========================
const RPC =
  process.env.SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PRIVATE_KEY_RAW = process.env.SOLANA_PRIVATE_KEY;

const connection = new Connection(RPC, "confirmed");

let wallet = null;

// =========================
// TELEGRAM
// =========================
async function sendTelegram(msg) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text: msg,
      }
    );
  } catch (e) {
    console.log("telegram error:", e.message);
  }
}

// =========================
// WALLET LOADER
// =========================
function loadWallet() {
  try {
    if (!PRIVATE_KEY_RAW) {
      throw new Error("ENV key empty");
    }

    const raw = PRIVATE_KEY_RAW.trim();
    let secret;

    // الحالة 1: JSON ARRAY
    if (raw.startsWith("[")) {
      const arr = JSON.parse(raw);

      if (!Array.isArray(arr)) {
        throw new Error("JSON key is not array");
      }

      secret = Uint8Array.from(arr);
    } else {
      // الحالة 2: Base58
      secret = bs58.decode(raw);
    }

    console.log("secret length =", secret.length);

    if (secret.length === 64) {
      wallet = Keypair.fromSecretKey(secret);
    } else if (secret.length === 32) {
      wallet = Keypair.fromSeed(secret);
    } else {
      throw new Error(
        `invalid secret length ${secret.length}`
      );
    }

    console.log(
      "✅ wallet loaded:",
      wallet.publicKey.toBase58()
    );

    return wallet;
  } catch (e) {
    console.log("❌ wallet load failed:", e.message);
    return null;
  }
}

// =========================
// BUY MOCK
// =========================
async function executeBuy(symbol) {
  if (!wallet) {
    await sendTelegram(
      "⚠️ wallet load failed - monitor only"
    );
    return;
  }

  await sendTelegram(`🚀 REAL BUY ${symbol}`);
}

// =========================
// SCANNER
// =========================
async function scanDex() {
  await sendTelegram("🧠 scanning DEX Solana...");
  await executeBuy("SMART");
}

// =========================
// START
// =========================
async function start() {
  await sendTelegram("🔥 SMART GOLD BOT STARTED");

  loadWallet();

  setInterval(scanDex, 20000);
}

start();
