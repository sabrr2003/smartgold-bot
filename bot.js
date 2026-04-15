const axios = require("axios");
const bs58 = require("bs58");
const { Connection, Keypair } = require("@solana/web3.js");

const RPC =
  process.env.SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;

const connection = new Connection(RPC, "confirmed");

let wallet = null;

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
    console.log("telegram error:", e.message);
  }
}

// ================= WALLET =================
function loadWallet() {
  try {
    let raw = process.env.SOLANA_PRIVATE_KEY;

    if (!raw) {
      throw new Error("SOLANA_PRIVATE_KEY missing");
    }

    raw = raw.trim();

    let secret;

    // JSON Array
    if (raw.startsWith("[")) {
      const arr = JSON.parse(raw);
      secret = Uint8Array.from(arr);
    }
    // CSV numbers
    else if (raw.includes(",")) {
      const arr = raw
        .split(",")
        .map((x) => Number(x.trim()));
      secret = Uint8Array.from(arr);
    }
    // base58
    else {
      secret = bs58.decode(raw);
    }

    if (secret.length !== 64) {
      throw new Error(
        `secret length invalid ${secret.length}`
      );
    }

    wallet = Keypair.fromSecretKey(secret);

    console.log(
      "✅ wallet loaded:",
      wallet.publicKey.toBase58()
    );

    return true;
  } catch (e) {
    console.log("wallet error:", e.message);
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

  await sendTelegram(
    `🚀 REAL BUY ${symbol}\n👛 ${wallet.publicKey.toBase58()}`
  );
}

// ================= SCAN =================
async function scanDex() {
  await sendTelegram("🧠 scanning DEX Solana...");

  const token = {
    symbol: "SMART",
  };

  await executeBuy(token.symbol);
}

// ================= START =================
async function start() {
  await sendTelegram("🔥 SMART GOLD BOT STARTED");

  const ok = loadWallet();

  if (!ok) {
    await sendTelegram(
      "⚠️ wallet init failed at startup"
    );
  }

  setInterval(scanDex, 20000);
}

start();
