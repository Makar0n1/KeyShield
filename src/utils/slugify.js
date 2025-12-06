/**
 * Транслитерация и генерация slug
 */

// Таблица транслитерации кириллицы
const translitMap = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
  'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
  'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
  'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
  'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch', 'Ъ': '',
  'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
  // Украинские
  'і': 'i', 'І': 'I', 'ї': 'yi', 'Ї': 'Yi', 'є': 'ye', 'Є': 'Ye', 'ґ': 'g', 'Ґ': 'G'
};

/**
 * Транслитерация текста
 * @param {string} text - Исходный текст
 * @returns {string} - Транслитерированный текст
 */
function transliterate(text) {
  return text
    .split('')
    .map(char => translitMap[char] || char)
    .join('');
}

/**
 * Генерация slug из текста
 * @param {string} text - Исходный текст (может содержать кириллицу)
 * @param {number} maxLength - Максимальная длина slug (default: 100)
 * @returns {string} - URL-safe slug
 */
function slugify(text, maxLength = 100) {
  if (!text) return '';

  return transliterate(text)
    .toLowerCase()
    .trim()
    // Заменяем все не-алфавитно-цифровые на дефисы
    .replace(/[^a-z0-9]+/g, '-')
    // Удаляем дефисы в начале и конце
    .replace(/^-+|-+$/g, '')
    // Обрезаем до maxLength
    .substring(0, maxLength)
    // Удаляем финальный дефис если обрезали посередине слова
    .replace(/-+$/, '');
}

/**
 * Генерация уникального slug с суффиксом
 * @param {string} baseSlug - Базовый slug
 * @param {Function} checkExists - Async функция проверки существования
 * @returns {Promise<string>} - Уникальный slug
 */
async function generateUniqueSlug(baseSlug, checkExists) {
  let slug = baseSlug;
  let counter = 1;

  while (await checkExists(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;

    // Защита от бесконечного цикла
    if (counter > 100) {
      slug = `${baseSlug}-${Date.now()}`;
      break;
    }
  }

  return slug;
}

module.exports = {
  transliterate,
  slugify,
  generateUniqueSlug
};
