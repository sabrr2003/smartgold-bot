const axios = require("axios");
const { Connection, Keypair } = require("@solana/web3.js");

// ================= CONFIG =================
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
    let raw =
      process.env.PRIVATE_KEY ||
      process.env.SOLANA_PRIVATE_KEY ||
      "";

    if (!raw) throw new Error("PRIVATE_KEY missing");

    // تنظيف الصيغة
    raw = String(raw)
      .replace(/\[/g, "")
      .replace(/\]/g, "")
      .replace(/،/g, ",")
      .replace(/\s+/g, "")
      .trim();

    const arr = raw
      .split(",")
      .map((x) => Number(x))
      .filter((x) => !isNaN(x));

    if (arr.length !== 64) {
      throw new Error(
        `invalid key length: ${arr.length}`
      );
    }

    const secret = Uint8Array.from(arr);

    wallet = Keypair.fromSecretKey(secret);

    console.log(
      "wallet loaded:",
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

  try {
    const balance = await connection.getBalance(
      wallet.publicKey
    );

    const sol = balance / 1e9;

    await sendTelegram(
      `🚀 REAL BUY ${symbol}\n👛 ${wallet.publicKey.toBase58()}\n💰 ${sol} SOL`
    );
  } catch (e) {
    await sendTelegram(
      `❌ buy failed: ${e.message}`
    );
  }
}

// ================= SCAN =================
async function scanDex() {
  try {
    await sendTelegram("🧠 scanning DEX Solana...");

    // توكن تجريبي
    const token = {
      symbol: "SMART",
      liquidity: 15000,
      volume: 30000,
      age: 2,
    };

    // فلتر قوي
    if (
      token.liquidity >= 10000 &&
      token.volume >= 20000 &&
      token.age <= 5
    ) {
      await executeBuy(token.symbol);
    } else {
      await sendTelegram("⚠️ token rejected");
    }
  } catch (e) {
    await sendTelegram(
      `❌ scan error: ${e.message}`
    );
  }
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
      `✅ wallet loaded successfully\n👛 ${wallet.publicKey.toBase58()}\n💰 ${balance / 1e9} SOL`
    );
  }

  setInterval(scanDex, 20000);
}

start();
