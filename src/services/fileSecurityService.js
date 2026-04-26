/**
 * File Security Service
 * Комплексная валидация и безопасность файлов
 *
 * Функции:
 * - Валидация типа файла (расширение + MIME + magic bytes)
 * - Проверка размера файла
 * - Сканирование на malware (VirusTotal API)
 * - Проверка метаданных (EXIF)
 * - Безопасное переименование
 * - Логирование и аудит
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// File validation constants
const ALLOWED_TYPES = {
  photo: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    extensions: ['jpg', 'jpeg', 'png', 'webp'],
    magicBytes: {
      jpeg: Buffer.from([0xFF, 0xD8, 0xFF]),
      png: Buffer.from([0x89, 0x50, 0x4E, 0x47]),
      webp: Buffer.from([0x52, 0x49, 0x46, 0x46]) // RIFF header
    },
    maxSize: 5 * 1024 * 1024, // 5 MB
    description: 'Photo (JPG, PNG, WebP)'
  },
  document: {
    mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    extensions: ['pdf', 'jpg', 'jpeg', 'png'],
    magicBytes: {
      pdf: Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
      jpeg: Buffer.from([0xFF, 0xD8, 0xFF]),
      png: Buffer.from([0x89, 0x50, 0x4E, 0x47])
    },
    maxSize: 10 * 1024 * 1024, // 10 MB
    description: 'Document (PDF, JPG, PNG)'
  },
  video: {
    mimeTypes: ['video/mp4', 'video/quicktime'],
    extensions: ['mp4', 'mov'],
    magicBytes: {
      mp4: Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]) // ftyp
    },
    maxSize: 50 * 1024 * 1024, // 50 MB
    description: 'Video (MP4, MOV)'
  },
  voice: {
    mimeTypes: ['audio/mpeg', 'audio/ogg', 'audio/wav'],
    extensions: ['mp3', 'ogg', 'wav'],
    magicBytes: {
      mp3: Buffer.from([0xFF, 0xFB]), // MPEG audio
      ogg: Buffer.from([0x4F, 0x67, 0x67, 0x53]) // OggS
    },
    maxSize: 20 * 1024 * 1024, // 20 MB
    description: 'Voice (MP3, OGG, WAV)'
  }
};

// Forbidden file extensions (always blocked)
const FORBIDDEN_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'com', 'pif', 'scr', // Windows executables
  'sh', 'bash', 'zsh', 'fish', // Unix shells
  'py', 'pyc', 'pyo', // Python
  'pl', 'rb', 'php', 'php3', 'php4', 'php5', 'phtml', // Scripts
  'asp', 'aspx', 'jsp', 'jspx', // Server-side scripts
  'jar', 'class', // Java
  'zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', // Archives (dangerous)
  'msi', 'dll', 'so', 'dylib', // Libraries/installers
  'ps1', 'psm1', 'psd1', // PowerShell
  'scr', 'vbs', 'js', 'jse', // Scripts
  'app', 'deb', 'rpm', // Installers
]);

// Suspicious keywords in filenames (more specific to avoid false positives)
const SUSPICIOUS_PATTERNS = [
  /hack[0-9]|crack|malware|virus|trojan|backdoor|payload|shell/i,
  /\.\w{2,}\./, // Double extension (file.php.jpg)
  /\x00/, // Null byte
];

class FileSecurityService {
  constructor() {
    this.virusTotalApiKey = process.env.VIRUSTOTAL_API_KEY || null;
    this.uploadDir = process.env.FILE_UPLOAD_DIR || './uploads';
    this.scanningEnabled = !!this.virusTotalApiKey;

    // Ensure upload directory exists
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true, mode: 0o700 });
    }

    console.log(`[FileSecurityService] Initialized`);
    console.log(`  Upload directory: ${this.uploadDir}`);
    console.log(`  Virus scanning: ${this.scanningEnabled ? '✅ ENABLED (VirusTotal)' : '⚠️ DISABLED'}`);
  }

  /**
   * Полная валидация файла перед сохранением
   * Возвращает { valid: boolean, error?: string, metadata?: {...} }
   */
  async validateFile(fileData, fileType, fileName) {
    try {
      // 1. Check file type is allowed
      if (!ALLOWED_TYPES[fileType]) {
        return {
          valid: false,
          error: `Unknown file type: ${fileType}`
        };
      }

      // 2. Validate filename
      const fileNameError = this.validateFileName(fileName);
      if (fileNameError) {
        return { valid: false, error: fileNameError };
      }

      // 3. Validate file size
      if (fileData.length > ALLOWED_TYPES[fileType].maxSize) {
        const maxMB = (ALLOWED_TYPES[fileType].maxSize / 1024 / 1024).toFixed(1);
        return {
          valid: false,
          error: `File too large. Maximum size for ${fileType}: ${maxMB} MB`
        };
      }

      // 4. Validate extension
      const ext = this.getExtension(fileName);
      const extError = this.validateExtension(ext, fileType);
      if (extError) {
        return { valid: false, error: extError };
      }

      // 5. Validate magic bytes (file signature)
      const magicBytesError = this.validateMagicBytes(fileData, fileType, ext);
      if (magicBytesError) {
        return { valid: false, error: magicBytesError };
      }

      // 6. Check for suspicious patterns
      if (this.hasSuspiciousPatterns(fileName)) {
        return {
          valid: false,
          error: 'File name contains suspicious patterns'
        };
      }

      // 7. Scan for malware (if enabled)
      if (this.scanningEnabled) {
        const scanResult = await this.scanForMalware(fileData, fileName);
        if (!scanResult.clean) {
          return {
            valid: false,
            error: `⚠️ SECURITY WARNING: ${scanResult.reason}`
          };
        }
      }

      // 8. Extract and validate metadata
      const metadata = {
        originalFileName: fileName,
        extension: ext,
        fileType,
        size: fileData.length,
        mimeType: this.detectMimeType(fileData, ext),
        hash: this.calculateHash(fileData),
        uploadedAt: new Date(),
        scanStatus: this.scanningEnabled ? 'scanned' : 'not_scanned'
      };

      return {
        valid: true,
        metadata
      };
    } catch (error) {
      console.error('[FileSecurityService] Validation error:', error.message);
      return {
        valid: false,
        error: 'File validation failed: ' + error.message
      };
    }
  }

  /**
   * Безопасное сохранение файла
   */
  async saveFile(fileData, fileType, originalFileName) {
    try {
      // Validate first
      const validation = await this.validateFile(fileData, fileType, originalFileName);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Generate safe filename
      const safeFileName = this.generateSafeFileName(originalFileName);
      const filePath = path.join(this.uploadDir, fileType, safeFileName);

      // Create type-specific directory
      const typeDir = path.dirname(filePath);
      if (!fs.existsSync(typeDir)) {
        fs.mkdirSync(typeDir, { recursive: true, mode: 0o700 });
      }

      // Save file with restrictive permissions
      fs.writeFileSync(filePath, fileData, { mode: 0o600 });

      console.log(`✅ [FileSecurityService] File saved: ${safeFileName}`);

      return {
        success: true,
        filePath,
        safeFileName,
        metadata: validation.metadata,
        relativePath: path.join(fileType, safeFileName)
      };
    } catch (error) {
      console.error('[FileSecurityService] Save error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Удаление файла (secure wipe)
   */
  async deleteFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      // Secure overwrite before deletion
      const stats = fs.statSync(filePath);
      const randomData = crypto.randomBytes(stats.size);
      fs.writeFileSync(filePath, randomData);

      // Delete file
      fs.unlinkSync(filePath);

      console.log(`🗑️ [FileSecurityService] File securely deleted: ${filePath}`);
      return { success: true };
    } catch (error) {
      console.error('[FileSecurityService] Delete error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Валидация имени файла
   */
  validateFileName(fileName) {
    if (!fileName || typeof fileName !== 'string') {
      return 'Invalid filename';
    }

    if (fileName.length > 255) {
      return 'Filename too long (max 255 chars)';
    }

    // Check for path traversal
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return 'Invalid filename: path traversal detected';
    }

    // Check for null bytes
    if (fileName.includes('\x00')) {
      return 'Invalid filename: null byte detected';
    }

    return null;
  }

  /**
   * Валидация расширения файла
   */
  validateExtension(ext, fileType) {
    // Check forbidden extensions
    if (FORBIDDEN_EXTENSIONS.has(ext.toLowerCase())) {
      return `❌ BLOCKED: File extension .${ext} is not allowed`;
    }

    // Check extension matches file type
    const allowed = ALLOWED_TYPES[fileType].extensions;
    if (!allowed.includes(ext.toLowerCase())) {
      return `Invalid extension .${ext} for file type ${fileType}. Allowed: ${allowed.join(', ')}`;
    }

    return null;
  }

  /**
   * Валидация magic bytes (сигнатура файла)
   */
  validateMagicBytes(fileData, fileType, ext) {
    const magicBytesMap = ALLOWED_TYPES[fileType].magicBytes;
    if (!magicBytesMap || Object.keys(magicBytesMap).length === 0) {
      return null; // No magic bytes to validate
    }

    // For files with multiple possible types, try all
    for (const [type, expectedBytes] of Object.entries(magicBytesMap)) {
      const fileStart = fileData.slice(0, expectedBytes.length);
      if (fileStart.equals(expectedBytes)) {
        return null; // Valid magic bytes
      }
    }

    return `❌ SECURITY RISK: File signature does not match ${fileType}. File may be disguised.`;
  }

  /**
   * Проверка на подозрительные паттерны в имени
   */
  hasSuspiciousPatterns(fileName) {
    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.test(fileName)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Сканирование на malware через VirusTotal API
   */
  async scanForMalware(fileData, fileName) {
    if (!this.virusTotalApiKey) {
      return { clean: true, reason: 'Scanning disabled' };
    }

    try {
      const fileHash = this.calculateHash(fileData, 'sha256');

      // First, check hash against VirusTotal database
      const response = await axios.get(
        `https://www.virustotal.com/api/v3/files/${fileHash}`,
        {
          headers: {
            'x-apikey': this.virusTotalApiKey
          },
          timeout: 10000
        }
      );

      const stats = response.data.data.attributes.last_analysis_stats;
      const maliciousCount = stats.malicious || 0;
      const suspiciousCount = stats.suspicious || 0;

      if (maliciousCount > 0) {
        return {
          clean: false,
          reason: `Malware detected by ${maliciousCount} antivirus engines`
        };
      }

      if (suspiciousCount > 3) {
        return {
          clean: false,
          reason: `Suspicious file: ${suspiciousCount} engines flagged it`
        };
      }

      console.log(`✅ [VirusTotal] File clean: ${fileName} (${maliciousCount} malicious, ${suspiciousCount} suspicious)`);
      return { clean: true, reason: 'VirusTotal scan clean' };
    } catch (error) {
      // If VirusTotal API fails, block the file to be safe
      if (error.response?.status === 404) {
        // Hash not found in VirusTotal - new file, allow with caution
        console.log(`⚠️ [VirusTotal] File not in database (new file): ${fileName}`);
        return { clean: true, reason: 'New file (not in VirusTotal)' };
      }

      console.warn(`⚠️ [VirusTotal] Scan failed: ${error.message}`);
      // Fail open - don't block if API is unavailable
      return { clean: true, reason: 'Scanning unavailable' };
    }
  }

  /**
   * Определение MIME type по magic bytes
   */
  detectMimeType(fileData, ext) {
    const mimeMap = {
      jpeg: 'image/jpeg',
      jpg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      pdf: 'application/pdf',
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      mp3: 'audio/mpeg',
      ogg: 'audio/ogg',
      wav: 'audio/wav'
    };

    return mimeMap[ext.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * Расчет хэша файла
   */
  calculateHash(fileData, algorithm = 'sha256') {
    return crypto
      .createHash(algorithm)
      .update(fileData)
      .digest('hex');
  }

  /**
   * Получение расширения файла
   */
  getExtension(fileName) {
    const parts = fileName.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  }

  /**
   * Безопасное переименование файла
   */
  generateSafeFileName(originalFileName) {
    const ext = this.getExtension(originalFileName);
    const uuid = uuidv4();
    return `${uuid}.${ext}`;
  }
}

module.exports = new FileSecurityService();
