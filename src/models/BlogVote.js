const mongoose = require('mongoose');

/**
 * BlogVote - голоса лайков/дизлайков
 * Предотвращает повторные голоса от одного пользователя
 */
const blogVoteSchema = new mongoose.Schema({
  // Тип цели (пост или комментарий)
  targetType: {
    type: String,
    enum: ['post', 'comment'],
    required: true
  },

  // ID цели
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },

  // Тип голоса
  voteType: {
    type: String,
    enum: ['like', 'dislike'],
    required: true
  },

  // Идентификатор посетителя (fingerprint или cookie ID)
  visitorId: {
    type: String,
    required: true
  },

  // IP адрес (дополнительная защита)
  ipAddress: {
    type: String,
    default: ''
  },

  // Timestamp
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Уникальный индекс: один голос на цель от одного посетителя
blogVoteSchema.index(
  { targetType: 1, targetId: 1, visitorId: 1 },
  { unique: true }
);

// Индекс для подсчёта голосов
blogVoteSchema.index({ targetType: 1, targetId: 1, voteType: 1 });

// Статический метод: добавить или изменить голос (оптимизировано - 1 запрос)
blogVoteSchema.statics.vote = async function(targetType, targetId, voteType, visitorId, ipAddress) {
  const filter = { targetType, targetId, visitorId };

  // Используем findOneAndDelete для проверки и удаления за один запрос
  const existingVote = await this.findOneAndDelete(filter);

  if (existingVote) {
    if (existingVote.voteType === voteType) {
      // Тот же тип - голос удалён (toggle off)
      return { action: 'removed', voteType };
    } else {
      // Другой тип - создаём новый голос
      await this.create({ targetType, targetId, voteType, visitorId, ipAddress });
      return { action: 'changed', oldVoteType: existingVote.voteType, voteType };
    }
  } else {
    // Новый голос
    try {
      await this.create({ targetType, targetId, voteType, visitorId, ipAddress });
      return { action: 'added', voteType };
    } catch (err) {
      if (err.code === 11000) {
        // Race condition - повторить
        return this.vote(targetType, targetId, voteType, visitorId, ipAddress);
      }
      throw err;
    }
  }
};

// Статический метод: обновить счётчики (оптимизировано - 1 aggregation + 1 update)
blogVoteSchema.statics.updatePostVotes = async function(postId) {
  const BlogPost = mongoose.model('BlogPost');

  // Одна агрегация вместо двух countDocuments
  const results = await this.aggregate([
    { $match: { targetType: 'post', targetId: postId } },
    { $group: { _id: '$voteType', count: { $sum: 1 } } }
  ]);

  const counts = { likes: 0, dislikes: 0 };
  results.forEach(r => {
    if (r._id === 'like') counts.likes = r.count;
    if (r._id === 'dislike') counts.dislikes = r.count;
  });

  await BlogPost.findByIdAndUpdate(postId, counts);
  return counts;
};

// Статический метод: обновить счётчики комментария (оптимизировано)
blogVoteSchema.statics.updateCommentVotes = async function(commentId) {
  const BlogComment = mongoose.model('BlogComment');

  const results = await this.aggregate([
    { $match: { targetType: 'comment', targetId: commentId } },
    { $group: { _id: '$voteType', count: { $sum: 1 } } }
  ]);

  const counts = { likes: 0, dislikes: 0 };
  results.forEach(r => {
    if (r._id === 'like') counts.likes = r.count;
    if (r._id === 'dislike') counts.dislikes = r.count;
  });

  await BlogComment.findByIdAndUpdate(commentId, counts);
  return counts;
};

// Статический метод: получить голос пользователя
blogVoteSchema.statics.getUserVote = async function(targetType, targetId, visitorId) {
  const vote = await this.findOne({ targetType, targetId, visitorId });
  return vote ? vote.voteType : null;
};

const BlogVote = mongoose.model('BlogVote', blogVoteSchema);

module.exports = BlogVote;
