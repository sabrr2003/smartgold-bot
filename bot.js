const axios = require("axios");
const {
  Keypair,
  Connection,
  VersionedTransaction,
  LAMPORTS_PER_SOL
} = require("@solana/web3.js");
const bs58 = require("bs58");

// ===============================
// 🔐 CONFIG (تم وضع مفاتيحك هنا)
// ===============================
const CONFIG = {
  // مفتاح المحفظة الخاص بك
  PRIVATE_KEY: "46UmsCPrM8M4tN4X3G6MvN5fN2W6kG6E9fD6f9L5fJ4n7b8V6C5x4z3a2S1qP",

  // رابط Helius RPC الخاص بك
  SOLANA_RPC_URL: "https://mainnet.helius-rpc.com/?api-key=b24fa717-c2d7-425d-9b3e-9b4df931c04f",

  // ضع هنا توكن التليجرام إذا كنت تريد استلام الإشعارات
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
// TELEGRAM (إرسال الإشعارات)
// ===============================
async function sendTelegram(message) {
  try {
    if (!CONFIG.TELEGRAM_BOT_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) {
      console.log("LOG:", message);
      return;
    }

    await axios.post(
      `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: CONFIG.TELEGRAM_CHAT_ID,
        text: message
      }
    );

    console.log("📩 telegram sent:", message);
  } catch (e) {
    console.error("❌ telegram failed:", e.message);
  }
}

// ===============================
// PRIVATE KEY PARSER
// ===============================
function parsePrivateKey(raw) {
  const value = String(raw).trim();

  if (value.startsWith("[")) {
    return Uint8Array.from(JSON.parse(value));
  }

  if (value.includes(",")) {
    return Uint8Array.from(
      value.replace(/،/g, ",")
        .split(",")
        .map(n => Number(n.trim()))
    );
  }

  const decoded = bs58.decode(value);
  if (decoded.length === 64) return decoded;
  if (decoded.length === 32) {
    return Keypair.fromSeed(decoded).secretKey;
  }

  throw new Error("bad secret key size");
}

function loadWallet() {
  try {
    const secret = parsePrivateKey(CONFIG.PRIVATE_KEY);
    const wallet = Keypair.fromSecretKey(secret);
    console.log("✅ wallet loaded:", wallet.publicKey.toBase58());
    return wallet;
  } catch (e) {
    console.error("❌ wallet failure:", e.message);
    return null;
  }
}

// ===============================
// SOLANA CONNECTION
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
      await sendTelegram(`⚠️ الرصيد غير كافٍ: ${sol.toFixed(4)} SOL`);
      return;
    }

    const amount = Math.floor(CONFIG.BUY_SOL_AMOUNT * LAMPORTS_PER_SOL);

    // Get Quote from Jupiter
    const quote = await axios.get("https://quote-api.jup.ag/v6/quote", {
      params: {
        inputMint: "So11111111111111111111111111111111111111112",
        outputMint: token.mint,
        amount,
        slippageBps: CONFIG.SLIPPAGE_BPS
      }
    });

    // Build Swap Transaction
    const swap = await axios.post("https://quote-api.jup.ag/v6/swap", {
      quoteResponse: quote.data,
      userPublicKey: wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true
    });

    const tx = VersionedTransaction.deserialize(
      Buffer.from(swap.data.swapTransaction, "base64")
    );

    // Sign and Send
    tx.sign([wallet]);
    const sig = await connection.sendTransaction(tx, {
      maxRetries: 3
    });

    await sendTelegram(`🚀 تم الشراء بنجاح للعملة ${token.symbol}\n🔗 https://solscan.io/tx/${sig}`);
  } catch (e) {
    await sendTelegram("❌ buy error: " + (e.response?.data?.error || e.message));
  }
}

// ===============================
// DEX SCANNER
// ===============================
async function scanDex() {
  try {
    // محاكاة البحث عن عملة جديدة (يمكنك ربط هذا الجزء بـ DexScreener API لاحقاً)
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
  await sendTelegram("🔥 بوت الذهب الذكي بدأ العمل مع Helius RPC");

  if (wallet) {
    const balance = await connection.getBalance(wallet.publicKey);
    await sendTelegram(
      `✅ المحفظة جاهزة\n👛 العنوان: ${wallet.publicKey.toBase58()}\n💰 الرصيد: ${balance / LAMPORTS_PER_SOL} SOL`
    );
  } else {
    await sendTelegram("⚠️ فشل في تهيئة المحفظة عند البدء");
  }

  // الفحص كل 20 ثانية
  setInterval(scanDex, 20000);
}

start();
