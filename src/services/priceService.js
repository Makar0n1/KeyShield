/**
 * Price Service - fetches current TRX/USDT rate from CoinGecko
 * Uses caching to avoid rate limits (cache for 5 minutes)
 */

const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const FALLBACK_TRX_RATE = 0.28; // Fallback if API fails

let cachedPrice = null;
let cacheTimestamp = 0;

/**
 * Get current TRX price in USDT
 * @returns {Promise<number>} TRX price in USDT
 */
async function getTrxPrice() {
  const now = Date.now();

  // Return cached price if still valid
  if (cachedPrice !== null && (now - cacheTimestamp) < CACHE_DURATION_MS) {
    return cachedPrice;
  }

  try {
    const response = await fetch(
      `${COINGECKO_API}?ids=tron&vs_currencies=usd`,
      {
        headers: {
          'Accept': 'application/json'
        },
        timeout: 5000
      }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.tron && data.tron.usd) {
      cachedPrice = data.tron.usd;
      cacheTimestamp = now;
      console.log(`[PriceService] Updated TRX price: $${cachedPrice}`);
      return cachedPrice;
    }

    throw new Error('Invalid response format from CoinGecko');
  } catch (error) {
    console.error(`[PriceService] Failed to fetch TRX price: ${error.message}`);

    // Return cached price if available, otherwise fallback
    if (cachedPrice !== null) {
      console.log(`[PriceService] Using cached price: $${cachedPrice}`);
      return cachedPrice;
    }

    console.log(`[PriceService] Using fallback price: $${FALLBACK_TRX_RATE}`);
    return FALLBACK_TRX_RATE;
  }
}

/**
 * Convert TRX amount to USDT
 * @param {number} trxAmount - Amount in TRX
 * @returns {Promise<number>} Amount in USDT
 */
async function trxToUsdt(trxAmount) {
  const price = await getTrxPrice();
  return trxAmount * price;
}

/**
 * Get cached price synchronously (for non-async contexts)
 * Returns fallback if no cache available
 * @returns {number} TRX price in USDT
 */
function getTrxPriceSync() {
  if (cachedPrice !== null) {
    return cachedPrice;
  }
  return FALLBACK_TRX_RATE;
}

/**
 * Force refresh the price cache
 * @returns {Promise<number>} Fresh TRX price
 */
async function refreshPrice() {
  cacheTimestamp = 0; // Invalidate cache
  return getTrxPrice();
}

module.exports = {
  getTrxPrice,
  trxToUsdt,
  getTrxPriceSync,
  refreshPrice,
  FALLBACK_TRX_RATE
};
