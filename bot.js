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
// 🔐 CONFIG KEYS
// ===============================
const CONFIG = {
  // تم إضافة مفتاح المحفظة هنا بصيغة Base58
  PRIVATE_KEY: "46UmsCPrM8M4tN4X3G6MvN5fN2W6kG6E9fD6f9L5fJ4n7b8V6C5x4z3a2S1qP", 

  // Helius RPC
  SOLANA_RPC_URL: "https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY",

  TELEGRAM_BOT_TOKEN: "",
  TELEGRAM_CHAT_ID: "",

  // 🔥 FILTERS
  MIN_LIQUIDITY: 10000,
  MIN_VOLUME: 20000,
  MAX_TOKEN_AGE_MINUTES: 5,

  // 💰 BUY SETTINGS
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
    if (!CONFIG.TELEGRAM_BOT_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) return;
    await bot.sendMessage(CONFIG.TELEGRAM_CHAT_ID, message);
  } catch (e) {
    console.error("telegram send failed:", e.message);
  }
}

// ===============================
// WALLET PARSER
// ===============================
function parsePrivateKey(raw) {
  if (!raw || !String(raw).trim()) {
    throw new Error("PRIVATE_KEY is empty");
  }

  const value = String(raw).trim();

  if (value.startsWith("[")) {
    const arr = JSON.parse(value);
    return Uint8Array.from(arr);
  }

  if (value.includes(",")) {
    const arr = value
      .replace(/،/g, ",")
      .split(",")
      .map((v) => Number(v.trim()));
    return Uint8Array.from(arr);
  }

  return bs58.decode(value);
}

function loadWallet() {
  try {
    const secret = parsePrivateKey(CONFIG.PRIVATE_KEY);
    const wallet = Keypair.fromSecretKey(secret);
    console.log("✅ wallet loaded:", wallet.publicKey.toBase58());
    return wallet;
  } catch (e) {
    console.error("❌ wallet init failed:", e.message);
    return null;
  }
}

// ===============================
// SOLANA
// ===============================
const connection = new Connection(CONFIG.SOLANA_RPC_URL, "confirmed");
const wallet = loadWallet();

// ===============================
// FILTER ENGINE
// ===============================
function passesFilters(token) {
  return (
    token.liquidity >= CONFIG.MIN_LIQUIDITY &&
    token.volume >= CONFIG.MIN_VOLUME &&
    token.age <= CONFIG.MAX_TOKEN_AGE_MINUTES
  );
}

// ===============================
// REAL BUY ENGINE (JUPITER)
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
      await sendTelegram("⚠️ insufficient SOL balance");
      return;
    }

    const buyLamports = Math.floor(
      CONFIG.BUY_SOL_AMOUNT * LAMPORTS_PER_SOL
    );

    // ===== quote =====
    const quote = await axios.get(
      "https://quote-api.jup.ag/v6/quote",
      {
        params: {
          inputMint: "So11111111111111111111111111111111111111112",
          outputMint: token.mint,
          amount: buyLamports,
          slippageBps: CONFIG.SLIPPAGE_BPS
        }
      }
    );

    if (!quote.data) {
      throw new Error("no route");
    }

    // ===== build tx =====
    const swap = await axios.post(
      "https://quote-api.jup.ag/v6/swap",
      {
        quoteResponse: quote.data,
        userPublicKey: wallet.publicKey.toBase58(),
        wrapAndUnwrapSol: true
      }
    );

    const txBase64 = swap.data.swapTransaction;
    const txBuffer = Buffer.from(txBase64, "base64");
    const tx = VersionedTransaction.deserialize(txBuffer);

    tx.sign([wallet]);

    const sig = await connection.sendTransaction(tx, {
      maxRetries: 3
    });

    await sendTelegram(
      `🚀 REAL BUY ${token.symbol}\n🔗 ${sig}`
    );
  } catch (e) {
    await sendTelegram("❌ buy error: " + e.message);
  }
}

// ===============================
// DEX SCANNER
// ===============================
async function scanDex() {
  try {
    await sendTelegram("🧠 scanning DEX Solana...");

    // 🔥 مثال عملة جديدة
    const token = {
      symbol: "BONK",
      mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6a9k7gW5Cw7YaB1p",
      liquidity: 15000,
      volume: 30000,
      age: 2
    };

    if (!passesFilters(token)) {
      await sendTelegram("⚠️ token rejected by filters");
      return;
    }

    await executeBuy(token);
  } catch (e) {
    await sendTelegram("❌ scan error: " + e.message);
  }
}

// ===============================
// START
// ===============================
async function start() {
  await sendTelegram("🔥 SMART GOLD BOT STARTED");

  if (wallet) {
    const balance = await connection.getBalance(wallet.publicKey);
    await sendTelegram(
      `✅ wallet loaded successfully\n👛 ${wallet.publicKey.toBase58()}\n💰 ${balance / LAMPORTS_PER_SOL} SOL`
    );
  } else {
    await sendTelegram("⚠️ wallet init failed at startup");
  }

  setInterval(scanDex, 20000);
}

start();
