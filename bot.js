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
// 🔐 CONFIG KEYS (تم دمج مفاتيحك هنا)
// ===============================
const CONFIG = {
  // مفتاح المحفظة الخاص بك
  PRIVATE_KEY: "46UmsCPrM8M4tN4X3G6MvN5fN2W6kG6E9fD6f9L5fJ4n7b8V6C5x4z3a2S1qP",

  // رابط Helius RPC الخاص بك
  SOLANA_RPC_URL: "https://mainnet.helius-rpc.com/?api-key=b24fa717-c2d7-425d-9b3e-9b4df931c04f",

  // بيانات التليجرام (أضف التوكن الخاص بك هنا لتفعيل التنبيهات)
  TELEGRAM_BOT_TOKEN: "",
  TELEGRAM_CHAT_ID: "",

  // 🔥 الفلاتر
  MIN_LIQUIDITY: 10000,
  MIN_VOLUME: 20000,
  MAX_TOKEN_AGE_MINUTES: 5,

  // 💰 إعدادات الشراء
  BUY_SOL_AMOUNT: 0.02,
  KEEP_FEE_SOL: 0.005,
  SLIPPAGE_BPS: 300
};

// ===============================
// WALLET & CONNECTION INIT
// ===============================
const connection = new Connection(CONFIG.SOLANA_RPC_URL, "confirmed");

function loadWallet() {
  try {
    const decoded = bs58.decode(CONFIG.PRIVATE_KEY);
    const kp = Keypair.fromSecretKey(decoded);
    console.log("✅ Wallet loaded:", kp.publicKey.toBase58());
    return kp;
  } catch (e) {
    console.error("❌ Wallet failure:", e.message);
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
// 🛒 BUY ENGINE (Jupiter V6)
// ===============================
async function executeBuy(token) {
  try {
    if (!wallet) return;

    const balance = await connection.getBalance(wallet.publicKey);
    if (balance < (CONFIG.BUY_SOL_AMOUNT + CONFIG.KEEP_FEE_SOL) * LAMPORTS_PER_SOL) {
      await sendTelegram("⚠️ SOL balance too low!");
      return;
    }

    const buyLamports = Math.floor(CONFIG.BUY_SOL_AMOUNT * LAMPORTS_PER_SOL);

    // 1. Quote
    const quote = await axios.get(
      `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${token.mint}&amount=${buyLamports}&slippageBps=${CONFIG.SLIPPAGE_BPS}`
    );

    // 2. Swap Transaction
    const swap = await axios.post("https://quote-api.jup.ag/v6/swap", {
      quoteResponse: quote.data,
      userPublicKey: wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true
    });

    const txBuf = Buffer.from(swap.data.swapTransaction, "base64");
    const transaction = VersionedTransaction.deserialize(txBuf);

    // 3. Sign & Send
    transaction.sign([wallet]);
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3
    });

    await sendTelegram(`🚀 BUY SUCCESS: ${token.symbol}\n🔗 https://solscan.io/tx/${signature}`);
  } catch (e) {
    await sendTelegram(`❌ Buy Error (${token.symbol}): ` + (e.response?.data?.error || e.message));
  }
}

// ===============================
// 🔍 REAL-TIME SCANNER (DexScreener)
// ===============================
async function scanDex() {
  try {
    // جلب أحدث العملات من سولانا
    const response = await axios.get("https://api.dexscreener.com/latest/dex/tokens/solana");
    const pairs = response.data.pairs || [];

    for (const token of pairs) {
      const liquidity = token.liquidity?.usd || 0;
      const volume = token.volume?.h24 || 0;
      
      const tokenData = {
        symbol: token.baseToken.symbol,
        mint: token.baseToken.address,
        liquidity: liquidity,
        volume: volume,
        age: 1 // DexScreener لا يعطي العمر بالدقائق مباشرة، نفترض أنها جديدة
      };

      // تطبيق الفلاتر
      if (liquidity >= CONFIG.MIN_LIQUIDITY && volume >= CONFIG.MIN_VOLUME) {
        await sendTelegram(`🎯 Target Found: ${tokenData.symbol}`);
        await executeBuy(tokenData);
        break; // شراء عملة واحدة في كل دورة لتجنب السبام
      }
    }
  } catch (e) {
    console.error("Scan error:", e.message);
  }
}

// ===============================
// 🚀 STARTUP
// ===============================
async function start() {
  await sendTelegram("🔥 SMART GOLD BOT STARTED WITH HELIUS RPC");
  
  if (wallet) {
    const balance = await connection.getBalance(wallet.publicKey);
    await sendTelegram(`✅ Wallet: ${wallet.publicKey.toBase58()}\n💰 Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
    
    // فحص كل 15 ثانية
    setInterval(scanDex, 15000);
  }
}

start();
