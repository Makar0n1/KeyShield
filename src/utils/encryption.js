/**
 * AES-256-GCM Encryption Utility
 *
 * Encrypts/decrypts sensitive fields in MongoDB documents.
 * GCM mode provides both confidentiality AND authenticity
 * (tamper detection — if ciphertext is modified, decrypt fails).
 *
 * Encrypted format: "enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 * The "enc:v1:" prefix lets us detect already-encrypted values
 * and support future algorithm changes (v2, etc).
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;       // 128-bit IV for GCM
const AUTH_TAG_LENGTH = 16;  // 128-bit auth tag
const PREFIX = 'enc:v1:';

let _key = null;

/**
 * Initialize encryption with key from environment.
 * Call once at app startup.
 * @returns {boolean} true if encryption is available
 */
function init() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    console.warn('⚠️  ENCRYPTION_KEY not set or invalid (need 64 hex chars). Encryption disabled.');
    return false;
  }
  _key = Buffer.from(hex, 'hex'); // 32 bytes = 256 bits
  console.log('🔐 AES-256-GCM encryption initialized');
  return true;
}

/**
 * Check if encryption is enabled
 */
function isEnabled() {
  return _key !== null;
}

/**
 * Encrypt a plaintext string.
 * Returns encrypted string with prefix, or original if encryption disabled.
 *
 * @param {string} plaintext
 * @returns {string}
 */
function encrypt(plaintext) {
  if (!_key || !plaintext || typeof plaintext !== 'string') return plaintext;
  if (isEncrypted(plaintext)) return plaintext; // Already encrypted

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, _key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an encrypted string.
 * Returns original plaintext. If value is not encrypted, returns as-is.
 *
 * @param {string} ciphertext
 * @returns {string}
 */
function decrypt(ciphertext) {
  if (!_key || !ciphertext || typeof ciphertext !== 'string') return ciphertext;
  if (!isEncrypted(ciphertext)) return ciphertext; // Not encrypted, return as-is

  const withoutPrefix = ciphertext.slice(PREFIX.length);
  const parts = withoutPrefix.split(':');

  if (parts.length !== 3) {
    console.error('🔐 Invalid encrypted format');
    return ciphertext;
  }

  const [ivHex, authTagHex, encryptedHex] = parts;

  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, _key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('🔐 Decryption failed:', error.message);
    return ciphertext; // Return as-is on failure (don't crash)
  }
}

/**
 * Check if a value is already encrypted
 */
function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * Encrypt specific fields on a plain object (mutates in place).
 * @param {Object} obj
 * @param {string[]} fields - dot notation not supported, top-level only
 */
function encryptFields(obj, fields) {
  if (!_key || !obj) return;
  for (const field of fields) {
    if (obj[field] && typeof obj[field] === 'string') {
      obj[field] = encrypt(obj[field]);
    }
  }
}

/**
 * Decrypt specific fields on a plain object (mutates in place).
 * @param {Object} obj
 * @param {string[]} fields
 */
function decryptFields(obj, fields) {
  if (!_key || !obj) return;
  for (const field of fields) {
    if (obj[field] && typeof obj[field] === 'string') {
      obj[field] = decrypt(obj[field]);
    }
  }
}

/**
 * Generate a random 256-bit encryption key (for initial setup).
 * Run: node -e "require('./src/utils/encryption').generateKey()"
 */
function generateKey() {
  const key = crypto.randomBytes(32).toString('hex');
  console.log(`\nGenerated ENCRYPTION_KEY:\n\n  ${key}\n\nAdd to .env:\n  ENCRYPTION_KEY=${key}\n`);
  return key;
}

module.exports = {
  init,
  isEnabled,
  encrypt,
  decrypt,
  isEncrypted,
  encryptFields,
  decryptFields,
  generateKey,
};
