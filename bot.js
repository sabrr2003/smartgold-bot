const axios = require("axios");
const {
  Keypair,
  Connection,
  VersionedTransaction,
  LAMPORTS_PER_SOL
} = require("@solana/web3.js");
const bs58 = require("bs58");
const TelegramBot = require("node-telegram-bot-api");

// ===============================
// 🔐 CONFIG
// ===============================
const CONFIG = {
  // تم وضع مفتاحك الخاص هنا مباشرة
  PRIVATE_KEY: "46UmsCPrM8M4tN4X3G6MvN5fN2W6kG6E9fD6f9L5fJ4n7b8V6C5x4z3a2S1qP",

  // تم وضع رابط Helius الخاص بك هنا
  SOLANA_RPC_URL: "https://mainnet.helius-rpc.com/?api-key=b24fa717-c2d7-425d-9b3e-9b4df931c04f",

  // ضع هنا التوكن والمعرف الخاص بتليجرام
  TELEGRAM_BOT_TOKEN: "",
  TELEGRAM_CHAT_ID: "",

  MIN_LIQUIDITY: 10000,
  MIN_VOLUME: 20000,
  MAX_TOKEN_AGE_MINUTES: 5,

  BUY_SOL_AMOUNT: 0.02,
  KEEP_FEE_SOL: 0.005,
  SLIPPAGE_BPS: 300
};

// ===============================
// TELEGRAM
// ===============================
const bot = new TelegramBot(CONFIG.TELEGRAM_BOT_TOKEN, {
  polling: false
});

async function sendTelegram(message) {
  try {
    if (!CONFIG.TELEGRAM_BOT_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) {
        console.log("Telegram output:", message);
        return;
    }
    await bot.sendMessage(CONFIG.TELEGRAM_CHAT_ID, message);
  } catch (e) {
    console.error("telegram error:", e.message);
  }
}

// ===============================
// PRIVATE KEY PARSER
// ===============================
function parsePrivateKey(raw) {
  if (!raw) throw new Error("PRIVATE_KEY is empty");
  const value = String(raw).trim();

  try {
    // JSON Format
    if (value.startsWith("[")) {
      const arr = JSON.parse(value);
      return Uint8Array.from(arr);
    }

    // CSV Format
    if (value.includes(",")) {
      return Uint8Array.from(
        value.replace(/،/g, ",").split(",").map((n) => Number(n.trim()))
      );
    }

    // Base58 Format (Most common)
    const decoded = bs58.decode(value);
    
    if (decoded.length === 64 || decoded.length === 32) {
      return decoded;
    }
    
    throw new Error(`Invalid length: ${decoded.length}`);
  } catch (err) {
    throw new Error("bad secret key size or invalid format");
  }
}

function loadWallet() {
  try {
    const secret = parsePrivateKey(CONFIG.PRIVATE_KEY);
    // إذا كان الطول 32، نحوله إلى 64 (Keypair الكامل)
    let wallet;
    if (secret.length === 32) {
        wallet = Keypair.fromSeed(secret);
    } else {
        wallet = Keypair.fromSecretKey(secret);
    }
    console.log("✅ wallet loaded:", wallet.publicKey.toBase58());
    return wallet;
  } catch (e) {
    console.error("❌ wallet failure:", e.message);
    return null;
  }
}

// ===============================
// SOLANA
// ===============================
const connection = new Connection(CONFIG.SOLANA_RPC_URL, "confirmed");
const wallet = loadWallet();

// ===============================
// FILTERS
// ===============================
function passesFilters(token) {
  return (
    token.liquidity >= CONFIG.MIN_LIQUIDITY &&
    token.volume >= CONFIG.MIN_VOLUME &&
    token.age <= CONFIG.MAX_TOKEN_AGE_MINUTES
  );
}

// ===============================
// REAL BUY
// ===============================
async function executeBuy(token) {
  try {
    if (!wallet) {
      await sendTelegram("⚠️ wallet load failed - monitor only");
      return;
    }

    const balance = await connection.getBalance(wallet.publicKey);
    const sol = balance / LAMPORTS_PER_SOL;

    if (sol < CONFIG.BUY_SOL_AMOUNT + CONFIG.KEEP_FEE_SOL) {
      await sendTelegram(`⚠️ insufficient SOL balance: ${sol.toFixed(4)}`);
      return;
    }

    const amount = Math.floor(CONFIG.BUY_SOL_AMOUNT * LAMPORTS_PER_SOL);

    const quote = await axios.get("https://quote-api.jup.ag/v6/quote", {
        params: {
          inputMint: "So11111111111111111111111111111111111111112",
          outputMint: token.mint,
          amount,
          slippageBps: CONFIG.SLIPPAGE_BPS
        }
    });

    const swap = await axios.post("https://quote-api.jup.ag/v6/swap", {
        quoteResponse: quote.data,
        userPublicKey: wallet.publicKey.toBase58(),
        wrapAndUnwrapSol: true
    });

    const tx = VersionedTransaction.deserialize(
      Buffer.from(swap.data.swapTransaction, "base64")
    );

    tx.sign([wallet]);

    const sig = await connection.sendTransaction(tx, {
      maxRetries: 3
    });

    await sendTelegram(`🚀 REAL BUY ${token.symbol}\n🔗 https://solscan.io/tx/${sig}`);
  } catch (e) {
    await sendTelegram("❌ buy error: " + (e.response?.data?.error || e.message));
  }
}

// ===============================
// DEX SCANNER (Simplified Example)
// ===============================
async function scanDex() {
  try {
    console.log("🧠 scanning DEX Solana...");
    
    // هذا مثال تجريبي لعملة BONK، ليعمل البوت فعلياً يجب ربطه بمصدر بيانات مباشر
    const token = {
      symbol: "BONK",
      mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6a9k7gW5Cw7YaB1p",
      liquidity: 15000,
      volume: 30000,
      age: 2
    };

    if (passesFilters(token)) {
      await executeBuy(token);
    }
  } catch (e) {
    console.error("❌ scan error:", e.message);
  }
}

// ===============================
// START
// ===============================
async function start() {
  await sendTelegram("🔥 SMART GOLD BOT STARTED WITH HELIUS RPC");

  if (wallet) {
    const balance = await connection.getBalance(wallet.publicKey);
    await sendTelegram(
      `✅ wallet loaded\n👛 ${wallet.publicKey.toBase58()}\n💰 ${balance / LAMPORTS_PER_SOL} SOL`
    );
  }

  setInterval(scanDex, 20000);
}

start();
