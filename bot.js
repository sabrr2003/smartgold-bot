const axios = require("axios");
const bs58 = require("bs58");
const { Connection, Keypair } = require("@solana/web3.js");

// ================= CONFIG =================
const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY";

const PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY || "";
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const BUY_AMOUNT_USD = 8.8; // يخلي 1.2$ رسوم
const FEE_RESERVE = 1.2;
const MIN_VOLUME = 50000;
const MIN_LIQUIDITY = 30000;
const TAKE_PROFIT = 25;
const STOP_LOSS = 10;

const connection = new Connection(RPC_URL, "confirmed");

// ================= TELEGRAM =================
async function sendTelegram(message) {
  try {
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
      console.log("❌ Telegram vars missing");
      return;
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

    const res = await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
    });

    console.log("✅ Telegram sent:", res.data.ok);
  } catch (error) {
    console.log(
      "❌ Telegram error:",
      error.response?.data || error.message
    );
  }
}

// ================= WALLET =================
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

  sendTelegram(
    `✅ Wallet loaded\n${wallet.publicKey.toBase58()}`
  );
} catch (e) {
  console.log("⚠️ wallet not loaded:", e.message);
  sendTelegram(`⚠️ monitor mode\n${e.message}`);
}

// ================= FILTER =================
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

// ================= BUY =================
async function buyToken(token) {
  try {
    if (!wallet) {
      console.log("⚠️ monitor mode - no wallet");
      return;
    }

    console.log(`🚀 BUY ${token.symbol}`);
    await sendTelegram(`🚀 BUY ${token.symbol}`);

    // =========================
    // هنا تخلي Jupiter swap الحقيقي
    // =========================

  } catch (e) {
    console.log("BUY ERROR:", e.message);
    await sendTelegram(
      `❌ BUY ERROR ${token.symbol}\n${e.message}`
    );
  }
}

// ================= SCANNER =================
async function scanDex() {
  try {
    console.log("🧠 scanning DEX Solana...");

    // مؤقتًا توكنات تجريبية
    const tokens = [
      {
        symbol: "PUMP",
        address: "token1",
        volume24h: 90000,
        liquidity: 70000,
        ageMinutes: 15,
        buys5m: 40,
        sells5m: 10,
      },
      {
        symbol: "DOGE2",
        address: "token2",
        volume24h: 20000,
        liquidity: 5000,
        ageMinutes: 1,
        buys5m: 2,
        sells5m: 4,
      },
    ];

    for (const token of tokens) {
      if (isGoodToken(token)) {
        await buyToken(token);
      }
    }
  } catch (e) {
    console.log("SCAN ERROR:", e.message);
    await sendTelegram(`❌ SCAN ERROR\n${e.message}`);
  }
}

// ================= START =================
(async () => {
  console.log("🔥 SMART GOLD BOT STARTED");
  await sendTelegram("🔥 SMART GOLD BOT STARTED");

  await scanDex();

  setInterval(async () => {
    await scanDex();
  }, 15000);
})();
