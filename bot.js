const axios = require("axios");
const bs58Module = require("bs58");
const bs58 = bs58Module.default || bs58Module;
const { Keypair, Connection, PublicKey } = require("@solana/web3.js");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY;
const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

const connection = new Connection(SOLANA_RPC_URL, "confirmed");

let wallet = null;

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

function loadWallet() {
  try {
    const pk = SOLANA_PRIVATE_KEY?.trim();

    if (!pk) {
      console.log("⚠️ wallet not loaded: missing private key");
      return null;
    }

    let secret;

    // Base58
    if (!pk.startsWith("[")) {
      secret = Uint8Array.from(bs58.decode(pk));
    }
    // JSON array
    else {
      secret = Uint8Array.from(JSON.parse(pk));
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

async function scanDexSolana() {
  try {
    console.log("🧠 scanning DEX Solana...");
    await sendTelegram("🧠 scanning DEX Solana...");

    // هنا مكان فحص العملات الجديدة
    const fakeToken = {
      symbol: "TEST",
      price: 0.0012,
      liquidity: 150000,
      volume: 90000,
      change: 12.5,
    };

    const isGood =
      fakeToken.liquidity > 100000 &&
      fakeToken.volume > 50000 &&
      fakeToken.change > 5;

    if (!isGood) return;

    if (!wallet) {
      await sendTelegram("⚠️ monitor mode - no wallet");
      return;
    }

    // شراء حقيقي (مكان تنفيذ الشراء)
    await sendTelegram(
      `🚀 REAL BUY ${fakeToken.symbol}\n💵 price: ${fakeToken.price}`
    );

    console.log("REAL BUY:", fakeToken.symbol);
  } catch (e) {
    console.log("scan error:", e.message);
    await sendTelegram(`❌ scan error ${e.message}`);
  }
}

async function main() {
  console.log("🔥 SMART GOLD BOT STARTED");
  await sendTelegram("🔥 SMART GOLD BOT STARTED");

  setInterval(scanDexSolana, 20000);
}

main();
