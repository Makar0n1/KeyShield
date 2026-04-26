# 🔒 Анализ Безопасности Загрузки Файлов в KeyShield Bot

**Дата анализа:** 2026-04-26  
**Статус:** ⚠️ ТРЕБУЕТ ВНИМАНИЯ

---

## 📋 Резюме

Текущая реализация загрузки файлов в боте имеет **критические пробелы в безопасности**:

```
❌ Нет валидации типа файла
❌ Нет проверки размера файла  
❌ Нет сканирования на malware
❌ Нет проверки метаданных
❌ Нет ограничений на формат файла
❌ Потенциальный SSRF при скачивании
❌ Потенциальный RCE при обработке
```

---

## 🎯 Где обрабатываются файлы

### 1. Dispute Handler (`src/bot/handlers/dispute.js`)

**Текущий код:**
```javascript
if (ctx.message.photo) {
  fileId = ctx.message.photo[...].file_id;  // Принимает любое фото
} else if (ctx.message.document) {
  fileId = ctx.message.document.file_id;    // Принимает любой документ
} else if (ctx.message.video) {
  fileId = ctx.message.video.file_id;       // Принимает любое видео
} else if (ctx.message.voice) {
  fileId = ctx.message.voice.file_id;       // Принимает любой голос
}

// Просто сохраняет fileId и fileUrl - БЕЗ ВАЛИДАЦИИ
session.media.push({ fileId, fileUrl, type: fileType });
```

**Риски:**
- ✅ Принимает ЛЮБОЙ тип файла
- ✅ Принимает ЛЮБОЙ размер файла (до лимита Telegram)
- ✅ Сохраняет ссылку без проверки
- ✅ Нет проверки содержимого файла

---

## 🚨 Потенциальные Атаки

### 1. Malicious File Upload

**Сценарий:**
```
Пользователь загружает в спор:
1. Файл с malware.exe (маскированный как JPG)
2. Файл с embedded PHP shell
3. Zip бомба
4. Polyglot файл (одновременно JPG и ZIP)
```

**Что произойдет:**
```
✅ Файл будет принят
✅ File ID будет сохранен в БД
✅ Admin может скачать и запустить malware
❌ Нет защиты!
```

---

### 2. XXE Attack (XML External Entity)

**Сценарий:**
```xml
<!-- Пользователь загружает SVG с XXE -->
<?xml version="1.0"?>
<!DOCTYPE svg [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<svg>
  <text>&xxe;</text>
</svg>
```

**Что произойдет:**
```
✅ Файл будет принят как обычное изображение
❌ Если бот когда-либо обработает этот файл (парсинг, конверт)
   → XXE атака сработает
```

---

### 3. ZIP Bomb (Zip of Death)

**Сценарий:**
```
Пользователь загружает ZIP файл:
- Размер: 10 MB
- При распаковке: 10 GB
```

**Что произойдет:**
```
✅ Файл будет принят (размер 10 MB < лимит)
❌ Если админ распакует → слот будет заполнен
❌ DoS атака
```

---

### 4. SSRF через метаданные

**Сценарий:**
```
Пользователь загружает JPG с метаданными:
Location: http://internal-api/admin
Exif.Copyright: http://localhost:8080/secret.json
```

**Что произойдет:**
```
✅ Файл будет принят
❌ Если код когда-либо читает метаданные → SSRF
```

---

### 5. Polyglot Files

**Сценарий:**
```
Файл одновременно:
- Валидный JPG (отображается как картинка)
- Валидный ZIP (содержит malware)
- Валидный PHP (может быть выполнен)
```

**Что произойдет:**
```
✅ Принимается как JPG
❌ Но также может быть использован как ZIP или PHP
❌ Зависит от того, как система обрабатывает файл
```

---

### 6. File Type Spoofing

**Сценарий:**
```
Пользователь загружает:
- Расширение: photo.jpg
- Содержимое: ELF executable (Linux binary)
- Или: Windows .exe замаскирован как фото
```

**Что произойдет:**
```
✅ Telegram не проверяет content-type
✅ Файл будет принят и сохранен
❌ Если где-то будет попытка выполнения → RCE
```

