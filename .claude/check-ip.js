/**
 * Check IP Address Script
 *
 * Shows which IP address is used for outgoing requests
 * to help debug FeeSaver whitelist issues
 */

const axios = require('axios');

async function checkIP() {
  console.log('\n🔍 IP Address Check\n');

  try {
    // Check IP via multiple services
    console.log('1. Checking IP via ipify.org...');
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

    console.log('\n✅ IP check complete!\n');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

checkIP();
