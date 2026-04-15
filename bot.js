const axios = require("axios");
const bs58Module = require("bs58");
const bs58 = bs58Module.default || bs58Module;
const { Keypair, Connection } = require("@solana/web3.js");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID?.trim();
const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY?.trim();
const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL?.trim() ||
  "https://api.mainnet-beta.solana.com";

const connection = new Connection(SOLANA_RPC_URL, "confirmed");

let wallet = null;

// ================= TELEGRAM =================
async function sendTelegram(msg) {
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

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

// ================= WALLET =================
function loadWallet() {
  try {
    const pk = SOLANA_PRIVATE_KEY;

    if (!pk) {
      console.log("⚠️ wallet not loaded: missing private key");
      return null;
    }

    let secret;

    // أولاً نجرب JSON array
    try {
      secret = Uint8Array.from(JSON.parse(pk));
    } catch {
      // إذا فشل نجرب Base58 بعد تنظيف المسافات
      const cleanPk = pk.replace(/\s/g, "");
      secret = Uint8Array.from(bs58.decode(cleanPk));
    }

    wallet = Keypair.fromSecretKey(secret);

    console.log("💰 wallet loaded:", wallet.publicKey.toBase58());
    return wallet;
  } catch (e) {
    console.log("⚠️ monitor mode", e.message);
    return null;
  }
}

wallet = loadWallet();

// ================= FILTER =================
function strongFilter(token) {
  return (
    token.liquidity > 100000 &&
    token.volume > 50000 &&
    token.change > 5
  );
}

// ================= SCANNER =================
async function scanDexSolana() {
  try {
    console.log("🧠 scanning DEX Solana...");
    await sendTelegram("🧠 scanning DEX Solana...");

    // 🔥 مثال عملة جديدة (بدلها بربط API المنصة)
    const token = {
      symbol: "TEST",
      price: 0.0012,
      liquidity: 150000,
      volume: 90000,
      change: 12.5,
    };

    if (!strongFilter(token)) return;

    // monitor mode
    if (!wallet) {
      await sendTelegram("⚠️ monitor mode - wallet not loaded");
      return;
    }

    // REAL BUY PLACEHOLDER
    console.log(`🚀 REAL BUY ${token.symbol} @ ${token.price}`);
    await sendTelegram(
      `🚀 REAL BUY ${token.symbol}\n💵 ${token.price}`
    );

  } catch (e) {
    console.log("scan error:", e.message);
    await sendTelegram(`❌ scan error ${e.message}`);
  }
}

// ================= MAIN =================
async function main() {
  console.log("🔥 SMART GOLD BOT STARTED");
  await sendTelegram("🔥 SMART GOLD BOT STARTED");

  setInterval(scanDexSolana, 20000);
}

main();