---

## 📊 Текущие Меры Защиты

### ✅ Что работает

1. **Telegram API Layer**
   - Telegram автоматически проверяет базовые типы файлов
   - Есть лимит размера (обычно 50 MB для документов)
   - Есть белый лист mime-types

2. **Activity Logging**
   ```
   📷 [TIME] @user (ID): media_photo
   📄 [TIME] @user (ID): media_document
   ```

---

### ❌ Что НЕ работает

1. **Нет валидации типа файла**
   ```javascript
   // Нет проверки mime-type
   // Нет проверки расширения
   // Нет проверки magic bytes
   ```

2. **Нет проверки размера**
   ```javascript
   // Нет ограничения на максимальный размер
   // Нет проверки zip bomb
   ```

3. **Нет сканирования содержимого**
   ```javascript
   // Нет парсинга файла
   // Нет проверки метаданных (EXIF, etc)
   // Нет проверки на executable
   ```

4. **Нет изоляции**
   ```javascript
   // Файлы сохраняются с оригинальным именем
   // Нет переименования
   // Нет антивирусного сканирования
   ```

---

## 🔧 Рекомендации по Исправлению

### Critical (Immediate)

```javascript
// 1. Валидация типа файла
function validateFileType(fileType, fileName) {
  const ALLOWED_TYPES = {
    'photo': ['image/jpeg', 'image/png', 'image/webp'],
    'document': ['application/pdf', 'image/jpeg'],
    'video': ['video/mp4'],
    'voice': ['audio/ogg', 'audio/mpeg']
  };

  const FORBIDDEN_EXTENSIONS = [
    '.exe', '.bat', '.cmd', '.ps1',
    '.sh', '.bash', '.php', '.asp',
    '.aspx', '.jsp', '.py', '.rb'
  ];

  // Check extension
  const ext = fileName.split('.').pop().toLowerCase();
  if (FORBIDDEN_EXTENSIONS.includes('.' + ext)) {
    throw new Error('Forbidden file extension: ' + ext);
  }

  // Validate type
  if (!ALLOWED_TYPES[fileType]) {
    throw new Error('Unknown file type: ' + fileType);
  }

  return true;
}

// 2. Проверка размера
function validateFileSize(fileSizeBytes, fileType) {
  const MAX_SIZES = {
    'photo': 5 * 1024 * 1024,      // 5 MB
    'document': 10 * 1024 * 1024,   // 10 MB
    'video': 50 * 1024 * 1024,      // 50 MB
    'voice': 20 * 1024 * 1024       // 20 MB
  };

  if (fileSizeBytes > MAX_SIZES[fileType]) {
    throw new Error(`File too large. Max for ${fileType}: ${MAX_SIZES[fileType] / 1024 / 1024} MB`);
  }

  return true;
}

// 3. Проверка magic bytes (file signature)
function validateMagicBytes(buffer, expectedType) {
  // JPG: FF D8 FF
  // PNG: 89 50 4E 47
  // GIF: 47 49 46 38
  // PDF: 25 50 44 46
  // ZIP: 50 4B 03 04
  
  const signatures = {
    'jpeg': [0xFF, 0xD8, 0xFF],
    'png': [0x89, 0x50, 0x4E, 0x47],
    'gif': [0x47, 0x49, 0x46],
    'pdf': [0x25, 0x50, 0x44, 0x46],
    'zip': [0x50, 0x4B, 0x03, 0x04]
  };

  const sig = signatures[expectedType];
  if (!sig) return true; // Unknown type, skip

  const bufStart = buffer.slice(0, sig.length);
  if (!bufStart.every((byte, i) => byte === sig[i])) {
    throw new Error(`Invalid ${expectedType} file signature`);
  }

  return true;
}

// 4. Переименование файла (避免path traversal)
function renameFile(originalName) {
  const ext = originalName.split('.').pop();
  const uuid = require('uuid').v4();
  return `${uuid}.${ext}`;
}
```

### High Priority

