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
    console.log("telegram:", e.message);
  }
}

// ================= WALLET =================
function loadWallet() {
  try {
    let raw =
      process.env.SOLANA_PRIVATE_KEY ||
      process.env.PRIVATE_KEY ||
      process.env.WALLET_KEY ||
      "";

    if (!raw || raw.length < 10) {
      throw new Error("empty env key");
    }

    raw = String(raw).trim();

    let secret;

    // JSON ARRAY
    if (raw.startsWith("[")) {
      secret = Uint8Array.from(JSON.parse(raw));
    }
    // CSV FORMAT
    else if (raw.includes(",")) {
      secret = Uint8Array.from(
        raw.split(",").map((x) => Number(x.trim()))
      );
    }
    // BASE58
    else {
      secret = bs58.decode(raw);
    }

    if (secret.length !== 64) {
      throw new Error(
        `invalid secret length ${secret.length}`
      );
    }

    wallet = Keypair.fromSecretKey(secret);

    console.log(
      "wallet loaded:",
      wallet.publicKey.toBase58()
    );

    return true;
  } catch (e) {
    console.log("wallet load error:", e.message);
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
  await executeBuy("SMART");
}

// ================= START =================
async function start() {
  await sendTelegram("🔥 SMART GOLD BOT STARTED");

  const ok = loadWallet();

  if (!ok) {
    await sendTelegram(
      "⚠️ wallet init failed at startup"
    );
  } else {
    const balance = await connection.getBalance(
      wallet.publicKey
    );

    await sendTelegram(
      `✅ wallet loaded\n👛 ${wallet.publicKey.toBase58()}\n💰 ${balance / 1e9} SOL`
    );
  }

  setInterval(scanDex, 20000);
}

start();
