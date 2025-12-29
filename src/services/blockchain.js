const { tronWeb, USDT_CONTRACT_ADDRESS } = require('../config/tron');
const constants = require('../config/constants');
const CircuitBreaker = require('../utils/CircuitBreaker');
const adminAlertService = require('./adminAlertService');

/**
 * Blockchain Service
 * Handles all TRON blockchain operations including multisig wallet creation,
 * transaction signing, and balance checking.
 *
 * SECURITY NOTE: In production, buyer/seller keys should be generated client-side.
 * This MVP generates keys server-side for simplicity but is marked for security review.
 *
 * HIGH-LOAD: Uses CircuitBreaker to prevent cascading failures when TronGrid is down.
 */

class BlockchainService {
  constructor() {
    this.tronWeb = tronWeb;

    // Circuit breaker for TronGrid API (opens after 5 failures in 30 sec)
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 60000,     // Wait 1 min before retry
      failureWindowMs: 30000,   // Count failures in 30 sec window
      serviceName: 'TronGrid API',
      onStateChange: (serviceName, oldState, newState) => {
        // Alert admin when circuit breaker state changes
        adminAlertService.alertCircuitBreakerChange(serviceName, oldState, newState);
      }
    });

    // Balance verification cache (30 seconds TTL)
    this.balanceCache = new Map();
    this.BALANCE_CACHE_TTL = 30000; // 30 seconds
  }

  /**
   * Verify buyer wallet: check if address exists and has sufficient balance
   * @param {string} address - TRON address to verify
   * @param {number} requiredAmount - Required USDT amount (deal amount + 5 USDT buffer)
   * @param {number} dealAmount - Just the deal amount (for error messages)
   * @returns {Promise<Object>} - { valid, balance, error, errorType }
   *
   * errorType can be:
   * - 'invalid_address' - Address format is invalid
   * - 'not_found' - Address not found on TRON network
   * - 'insufficient_funds' - Balance < dealAmount
   * - 'no_buffer' - Balance >= dealAmount but < requiredAmount (no 5 USDT buffer)
   * - 'api_error' - TRON API is unavailable
   */
  async verifyBuyerWallet(address, requiredAmount, dealAmount) {
    // Check cache first
    const cacheKey = `${address}:${requiredAmount}`;
    const cached = this.balanceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.BALANCE_CACHE_TTL) {
      return cached.result;
    }

    try {
      // Step 1: Validate address format
      if (!this.isValidAddress(address)) {
        return {
          valid: false,
          balance: 0,
          error: 'Неверный формат адреса. Адрес должен начинаться с T и содержать 34 символа.',
          errorType: 'invalid_address'
        };
      }

      // Step 2: Check if address exists on network (get account info)
      let accountExists = false;
      try {
        const account = await this.tronWeb.trx.getAccount(address);
        accountExists = account && (account.address || account.balance !== undefined);
      } catch (err) {
        // Account doesn't exist or API error
        accountExists = false;
      }

      // Step 3: Get USDT balance (even if account seems to not exist, try anyway)
      const balance = await this.getBalance(address, 'USDT');

      // If balance is 0 and account doesn't exist, it's likely not found
      if (!accountExists && balance === 0) {
        // Double-check by trying to get TRX balance too
        const trxBalance = await this.getBalance(address, 'TRX');
        if (trxBalance === 0) {
          const result = {
            valid: false,
            balance: 0,
            error: 'Кошелёк не найден в сети TRON. Убедитесь, что адрес корректный и был активирован.',
            errorType: 'not_found'
          };
          this.balanceCache.set(cacheKey, { result, timestamp: Date.now() });
          return result;
        }
      }

      // Step 4: Check balance against deal amount
      if (balance < dealAmount) {
        const result = {
          valid: false,
          balance,
          error: `Недостаточно средств. Баланс: ${balance.toFixed(2)} USDT. Требуется: ${requiredAmount.toFixed(2)} USDT (сумма сделки + 5 USDT запас).`,
          errorType: 'insufficient_funds'
        };
        this.balanceCache.set(cacheKey, { result, timestamp: Date.now() });
        return result;
      }

      // Step 5: Check if balance covers deal + 5 USDT buffer
      if (balance < requiredAmount) {
        const result = {
          valid: false,
          balance,
          error: `На вашем кошельке есть сумма для покрытия сделки, но нет запаса на случай комиссий.\n\nБаланс: ${balance.toFixed(2)} USDT\nРекомендуем: ${requiredAmount.toFixed(2)} USDT (сумма + 5 USDT)\n\nМы обеспечиваем безопасность платёжеспособности покупателей!`,
          errorType: 'no_buffer'
        };
        this.balanceCache.set(cacheKey, { result, timestamp: Date.now() });
        return result;
      }

      // All checks passed!
      const result = {
        valid: true,
        balance,
        error: null,
        errorType: null
      };
      this.balanceCache.set(cacheKey, { result, timestamp: Date.now() });
      return result;

    } catch (error) {
      console.error('Error verifying buyer wallet:', error);
      return {
        valid: false,
        balance: 0,
        error: 'Не удалось проверить кошелёк. Пожалуйста, попробуйте позже или обратитесь в поддержку.',
        errorType: 'api_error'
      };
    }
  }

  /**
   * Verify wallet exists on TRON network (for seller validation)
   * Less strict than buyer verification - just checks if address is valid and exists
   * @param {string} address - TRON address to verify
   * @returns {Promise<Object>} - { valid, error, errorType }
   *
   * errorType can be:
   * - 'invalid_address' - Address format is invalid
   * - 'not_found' - Address not found/not activated on TRON network
   * - 'api_error' - TRON API is unavailable
   */
  async verifyWalletExists(address) {
    // Check cache first (reuse balance cache with different key)
    const cacheKey = `exists:${address}`;
    const cached = this.balanceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.BALANCE_CACHE_TTL) {
      return cached.result;
    }

    try {
      // Step 1: Validate address format
      if (!this.isValidAddress(address)) {
        return {
          valid: false,
          error: 'Неверный формат адреса. Адрес должен начинаться с T и содержать 34 символа.',
          errorType: 'invalid_address'
        };
      }

      // Step 2: Check if address exists on network
      let accountExists = false;
      try {
        const account = await this.tronWeb.trx.getAccount(address);
        accountExists = account && (account.address || account.balance !== undefined);
      } catch (err) {
        accountExists = false;
      }

      // Step 3: If account doesn't seem to exist, double-check with balance
      if (!accountExists) {
        const trxBalance = await this.getBalance(address, 'TRX');
        const usdtBalance = await this.getBalance(address, 'USDT');

        // If both balances are 0 and account doesn't exist - it's not activated
        if (trxBalance === 0 && usdtBalance === 0) {
          const result = {
            valid: false,
            error: 'Кошелёк не найден в сети TRON. Убедитесь, что адрес корректный и был активирован (имеет хотя бы одну транзакцию).',
            errorType: 'not_found'
          };
          this.balanceCache.set(cacheKey, { result, timestamp: Date.now() });
          return result;
        }
      }

      // Wallet exists!
      const result = {
        valid: true,
        error: null,
        errorType: null
      };
      this.balanceCache.set(cacheKey, { result, timestamp: Date.now() });
      return result;

    } catch (error) {
      console.error('Error verifying wallet existence:', error);
      return {
        valid: false,
        error: 'Не удалось проверить кошелёк. Пожалуйста, попробуйте позже.',
        errorType: 'api_error'
      };
    }
  }

  /**
   * Create a new TRON account with multisig permissions (2-of-3)
   * @param {string} buyerPublicKey - Buyer's public key
   * @param {string} sellerPublicKey - Seller's public key
   * @param {string} arbiterPublicKey - Arbiter's public key
   * @returns {Promise<Object>} - Multisig wallet details
   */
  async createMultisigWallet(buyerPublicKey, sellerPublicKey, arbiterPublicKey) {
    try {
      // Generate new account for escrow
      const newAccount = await tronWeb.createAccount();
      const address = newAccount.address.base58;

      // SECURITY TODO: In production, this account should be funded with minimal TRX
      // for transaction fees by the service, then permissions should be set

      // Configure permissions
      // TRON Account Permission Structure:
      // - threshold: minimum weight required (2)
      // - keys: array of authorized keys with their weights
      const permissionConfig = {
        owner_address: tronWeb.address.toHex(address),
        actives: [
          {
            type: 2, // Active permission
            permission_name: 'escrow_active',
            threshold: constants.MULTISIG_THRESHOLD,
            operations: '7fff1fc0033e0000000000000000000000000000000000000000000000000000', // All operations
            keys: [
              {
                address: tronWeb.address.toHex(tronWeb.address.fromPrivateKey(buyerPublicKey)),
                weight: 1
              },
              {
                address: tronWeb.address.toHex(tronWeb.address.fromPrivateKey(sellerPublicKey)),
                weight: 1
              },
              {
                address: tronWeb.address.toHex(tronWeb.address.fromPrivateKey(arbiterPublicKey)),
                weight: 1
              }
            ]
          }
        ]
      };

      // Note: Actually setting permissions on TRON requires the account to have TRX for fees
      // and requires calling updateAccountPermissions
      // For MVP, we're documenting the structure; actual implementation requires:
      // 1. Fund the new account with minimal TRX (e.g., 10 TRX)
      // 2. Call tronWeb.trx.updateAccountPermissions(address, ownerPermission, witnessPermission, activesPermissions)

      return {
        address,
        privateKey: newAccount.privateKey,
        buyerPublicKey,
        sellerPublicKey,
        arbiterPublicKey,
        threshold: constants.MULTISIG_THRESHOLD,
        permissionsJson: permissionConfig
      };
    } catch (error) {
      console.error('Error creating multisig wallet:', error);
      throw new Error(`Failed to create multisig wallet: ${error.message}`);
    }
  }

  /**
   * Generate a new key pair for user
   * SECURITY TODO: This should be done client-side in production!
   * @returns {Object} - { privateKey, publicKey, address }
   */
  async generateKeyPair() {
    try {
      const account = await tronWeb.createAccount();
      return {
        privateKey: account.privateKey,
        publicKey: account.publicKey,
        address: account.address.base58
      };
    } catch (error) {
      console.error('Error generating key pair:', error);
      throw new Error(`Failed to generate key pair: ${error.message}`);
    }
  }

  /**
   * Check balance of an address for specific asset
   * @param {string} address - TRON address
   * @param {string} asset - 'TRX' or 'USDT'
   * @returns {Promise<number>} - Balance in SUN (for TRX) or token units
   */
  async getBalance(address, asset = 'USDT') {
    try {
      if (asset === 'TRX') {
        const balance = await tronWeb.trx.getBalance(address);
        return balance / 1e6; // Convert SUN to TRX
      } else if (asset === 'USDT') {
        const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
        const balance = await contract.balanceOf(address).call();
        return balance.toNumber() / 1e6; // USDT has 6 decimals
      }
      throw new Error(`Unsupported asset: ${asset}`);
    } catch (error) {
      console.error(`Error getting ${asset} balance for ${address}:`, error);
      return 0;
    }
  }

  /**
   * Check for incoming transactions to an address
   * @param {string} address - TRON address to monitor
   * @param {string} asset - 'TRX' or 'USDT'
   * @param {number} expectedAmount - Expected amount
   * @returns {Promise<Object|null>} - Transaction details or null
   */
  async checkDeposit(address, asset, expectedAmount) {
    // Use circuit breaker to prevent cascading failures
    return await this.circuitBreaker.execute(async () => {
      return await this._checkDepositInternal(address, asset, expectedAmount);
    });
  }

  /**
   * Internal deposit check (wrapped by circuit breaker)
   */
  async _checkDepositInternal(address, asset, expectedAmount) {
    try {
      if (asset === 'USDT') {
        // Query TronGrid for TRC20 transfers
        const url = `${tronWeb.fullNode.host}/v1/accounts/${address}/transactions/trc20?limit=20`;
        const response = await fetch(url, {
          headers: tronWeb.fullNode.headers
        });
        const data = await response.json();

        if (data.data && data.data.length > 0) {
          for (const tx of data.data) {
            // Check if it's a transfer to this address
            if (tx.to === address && tx.token_info?.address === USDT_CONTRACT_ADDRESS) {
              const amount = parseInt(tx.value) / 1e6; // Convert to USDT
              // If expectedAmount is 0, return any deposit; otherwise check if amount meets minimum
              if (expectedAmount === 0 || amount >= expectedAmount * 0.5) {
                return {
                  txHash: tx.transaction_id,
                  amount,
                  block: tx.block_timestamp,
                  from: tx.from,
                  confirmed: true
                };
              }
            }
          }
        }
      } else if (asset === 'TRX') {
        // Query for TRX transfers
        const url = `${tronWeb.fullNode.host}/v1/accounts/${address}/transactions?limit=20`;
        const response = await fetch(url, {
          headers: tronWeb.fullNode.headers
        });
        const data = await response.json();

        if (data.data && data.data.length > 0) {
          for (const tx of data.data) {
            if (tx.raw_data?.contract?.[0]?.type === 'TransferContract') {
              const contract = tx.raw_data.contract[0].parameter.value;
              if (contract.to_address === tronWeb.address.toHex(address)) {
                const amount = contract.amount / 1e6;
                // If expectedAmount is 0, return any deposit; otherwise check if amount meets minimum
                if (expectedAmount === 0 || amount >= expectedAmount * 0.5) {
                  return {
                    txHash: tx.txID,
                    amount,
                    block: tx.block_timestamp,
                    from: tronWeb.address.fromHex(contract.owner_address),
                    confirmed: true
                  };
                }
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error checking deposit:', error);
      return null;
    }
  }

  /**
   * Create raw transaction for releasing funds
   * @param {string} fromAddress - Multisig wallet address
   * @param {string} toAddress - Recipient address
   * @param {number} amount - Amount to send
   * @param {string} asset - 'TRX' or 'USDT'
   * @returns {Promise<Object>} - Raw transaction
   */
  async createReleaseTransaction(fromAddress, toAddress, amount, asset = 'USDT') {
    try {
      let transaction;

      if (asset === 'USDT') {
        // Create TRC20 transfer transaction
        const amountInSun = Math.floor(amount * 1e6);

        const functionSelector = 'transfer(address,uint256)';
        const parameter = [
          { type: 'address', value: toAddress },
          { type: 'uint256', value: amountInSun }
        ];

        const result = await tronWeb.transactionBuilder.triggerSmartContract(
          USDT_CONTRACT_ADDRESS,
          functionSelector,
          {
            feeLimit: 100000000, // 100 TRX fee limit
            callValue: 0
          },
          parameter,
          fromAddress
        );

        console.log('🔍 Smart contract result structure:', {
          hasResult: !!result,
          hasResultResult: !!result?.result,
          hasResultResultResult: !!result?.result?.result,
          hasTransaction: !!result?.transaction,
          resultKeys: result ? Object.keys(result) : 'null'
        });

        // TronWeb returns object with .transaction property for smart contracts
        // Also check if transaction creation was successful
        if (!result || !result.result || !result.result.result) {
          console.error('❌ Smart contract call failed:', JSON.stringify(result, null, 2));
          throw new Error(`Smart contract call failed: ${JSON.stringify(result)}`);
        }

        transaction = result.transaction;

        if (!transaction) {
          console.error('❌ Transaction object is undefined. Full result:', JSON.stringify(result, null, 2));
          throw new Error('Transaction object is undefined in smart contract result');
        }

        console.log('✅ TRC20 transaction created successfully');
        return transaction;
      } else if (asset === 'TRX') {
        // Create TRX transfer transaction
        const amountInSun = Math.floor(amount * 1e6);
        transaction = await tronWeb.transactionBuilder.sendTrx(
          toAddress,
          amountInSun,
          fromAddress
        );
      }

      return transaction;
    } catch (error) {
      console.error('Error creating release transaction:', error);
      throw new Error(`Failed to create transaction: ${error.message}`);
    }
  }

  /**
   * Sign a transaction with a private key
   * @param {Object} transaction - Raw transaction
   * @param {string} privateKey - Private key to sign with
   * @returns {Promise<Object>} - Signed transaction
   */
  async signTransaction(transaction, privateKey) {
    try {
      // Validate transaction object
      if (!transaction) {
        throw new Error('Transaction is null or undefined');
      }

      if (!transaction.raw_data) {
        throw new Error('Transaction missing raw_data property');
      }

      // Remove the private key prefix if present (TronWeb handles both formats)
      const cleanPrivateKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;

      const signedTx = await tronWeb.trx.sign(transaction, cleanPrivateKey);
      return signedTx;
    } catch (error) {
      const errorMsg = error?.message || error?.toString() || 'Unknown error';
      console.error('❌ Error signing transaction:', errorMsg);
      console.error('Full error:', error);
      console.error('Transaction structure:', JSON.stringify({
        hasRawData: !!transaction?.raw_data,
        hasContract: !!transaction?.raw_data?.contract,
        txID: transaction?.txID,
        keys: transaction ? Object.keys(transaction) : 'null'
      }, null, 2));
      throw new Error(`Failed to sign transaction: ${errorMsg}`);
    }
  }

  /**
   * Sign transaction with multiple signatures (multisig)
   * @param {Object} transaction - Raw transaction
   * @param {Array<string>} privateKeys - Array of private keys
   * @returns {Promise<Object>} - Multi-signed transaction
   */
  async multiSignTransaction(transaction, privateKeys) {
    try {
      let signedTx = transaction;

      for (const privateKey of privateKeys) {
        signedTx = await tronWeb.trx.multiSign(signedTx, privateKey);
      }

      return signedTx;
    } catch (error) {
      console.error('Error multi-signing transaction:', error);
      throw new Error(`Failed to multi-sign transaction: ${error.message}`);
    }
  }

  /**
   * Broadcast a signed transaction to the network
   * @param {Object} signedTransaction - Signed transaction
   * @returns {Promise<Object>} - Transaction result with txID
   */
  async broadcastTransaction(signedTransaction) {
    try {
      const result = await tronWeb.trx.sendRawTransaction(signedTransaction);

      if (result.result) {
        return {
          success: true,
          txHash: result.txid || signedTransaction.txID,
          message: 'Transaction broadcast successfully'
        };
      } else {
        return {
          success: false,
          error: result.code || 'Unknown error',
          message: result.message || 'Transaction failed'
        };
      }
    } catch (error) {
      console.error('Error broadcasting transaction:', error);
      throw new Error(`Failed to broadcast transaction: ${error.message}`);
    }
  }

  /**
   * Get transaction info from blockchain
   * @param {string} txHash - Transaction hash
   * @returns {Promise<Object>} - Transaction info
   */
  async getTransactionInfo(txHash) {
    try {
      const txInfo = await tronWeb.trx.getTransactionInfo(txHash);
      const tx = await tronWeb.trx.getTransaction(txHash);

      return {
        txHash,
        blockNumber: txInfo.blockNumber,
        confirmed: txInfo.receipt?.result === 'SUCCESS',
        timestamp: tx.raw_data?.timestamp,
        fee: txInfo.fee || 0,
        ...txInfo
      };
    } catch (error) {
      console.error('Error getting transaction info:', error);
      return null;
    }
  }

  /**
   * Verify if an address is valid TRON address
   * @param {string} address - Address to validate
   * @returns {boolean}
   */
  isValidAddress(address) {
    return tronWeb.isAddress(address);
  }

  /**
   * Convert private key to address
   * @param {string} privateKey
   * @returns {string} - TRON address
   */
  privateKeyToAddress(privateKey) {
    return tronWeb.address.fromPrivateKey(privateKey);
  }

  /**
   * Activate multisig wallet by sending TRX to it
   * @param {string} multisigAddress - Address to activate
   * @param {number} trxAmount - Amount of TRX to send (default: 30)
   * @returns {Promise<Object>} - Transaction result
   */
  async activateMultisigWallet(multisigAddress, trxAmount = 30) {
    try {
      const arbiterPrivateKey = process.env.ARBITER_PRIVATE_KEY;
      const arbiterAddress = tronWeb.address.fromPrivateKey(arbiterPrivateKey);

      console.log(`🔓 Activating multisig wallet ${multisigAddress} with ${trxAmount} TRX...`);

      // Create TRX transfer transaction
      const amountInSun = Math.floor(trxAmount * 1e6);
      const transaction = await tronWeb.transactionBuilder.sendTrx(
        multisigAddress,
        amountInSun,
        arbiterAddress
      );

      // Sign transaction
      const signedTx = await this.signTransaction(transaction, arbiterPrivateKey);

      // Broadcast transaction
      const result = await this.broadcastTransaction(signedTx);

      if (result.success) {
        console.log(`✅ Multisig wallet activated: ${result.txHash}`);
        return {
          success: true,
          txHash: result.txHash,
          amount: trxAmount
        };
      } else {
        console.error(`❌ Failed to activate multisig wallet: ${result.message}`);
        return {
          success: false,
          error: result.message
        };
      }
    } catch (error) {
      console.error('Error activating multisig wallet:', error);
      throw new Error(`Failed to activate multisig wallet: ${error.message}`);
    }
  }

  /**
   * Estimate energy required for USDT transfer
   * @param {string} fromAddress - Sender address
   * @param {string} toAddress - Recipient address
   * @param {number} amount - USDT amount to transfer
   * @param {boolean} skipPenalty - If true, only return base energy (for subsequent transfers from same address)
   * @returns {Promise<{energyNeeded: number, baseCost: number, penalty: number}>}
   */
  async estimateTransferEnergy(fromAddress, toAddress, amount = 1, skipPenalty = false) {
    try {
      const functionSelector = 'transfer(address,uint256)';
      const parameter = [
        { type: 'address', value: toAddress },
        { type: 'uint256', value: Math.floor(amount * 1e6) }
      ];

      const result = await this.tronWeb.transactionBuilder.triggerConstantContract(
        USDT_CONTRACT_ADDRESS,
        functionSelector,
        {},
        parameter,
        fromAddress
      );

      const energyUsed = result.energy_used || 65000;
      const energyPenalty = result.energy_penalty || 0;

      // For subsequent transfers from same address, penalty is already paid
      const effectivePenalty = skipPenalty ? 0 : energyPenalty;
      const totalEnergy = energyUsed + effectivePenalty;

      // Add 10% buffer + 5000 extra for second transfer reserve
      // This ensures enough energy remains after first transfer for commission
      const EXTRA_RESERVE = skipPenalty ? 0 : 5000; // Only add reserve for first transfer
      const energyWithBuffer = Math.ceil(totalEnergy * 1.1) + EXTRA_RESERVE;

      console.log(`⚡ Energy estimate for ${fromAddress} → ${toAddress}:`);
      console.log(`   Base: ${energyUsed}, Penalty: ${energyPenalty}${skipPenalty ? ' (skipped)' : ''}, Total: ${totalEnergy}, With buffer: ${energyWithBuffer}${EXTRA_RESERVE ? ' (+5k reserve)' : ''}`);

      return {
        energyNeeded: energyWithBuffer,
        baseCost: energyUsed,
        penalty: effectivePenalty
      };
    } catch (error) {
      console.error('Error estimating energy:', error.message);
      // Return safe default if estimation fails
      // First transfer: ~127k * 1.1 + 5k reserve = 145k
      // Second transfer: ~65k * 1.1 = 72k
      const defaultEnergy = skipPenalty ? 72000 : 145000;
      return {
        energyNeeded: defaultEnergy,
        baseCost: 65000,
        penalty: skipPenalty ? 0 : 70000
      };
    }
  }

  /**
   * Get available energy for an address (delegated + own)
   * @param {string} address - TRON address
   * @returns {Promise<number>} Available energy
   */
  async getAvailableEnergy(address) {
    try {
      const resources = await this.tronWeb.trx.getAccountResources(address);
      // EnergyLimit is total available, EnergyUsed is consumed
      const energyLimit = resources.EnergyLimit || 0;
      const energyUsed = resources.EnergyUsed || 0;
      const availableEnergy = energyLimit - energyUsed;

      console.log(`⚡ Energy for ${address}: ${availableEnergy} available (${energyLimit} limit - ${energyUsed} used)`);
      return availableEnergy;
    } catch (error) {
      console.error('Error getting energy balance:', error.message);
      return 0;
    }
  }

  /**
   * Send TRX from one address to another
   * @param {string} fromPrivateKey - Sender's private key
   * @param {string} toAddress - Recipient address
   * @param {number} amountTRX - Amount in TRX
   * @returns {Promise<{success: boolean, txHash?: string, message?: string}>}
   */
  async sendTRX(fromPrivateKey, toAddress, amountTRX) {
    try {
      const amountSun = Math.floor(amountTRX * 1_000_000);
      const fromAddress = this.tronWeb.address.fromPrivateKey(fromPrivateKey);

      console.log(`💸 Sending ${amountTRX} TRX from ${fromAddress} to ${toAddress}...`);

      // Build transaction
      const tx = await this.tronWeb.transactionBuilder.sendTrx(
        toAddress,
        amountSun,
        fromAddress
      );

      // Sign transaction
      const signedTx = await this.tronWeb.trx.sign(tx, fromPrivateKey);

      // Broadcast
      const result = await this.tronWeb.trx.sendRawTransaction(signedTx);

      if (result.result || result.code === 'SUCCESS') {
        const txHash = result.txid || result.transaction?.txID;
        console.log(`✅ TRX sent successfully: ${txHash}`);
        return {
          success: true,
          txHash: txHash
        };
      } else {
        const errorMsg = result.message || result.code || 'Unknown error';
        console.error(`❌ TRX send failed: ${errorMsg}`);
        return {
          success: false,
          message: errorMsg
        };
      }
    } catch (error) {
      console.error('Error sending TRX:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }
}

module.exports = new BlockchainService();
