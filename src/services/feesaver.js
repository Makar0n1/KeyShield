/**
 * FeeSaver Service - TRON Energy Rental Integration
 *
 * Provides energy rental for USDT transactions to reduce TRX costs.
 * Documentation: /Volumes/liuliya/arbit/.claude/FEESAVER_API.md
 */

const axios = require('axios');

class FeeSaverService {
  constructor() {
    this.apiKey = process.env.FEESAVER_API_KEY;
    this.baseUrl = 'https://api.feesaver.com';
    this.enabled = process.env.FEESAVER_ENABLED === 'true';
    this.energyAmount = parseInt(process.env.FEESAVER_ENERGY_AMOUNT) || 130000;
    this.rentalDuration = process.env.FEESAVER_RENTAL_DURATION || '1h';
    this.minBalance = parseInt(process.env.FEESAVER_MIN_BALANCE) || 50;

    if (!this.apiKey && this.enabled) {
      console.warn('⚠️ FeeSaver is enabled but FEESAVER_API_KEY is not set');
      this.enabled = false;
    }
  }

  /**
   * Check if FeeSaver is enabled and configured
   */
  isEnabled() {
    return this.enabled && this.apiKey;
  }

  /**
   * Check FeeSaver account balance
   * @returns {Promise<{balance_trx: number, user_id: number}>}
   */
  async checkBalance() {
    try {
      const response = await axios.get(`${this.baseUrl}/balance`, {
        params: { token: this.apiKey }
      });

      const balance = response.data.balance_trx;
      console.log(`💰 FeeSaver balance: ${balance} TRX`);

      // Warn if balance is low
      if (balance < this.minBalance) {
        console.warn(`⚠️ FeeSaver balance is low: ${balance} TRX (min: ${this.minBalance} TRX)`);
      }

      return response.data;
    } catch (error) {
      console.error('❌ Error checking FeeSaver balance:', error.response?.data || error.message);
      throw new Error(`FeeSaver balance check failed: ${error.response?.data?.err || error.message}`);
    }
  }

  /**
   * Rent energy for a TRON address
   * @param {string} targetAddress - TRON address to receive energy
   * @param {number} energyAmount - Amount of energy to rent (default: 130000)
   * @param {string} duration - Rental duration (default: '1h')
   * @returns {Promise<Object>} Rental response with order details
   */
  async rentEnergy(targetAddress, energyAmount = null, duration = null) {
    if (!this.isEnabled()) {
      throw new Error('FeeSaver service is not enabled or not configured');
    }

    const amount = energyAmount || this.energyAmount;
    const rentalDuration = duration || this.rentalDuration;

    try {
      console.log(`🔋 Renting ${amount} Energy for ${targetAddress} (duration: ${rentalDuration})`);

      const response = await axios.get(`${this.baseUrl}/buyenergy`, {
        params: {
          token: this.apiKey,
          days: rentalDuration,
          volume: amount,
          target: targetAddress
        }
      });

      const data = response.data;

      if (data.status === 'Filled') {
        console.log(`✅ Energy rental successful!`);
        console.log(`   Order ID: ${data.order_id}`);
        console.log(`   Energy: ${data.volume}`);
        console.log(`   Cost: ${data.summa} TRX`);
        console.log(`   Balance remaining: ${data.balance} TRX`);
        console.log(`   TxID: ${data.txid || 'pending'}`);

        if (data.activationPrice > 0) {
          console.log(`   ℹ️ Wallet activated: ${data.activationPrice} TRX`);
        }
      } else if (data.status === 'Created') {
        console.log(`⏳ Energy rental order created, waiting for delegation...`);
        console.log(`   Order ID: ${data.order_id}`);
      }

      return data;
    } catch (error) {
      const errorMsg = error.response?.data?.err || error.message;
      console.error(`❌ Error renting energy:`, errorMsg);

      // Log detailed error for debugging
      if (error.response?.data) {
        console.error('Error details:', error.response.data);
      }

      throw new Error(`FeeSaver energy rental failed: ${errorMsg}`);
    }
  }

  /**
   * Rent energy with retry logic
   * @param {string} targetAddress - TRON address to receive energy
   * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
   * @returns {Promise<Object>} Rental response
   */
  async rentEnergyWithRetry(targetAddress, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.rentEnergy(targetAddress);

        // If status is "Filled", return immediately
        if (result.status === 'Filled') {
          return result;
        }

        // If status is "Created", wait and retry
        if (result.status === 'Created' && attempt < maxRetries) {
          console.log(`⏳ Attempt ${attempt}: Order created, waiting 5s before retry...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }

        return result;
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }

        console.log(`⚠️ Attempt ${attempt} failed, retrying in 5s...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  /**
   * Wait for energy delegation to complete
   * FeeSaver delegates energy within 5-10 seconds after successful rental
   * @param {number} seconds - Seconds to wait (default: 10)
   */
  async waitForDelegation(seconds = 10) {
    console.log(`⏳ Waiting ${seconds} seconds for energy delegation...`);
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    console.log(`✅ Energy delegation wait complete`);
  }

  /**
   * Get deposit address for topping up FeeSaver balance
   * @returns {Promise<{deposit_address: string, instructions: string}>}
   */
  async getDepositAddress() {
    try {
      const response = await axios.get(`${this.baseUrl}/refill`, {
        params: { token: this.apiKey }
      });

      console.log(`💳 FeeSaver deposit address: ${response.data.deposit_address}`);
      return response.data;
    } catch (error) {
      console.error('❌ Error getting deposit address:', error.response?.data || error.message);
      throw new Error(`FeeSaver refill failed: ${error.response?.data?.err || error.message}`);
    }
  }

  /**
   * Rent energy and wait for delegation (all-in-one method)
   * This is the primary method to use for deal completion
   *
   * @param {string} targetAddress - Multisig wallet address
   * @returns {Promise<Object>} Rental response
   */
  async rentEnergyForDeal(targetAddress) {
    if (!this.isEnabled()) {
      console.warn('⚠️ FeeSaver is disabled, skipping energy rental');
      return null;
    }

    try {
      // Check balance first
      const balanceData = await this.checkBalance();

      if (balanceData.balance_trx < 10) {
        console.error(`❌ Insufficient FeeSaver balance: ${balanceData.balance_trx} TRX`);
        throw new Error(`FeeSaver balance too low: ${balanceData.balance_trx} TRX (need at least 10 TRX)`);
      }

      // Rent energy with retry
      const rentalResult = await this.rentEnergyWithRetry(targetAddress);

      // Wait for delegation
      await this.waitForDelegation(10);

      return rentalResult;
    } catch (error) {
      console.error('❌ Failed to rent energy for deal:', error.message);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new FeeSaverService();
