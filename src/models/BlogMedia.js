const mongoose = require('mongoose');

/**
 * BlogMedia - медиафайлы блога
 * Хранит метаданные загруженных изображений для медиатеки
 */
const blogMediaSchema = new mongoose.Schema({
  // Имя файла на диске
  filename: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Оригинальное имя файла
  originalName: {
    type: String,
    default: ''
  },
  // URL для доступа
  url: {
    type: String,
    required: true
  },
  // MIME тип
  mimeType: {
    type: String,
    default: 'image/jpeg'
  },
  // Размер файла в байтах
  size: {
    type: Number,
    default: 0
  },
  // Размеры изображения
  width: {
    type: Number,
    default: 0
  },
  height: {
    type: Number,
    default: 0
  },
  // Alt текст по умолчанию
  alt: {
    type: String,
    default: '',
    maxlength: 200
  },
  // Папка/категория для организации (опционально)
  folder: {
    type: String,
    default: '',
    index: true
  },
  // Дата загрузки
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Индексы
blogMediaSchema.index({ createdAt: -1 }); // Для сортировки по дате
blogMediaSchema.index({ folder: 1, createdAt: -1 }); // Для фильтрации по папке

// Статический метод: получить все медиафайлы с пагинацией
blogMediaSchema.statics.getAll = async function(options = {}) {
  const {
    page = 1,
    limit = 50,
    folder = null,
    search = null
  } = options;

  const query = {};

  if (folder) {
    query.folder = folder;
  }

  if (search) {
    query.$or = [
      { filename: new RegExp(search, 'i') },
      { originalName: new RegExp(search, 'i') },
      { alt: new RegExp(search, 'i') }
    ];
  }

  const skip = (page - 1) * limit;

  const [files, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query)
  ]);

  return {
    files,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
};

// Статический метод: получить по filename
blogMediaSchema.statics.getByFilename = async function(filename) {
  return this.findOne({ filename }).lean();
};

// Виртуальное поле: соотношение сторон
blogMediaSchema.virtual('aspectRatio').get(function() {
  if (this.width && this.height) {
    return this.width / this.height;
  }
  return 1;
});

// Виртуальное поле: это вертикальное изображение?
blogMediaSchema.virtual('isTall').get(function() {
  if (this.width && this.height) {
    return this.height > this.width * 1.5; // Высота больше ширины в 1.5 раза
  }
  return false;
});

const BlogMedia = mongoose.model('BlogMedia', blogMediaSchema);

module.exports = BlogMedia;
