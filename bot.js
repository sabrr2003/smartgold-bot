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
// 🔐 CONFIGURATION
// ===============================
const CONFIG = {
  // مفتاح المحفظة الخاص بك
  PRIVATE_KEY: "46UmsCPrM8M4tN4X3G6MvN5fN2W6kG6E9fD6f9L5fJ4n7b8V6C5x4z3a2S1qP",

  // رابط Helius RPC الخاص بك
  SOLANA_RPC_URL: "https://mainnet.helius-rpc.com/?api-key=b24fa717-c2d7-425d-9b3e-9b4df931c04f",

  // تليجرام (اختياري)
  TELEGRAM_BOT_TOKEN: "", 
  TELEGRAM_CHAT_ID: "",

  // 🔥 الفلاتر
  MIN_LIQUIDITY: 10000, // السيولة بالدولار
  MIN_VOLUME: 20000,    // حجم التداول
  MAX_TOKEN_AGE_MINUTES: 5,

  // 💰 إعدادات الشراء
  BUY_SOL_AMOUNT: 0.02,
  KEEP_FEE_SOL: 0.005,
  SLIPPAGE_BPS: 300 // 3%
};

// ===============================
// 🛠️ INITIALIZATION
// ===============================
const connection = new Connection(CONFIG.SOLANA_RPC_URL, "confirmed");

// فك تشفير المحفظة
function loadWallet() {
  try {
    const decoded = bs58.decode(CONFIG.PRIVATE_KEY);
    return Keypair.fromSecretKey(decoded);
  } catch (e) {
    console.error("❌ فشل تحميل المحفظة: ", e.message);
    return null;
  }
}

const wallet = loadWallet();
const bot = CONFIG.TELEGRAM_BOT_TOKEN ? new TelegramBot(CONFIG.TELEGRAM_BOT_TOKEN, { polling: false }) : null;

async function sendTelegram(message) {
  console.log(message);
  if (bot && CONFIG.TELEGRAM_CHAT_ID) {
    try { await bot.sendMessage(CONFIG.TELEGRAM_CHAT_ID, message); } catch (e) {}
  }
}

// ===============================
// 🛒 BUY ENGINE
// ===============================
async function executeBuy(mintAddress, symbol) {
  try {
    const balance = await connection.getBalance(wallet.publicKey);
    if (balance < (CONFIG.BUY_SOL_AMOUNT + CONFIG.KEEP_FEE_SOL) * LAMPORTS_PER_SOL) {
      await sendTelegram("⚠️ الرصيد في المحفظة منخفض جداً!");
      return;
    }

    const buyLamports = Math.floor(CONFIG.BUY_SOL_AMOUNT * LAMPORTS_PER_SOL);

    // 1. طلب عرض سعر من Jupiter
    const { data: quoteResponse } = await axios.get(
      `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${mintAddress}&amount=${buyLamports}&slippageBps=${CONFIG.SLIPPAGE_BPS}`
    );

    // 2. إنشاء المعاملة
    const { data: { swapTransaction } } = await axios.post("https://quote-api.jup.ag/v6/swap", {
      quoteResponse,
      userPublicKey: wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true
    });

    // 3. توقيع وإرسال المعاملة
    const swapTransactionBuf = Buffer.from(swapTransaction, "base64");
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    transaction.sign([wallet]);

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3
    });

    await sendTelegram(`🚀 شراء ناجح لعملة ${symbol}\n🔗 الرابط: https://solscan.io/tx/${signature}`);
  } catch (e) {
    await sendTelegram(`❌ خطأ شراء ${symbol}: ` + (e.response?.data?.error || e.message));
  }
}

// ===============================
// 🔍 SCANNER (Real-time monitoring)
// ===============================
async function scanNewTokens() {
  try {
    // ملاحظة: هنا نستخدم API من BirdEye أو DexScreener لجلب العملات الجديدة
    // كمثال، سنقوم بفحص قائمة العملات الجديدة من Jupiter أو Dex
    const response = await axios.get('https://api.dexscreener.com/latest/dex/tokens/solana');
    const tokens = response.data.pairs;

    for (const token of tokens) {
      const liquidity = token.liquidity?.usd || 0;
      const volume = token.volume?.h24 || 0;
      const mint = token.baseToken.address;
      const symbol = token.baseToken.symbol;

      // تطبيق الفلاتر
      if (liquidity >= CONFIG.MIN_LIQUIDITY && volume >= CONFIG.MIN_VOLUME) {
        console.log(`✅ عملة مطابقة للمواصفات: ${symbol}`);
        await executeBuy(mint, symbol);
        break; // تجنب شراء كل شيء مرة واحدة في الفحص الواحد
      }
    }
  } catch (e) {
    console.error("❌ خطأ في فحص العملات: ", e.message);
  }
}

// ===============================
// 🚀 START
// ===============================
async function main() {
  if (!wallet) return;
  
  await sendTelegram(`
🔥 بوت الذهب الذكي يعمل الآن!
👛 المحفظة: ${wallet.publicKey.toBase58()}
🌐 RPC: Helius Connected
  `);

  // تشغيل الفحص كل 15 ثانية
  setInterval(scanNewTokens, 15000);
}

main();
