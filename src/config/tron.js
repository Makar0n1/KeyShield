const TronWeb = require('tronweb');
require('dotenv').config();

// TRON Configuration
const tronConfig = {
  fullHost: process.env.TRON_FULL_NODE || 'https://api.trongrid.io',
  headers: {
    'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY || ''
  },
  privateKey: process.env.ARBITER_PRIVATE_KEY
};

// Initialize TronWeb instance
const tronWeb = new TronWeb({
  fullHost: tronConfig.fullHost,
  headers: tronConfig.headers,
  privateKey: tronConfig.privateKey
});

// USDT TRC20 Contract Address
const USDT_CONTRACT_ADDRESS = process.env.USDT_CONTRACT_ADDRESS || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

// Test connection
const testConnection = async () => {
  try {
    const nodeInfo = await tronWeb.trx.getNodeInfo();
    console.log('✅ TRON Network Connected:', nodeInfo.configNodeInfo?.codeVersion || 'OK');
    return true;
  } catch (error) {
    console.error('❌ TRON Connection Error:', error.message);
    return false;
  }
};

module.exports = {
  tronWeb,
  USDT_CONTRACT_ADDRESS,
  testConnection,
  tronConfig
};
