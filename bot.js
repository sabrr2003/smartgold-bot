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
  // مفتاح المحفظة الخاص بك (Base58)
  PRIVATE_KEY: "46UmsCPrM8M4tN4X3G6MvN5fN2W6kG6E9fD6f9L5fJ4n7b8V6C5x4z3a2S1qP",

  // تم إضافة رابط Helius الخاص بك هنا
  SOLANA_RPC_URL: "https://mainnet.helius-rpc.com/?api-key=b24fa717-c2d7-425d-9b3e-9b4df931c04f",

  // بيانات التليجرام (ضع التوكن الخاص بك هنا ليعمل الإشعار)
  TELEGRAM_BOT_TOKEN: "", 
  TELEGRAM_CHAT_ID: "",

  // 🔥 الفلاتر (Filters)
  MIN_LIQUIDITY: 10000,
  MIN_VOLUME: 20000,
  MAX_TOKEN_AGE_MINUTES: 5,

  // 💰 إعدادات الشراء
  BUY_SOL_AMOUNT: 0.02,
  KEEP_FEE_SOL: 0.005,
  SLIPPAGE_BPS: 300 // 3% سليبج
};

// ===============================
// WALLET LOADER
// ===============================
function parsePrivateKey(raw) {
  if (!raw) throw new Error("PRIVATE_KEY is missing");
  const value = String(raw).trim();
  try {
    if (value.startsWith("[")) return Uint8Array.from(JSON.parse(value));
    return bs58.decode(value);
  } catch (e) {
    throw new Error("Invalid Private Key format");
  }
}

let wallet;
try {
  wallet = Keypair.fromSecretKey(parsePrivateKey(CONFIG.PRIVATE_KEY));
  console.log("✅ Wallet Authorized:", wallet.publicKey.toBase58());
} catch (e) {
  console.error("❌ Wallet Error:", e.message);
  process.exit(1);
}

// ===============================
// TELEGRAM BOT
// ===============================
const bot = new TelegramBot(CONFIG.TELEGRAM_BOT_TOKEN, { polling: false });

async function sendTelegram(message) {
  try {
    if (CONFIG.TELEGRAM_BOT_TOKEN && CONFIG.TELEGRAM_CHAT_ID) {
      await bot.sendMessage(CONFIG.TELEGRAM_CHAT_ID, message);
    }
    console.log("LOG:", message);
  } catch (e) {
    console.error("Telegram fail:", e.message);
  }
}

// ===============================
// CONNECTION & JUPITER ENGINE
// ===============================
const connection = new Connection(CONFIG.SOLANA_RPC_URL, "confirmed");

async function executeBuy(token) {
  try {
    const balance = await connection.getBalance(wallet.publicKey);
    if (balance < (CONFIG.BUY_SOL_AMOUNT + CONFIG.KEEP_FEE_SOL) * LAMPORTS_PER_SOL) {
      await sendTelegram("⚠️ رصيد SOL غير كافٍ للعملية");
      return;
    }

    const buyAmountLamports = Math.floor(CONFIG.BUY_SOL_AMOUNT * LAMPORTS_PER_SOL);

    // 1. طلب السعر (Quote)
    const quote = await axios.get(
      `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${token.mint}&amount=${buyAmountLamports}&slippageBps=${CONFIG.SLIPPAGE_BPS}`
    );

    // 2. تجهيز المعاملة (Swap Tx)
    const swapTask = await axios.post("https://quote-api.jup.ag/v6/swap", {
      quoteResponse: quote.data,
      userPublicKey: wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true
    });

    const swapTransactionBuf = Buffer.from(swapTask.data.swapTransaction, "base64");
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // 3. التوقيع والإرسال
    transaction.sign([wallet]);
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 2
    });

    await sendTelegram(`🚀 تمت عملية شراء ${token.symbol}!\n🔗 التوقيع: ${signature}`);
  } catch (e) {
    await sendTelegram("❌ فشل الشراء: " + (e.response?.data?.error || e.message));
  }
}

// ===============================
// SCANNER LOOP
// ===============================
async function scanDex() {
  // ملاحظة: هذا مثال تجريبي، ليعمل البوت فعلياً يجب ربطه بـ Websocket من Helius 
  // أو API مثل DexScreener لمراقبة العملات الجديدة لحظياً.
  const mockToken = {
    symbol: "NEW_COIN",
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6a9k7gW5Cw7YaB1p", // مثال
    liquidity: 20000,
    volume: 50000,
    age: 1
  };

  if (mockToken.liquidity >= CONFIG.MIN_LIQUIDITY) {
    await executeBuy(mockToken);
  }
}

// ===============================
// START
// ===============================
async function start() {
  await sendTelegram("🤖 بوت الذهب الذكي متصل الآن بـ Helius RPC");
  setInterval(scanDex, 30000); // فحص كل 30 ثانية
}

start();
