require("dotenv").config();

const axios = require("axios");
const bs58 = require("bs58");
const {
  Connection,
  Keypair,
  PublicKey,
} = require("@solana/web3.js");

// =========================
// ENV
// =========================
const RPC =
  process.env.SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const connection = new Connection(RPC, "confirmed");

let wallet = null;

// =========================
// TELEGRAM
// =========================
async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
      }
    );
  } catch (e) {
    console.log("Telegram error:", e.message);
  }
}

// =========================
// WALLET LOADER
// =========================
function loadWallet() {
  try {
    const pk = process.env.SOLANA_PRIVATE_KEY?.trim();

    if (!pk) {
      console.log("⚠️ wallet not loaded: missing private key");
      return null;
    }

    let secret;

    // JSON ARRAY
    try {
      secret = Uint8Array.from(JSON.parse(pk));
    } catch {
      const clean = pk.replace(/\s/g, "");
      secret = Uint8Array.from(bs58.decode(clean));
    }

    // دعم 32 و64
    if (secret.length === 32) {
      wallet = Keypair.fromSeed(secret);
    } else if (secret.length === 64) {
      wallet = Keypair.fromSecretKey(secret);
    } else {
      throw new Error(`invalid key length ${secret.length}`);
    }

    console.log(
      "💰 wallet loaded:",
      wallet.publicKey.toBase58()
    );

    return wallet;
  } catch (e) {
    console.log("⚠️ wallet not loaded:", e.message);
    return null;
  }
}

// =========================
// DEX SCANNER
// =========================
async function scanDex() {
  try {
    console.log("🧠 scanning DEX Solana...");
    await sendTelegram("🧠 scanning DEX Solana...");

    // حاليا محاكاة عملة جديدة
    const fakeToken = {
      symbol: "SMART",
      mint:
        "So11111111111111111111111111111111111111112",
      liquidity: 50000,
      volume: 120000,
    };

    const passed =
      fakeToken.liquidity > 20000 &&
      fakeToken.volume > 50000;

    if (!passed) return;

    await executeBuy(fakeToken);
  } catch (e) {
    console.log("scan error:", e.message);
  }
}

// =========================
// BUY EXECUTION
// =========================
async function executeBuy(token) {
  try {
    if (!wallet) {
      console.log("⚠️ monitor mode - wallet not loaded");
      await sendTelegram(
        "⚠️ monitor mode - wallet not loaded"
      );
      return;
    }

    console.log(`🚀 REAL BUY ${token.symbol}`);
    await sendTelegram(
      `🚀 REAL BUY ${token.symbol}\nMint: ${token.mint}`
    );

    // هنا لاحقاً نضيف Jupiter swap الحقيقي
  } catch (e) {
    console.log("buy error:", e.message);
  }
}

// =========================
// MAIN LOOP
// =========================
async function startBot() {
  console.log("🔥 SMART GOLD BOT STARTED");
  await sendTelegram("🔥 SMART GOLD BOT STARTED");

  loadWallet();

  setInterval(async () => {
    await scanDex();
  }, 20000);
}

startBot();
