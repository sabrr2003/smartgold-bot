const axios = require("axios");
const { Connection, Keypair } = require("@solana/web3.js");

// ================= CONFIG =================
const RPC =
  process.env.SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;

const connection = new Connection(RPC, "confirmed");

// خلي wallet global
let wallet;

// ================= TELEGRAM =================
async function sendTelegram(msg) {
  if (!TG_TOKEN || !TG_CHAT) return;

  try {
    await axios.post(
      `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
      {
        chat_id: TG_CHAT,
        text: msg,
      }
    );
  } catch (e) {
    console.log("telegram:", e.message);
  }
}

// ================= WALLET =================
function loadWallet() {
  try {
    const raw = process.env.SOLANA_PRIVATE_KEY;

    if (!raw) {
      throw new Error("SOLANA_PRIVATE_KEY missing");
    }

    const arr = JSON.parse(raw.trim());
    const secret = Uint8Array.from(arr);

    if (secret.length !== 64) {
      throw new Error(
        `invalid key length ${secret.length}`
      );
    }

    wallet = Keypair.fromSecretKey(secret);

    console.log(
      "✅ wallet loaded:",
      wallet.publicKey.toBase58()
    );

    return true;
  } catch (e) {
    console.log("❌ wallet error:", e.message);
    wallet = null;
    return false;
  }
}

// ================= BUY =================
async function executeBuy(symbol) {
  if (!wallet) {
    await sendTelegram(
      "⚠️ wallet load failed - monitor only"
    );
    return;
  }

  await sendTelegram(`🚀 REAL BUY ${symbol}`);
}

// ================= SCANNER =================
async function scanDex() {
  await sendTelegram("🧠 scanning DEX Solana...");

  // test fake token
  const token = {
    symbol: "SMART",
  };

  await executeBuy(token.symbol);
}

// ================= START =================
async function start() {
  await sendTelegram("🔥 SMART GOLD BOT STARTED");

  const loaded = loadWallet();

  if (!loaded) {
    await sendTelegram(
      "⚠️ wallet init failed at startup"
    );
  }

  setInterval(async () => {
    await scanDex();
  }, 20000);
}

start();
