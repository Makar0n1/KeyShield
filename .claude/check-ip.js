/**
 * Check IP Address Script
 *
 * Shows which IP address is used for outgoing requests
 * to help debug FeeSaver whitelist issues
 */

require('dotenv').config();
const axios = require('axios');

async function checkIP() {
  console.log('\n🔍 IP Address Check\n');

  // Check proxy environment variables
  console.log('0. Checking proxy configuration...');
  console.log(`   HTTP_PROXY: ${process.env.HTTP_PROXY || 'not set'}`);
  console.log(`   HTTPS_PROXY: ${process.env.HTTPS_PROXY || 'not set'}`);
  console.log(`   NO_PROXY: ${process.env.NO_PROXY || 'not set'}`);
  console.log(`   API_DOMAIN: ${process.env.API_DOMAIN || 'not set'}`);

  try {
    // Check IP via multiple services
    console.log('\n1. Checking IP via ipify.org...');
    const ipify = await axios.get('https://api.ipify.org?format=json');
    console.log(`   IP: ${ipify.data.ip}`);

    console.log('\n2. Checking IP via icanhazip.com...');
    const icanhazip = await axios.get('https://icanhazip.com');
    console.log(`   IP: ${icanhazip.data.trim()}`);

    console.log('\n3. Checking IP via ident.me...');
    const identme = await axios.get('https://ident.me');
    console.log(`   IP: ${identme.data.trim()}`);

    // Check FeeSaver
    console.log('\n4. Testing FeeSaver API access...');
    try {
      const feesaver = await axios.get('https://api.feesaver.com/balance', {
        params: { token: process.env.FEESAVER_API_KEY }
      });
      console.log(`   ✅ FeeSaver accessible!`);
      console.log(`   Balance: ${feesaver.data.balance_trx} TRX`);
    } catch (error) {
      console.log(`   ❌ FeeSaver error: ${error.response?.data?.err || error.message}`);
      console.log('\n   This IP needs to be whitelisted:', ipify.data.ip);
    }

    // Check if behind proxy
    console.log('\n5. Checking for proxy headers...');
    const headers = await axios.get('https://httpbin.org/headers');
    console.log('   Headers:', JSON.stringify(headers.data.headers, null, 2));

    console.log('\n6. Summary...');
    console.log(`   ✅ Your outgoing IP: ${ipify.data.ip}`);
    console.log(`   ⚠️  Tell FeeSaver to whitelist this IP: ${ipify.data.ip}`);

    if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
      console.log(`   ⚠️  WARNING: Proxy detected! This might affect FeeSaver access.`);
    }

    console.log('\n✅ IP check complete!\n');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

if (require.main === module) {
  checkIP();
}

module.exports = { checkIP };