```javascript
// Интеграция с VirusTotal или ClamAV
async function scanForMalware(filePath) {
  // Option 1: VirusTotal API
  // Option 2: ClamAV local scanning
  // Option 3: Quarantine and manual review
}

// Проверка EXIF метаданных
function checkExifMetadata(filePath) {
  const exif = require('exif-parser');
  const data = exif.parse(filePath);
  
  // Check for suspicious fields:
  // - URLs in metadata
  // - Unusual dimensions
  // - Geolocation data
}

// Изоляция файлов (sandbox)
function isolateFile(filePath) {
  // Move to isolated directory
  // Set restrictive permissions
  // Enable mandatory file scanning
}
```

### Medium Priority

```javascript
// Rate limiting на загрузку
function rateLimitFileUpload(userId) {
  // Max 5 files per user per dispute
  // Max 1 file per 5 seconds
  // Max 100 MB per user per day
}

// Логирование с контролем
function logFileUpload(userId, fileName, mimeType, size) {
  // Log to security audit
  // Alert on suspicious patterns
  // Track repeated uploads
}

// Удаление старых файлов
function cleanupOldFiles() {
  // Delete files older than 30 days
  // Secure wipe (не просто delete)
  // Verify deletion
}
```

---

## 📋 Чек-лист Безопасности

```
❌ Валидация типа файла (extension + mime-type + magic bytes)
❌ Проверка размера файла
❌ Проверка метаданных (EXIF, etc)
❌ Сканирование на malware (VirusTotal/ClamAV)
❌ Безопасное переименование файлов
❌ Изоляция файлов (отдельная директория)
❌ Rate limiting на загрузку
❌ Логирование загрузок
❌ Удаление старых файлов (secure wipe)
❌ Полномочия доступа к файлам (chmod 0600)
```

---

## 🧪 Тесты для Проверки

```bash
# 1. Загрузить EXE файл (маскированный под JPG)
cp /bin/ls test.jpg
# → Должен быть отклонен ❌

# 2. Загрузить ZIP bomb
zip -r zipbomb.zip . -s 10m
# → Должен быть отклонен или проверен ❌

# 3. Загрузить файл с XXE
# (см. XXE_EXAMPLE.svg ниже)
# → Должен быть проверен при обработке ❌

# 4. Загрузить polyglot (JPG + ZIP)
# → Должен быть проверен ❌

# 5. Загрузить 100MB файл
dd if=/dev/zero bs=1M count=100 of=bigfile.bin
# → Должен быть отклонен ❌
```

---

## 📝 XXE Example для Тестирования

```xml
<!-- xxe_test.svg -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <text x="10" y="20">&xxe;</text>
</svg>
```

---

## 🎓 OWASP Top 10 Примеры

```
A04:2021 - Insecure Design
├─ Нет белого списка типов файлов
├─ Нет ограничений на размер
└─ Нет проверки содержимого

A05:2021 - Security Misconfiguration
├─ Недостаточное логирование загрузок
├─ Нет изоляции файлов
└─ Неправильные permissions

A08:2021 - Software and Data Integrity Failures
├─ Нет проверки целостности (checksum/hash)
├─ Нет подписи файлов
└─ Нет версионирования

A06:2021 - Vulnerable and Outdated Components
├─ Если используются старые библиотеки для парсинга
├─ Если нет обновления антивирусных БД
└─ Если используются уязвимые форматы файлов
```

---

## 📞 Статус

```
⚠️ ТРЕБУЕТ ВНИМАНИЯ

Рекомендация: Перед production deployment:
1. Реализовать валидацию типа файла (magic bytes)
2. Добавить проверку размера
3. Интегрировать VirusTotal или ClamAV
4. Реализовать secure file handling
5. Добавить comprehensive logging
```

---

## 🔗 Ресурсы

- [OWASP: Unrestricted File Upload](https://owasp.org/www-community/vulnerabilities/Unrestricted_File_Upload)
- [OWASP: XXE Prevention](https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html)
- [VirusTotal API](https://developers.virustotal.com/)
- [ClamAV](https://www.clamav.net/)
- [File Signatures](https://en.wikipedia.org/wiki/List_of_file_signatures)

