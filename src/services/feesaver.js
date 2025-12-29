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
   * @param {number} energyAmount - Amount of energy to rent (required, from dynamic estimation)
   * @param {string} duration - Rental duration (default: '1h')
   * @returns {Promise<Object>} Rental response with order details
   */
  async rentEnergy(targetAddress, energyAmount, duration = '1h') {
    if (!this.isEnabled()) {
      throw new Error('FeeSaver service is not enabled or not configured');
    }

    if (!energyAmount || energyAmount <= 0) {
      throw new Error('Energy amount is required and must be positive');
    }

    const amount = energyAmount;
    const rentalDuration = duration;

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
   * @returns {Promise<{success: boolean, cost: number, data: Object}>} Rental response with cost
   */
  async rentEnergyForDeal(targetAddress) {
    if (!this.isEnabled()) {
      console.warn('⚠️ FeeSaver is disabled, skipping energy rental');
      return { success: false, cost: 0, data: null };
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

      // Extract real cost from rental result
      const cost = parseFloat(rentalResult.summa) || 0;

      return {
        success: true,
        cost: cost,
        data: rentalResult
      };
    } catch (error) {
      console.error('❌ Failed to rent energy for deal:', error.message);
      throw error;
    }
  }

  /**
   * Rent bandwidth for a TRON address
   * Prices: 15m/1000bw = 0.5 TRX, 1h/1000bw = 0.6 TRX, 1d/1000bw = 0.7 TRX
   *
   * @param {string} targetAddress - TRON address to receive bandwidth
   * @param {number} bandwidthAmount - Amount of bandwidth to rent (1000 - 100000)
   * @param {string} duration - Rental duration ('15m', '1h', '1d')
   * @returns {Promise<Object>} Rental response with order details
   */
  async rentBandwidth(targetAddress, bandwidthAmount = 1000, duration = '1h') {
    if (!this.isEnabled()) {
      throw new Error('FeeSaver service is not enabled or not configured');
    }

    try {
      console.log(`📶 Renting ${bandwidthAmount} Bandwidth for ${targetAddress} (duration: ${duration})`);

      const response = await axios.get(`${this.baseUrl}/buyBw`, {
        params: {
          token: this.apiKey,
          days: duration,
          volume: bandwidthAmount,
          target: targetAddress
        }
      });

      const data = response.data;

      if (data.status === 'Filled') {
        console.log(`✅ Bandwidth rental successful!`);
        console.log(`   Order ID: ${data.order_id}`);
        console.log(`   Bandwidth: ${data.volume}`);
        console.log(`   Cost: ${data.summa} TRX`);
        console.log(`   Balance remaining: ${data.balance} TRX`);
        console.log(`   TxID: ${data.txid || 'pending'}`);

        if (data.activationPrice > 0) {
          console.log(`   ℹ️ Wallet activated: ${data.activationPrice} TRX`);
        }
      } else if (data.status === 'Created') {
        console.log(`⏳ Bandwidth rental order created, waiting for delegation...`);
        console.log(`   Order ID: ${data.order_id}`);
      }

      return data;
    } catch (error) {
      const errorMsg = error.response?.data?.err || error.message;
      console.error(`❌ Error renting bandwidth:`, errorMsg);

      if (error.response?.data) {
        console.error('Error details:', error.response.data);
      }

      throw new Error(`FeeSaver bandwidth rental failed: ${errorMsg}`);
    }
  }

  /**
   * Rent bandwidth for deal transactions
   * Free bandwidth: 600, need ~700 for 2 TRC20 transfers (~350 each)
   * Rent 400 to cover the gap (600 free + 400 rented = 1000)
   *
   * @param {string} targetAddress - Multisig wallet address
   * @returns {Promise<{success: boolean, cost: number, data: Object}>}
   */
  async rentBandwidthForDeal(targetAddress) {
    if (!this.isEnabled()) {
      console.warn('⚠️ FeeSaver is disabled, skipping bandwidth rental');
      return { success: false, cost: 0, data: null };
    }

    try {
      console.log(`📶 Renting bandwidth for deal transactions...`);

      // Rent 400 bandwidth (600 free + 400 rented = 1000, covers 2 TRC20 transfers)
      const rentalResult = await this.rentBandwidth(targetAddress, 400, '1h');

      if (rentalResult.status !== 'Filled') {
        throw new Error(`Bandwidth rental not filled: ${rentalResult.status}`);
      }

      // Wait for delegation
      await this.waitForDelegation(5);

      const cost = parseFloat(rentalResult.summa) || 0;

      return {
        success: true,
        cost: cost,
        bandwidthRented: 400,
        data: rentalResult
      };
    } catch (error) {
      console.error('❌ Failed to rent bandwidth for deal:', error.message);
      throw error;
    }
  }

  /**
   * Rent exact amount of energy for a specific transfer
   * Uses dynamic estimation instead of fixed amount
   *
   * @param {string} targetAddress - Multisig wallet address
   * @param {number} energyNeeded - Exact energy amount needed (from estimation)
   * @returns {Promise<{success: boolean, cost: number, data: Object}>} Rental response with cost
   */
  async rentExactEnergy(targetAddress, energyNeeded) {
    if (!this.isEnabled()) {
      console.warn('⚠️ FeeSaver is disabled, skipping energy rental');
      return { success: false, cost: 0, data: null };
    }

    try {
      console.log(`🔋 Renting exact energy: ${energyNeeded} for ${targetAddress}`);

      // Rent specific amount of energy
      const rentalResult = await this.rentEnergy(targetAddress, energyNeeded);

      if (rentalResult.status !== 'Filled') {
        throw new Error(`Energy rental not filled: ${rentalResult.status}`);
      }

      // Wait for delegation
      await this.waitForDelegation(10);

      // Extract real cost from rental result
      const cost = parseFloat(rentalResult.summa) || 0;

      return {
        success: true,
        cost: cost,
        energyRented: energyNeeded,
        data: rentalResult
      };
    } catch (error) {
      console.error('❌ Failed to rent exact energy:', error.message);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new FeeSaverService();
