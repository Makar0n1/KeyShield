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

// Статический метод: добавить или изменить голос
blogVoteSchema.statics.vote = async function(targetType, targetId, voteType, visitorId, ipAddress) {
  // Проверяем существующий голос
  const existingVote = await this.findOne({
    targetType,
    targetId,
    visitorId
  });

  if (existingVote) {
    if (existingVote.voteType === voteType) {
      // Тот же тип голоса - удаляем (toggle)
      await this.findByIdAndDelete(existingVote._id);
      return { action: 'removed', voteType };
    } else {
      // Другой тип - меняем
      const oldVoteType = existingVote.voteType;
      await this.findByIdAndUpdate(existingVote._id, {
        voteType,
        ipAddress
      });
      return { action: 'changed', oldVoteType, voteType };
    }
  } else {
    // Новый голос - используем findOneAndUpdate с upsert для атомарности
    try {
      await this.create({
        targetType,
        targetId,
        voteType,
        visitorId,
        ipAddress
      });
      return { action: 'added', voteType };
    } catch (err) {
      // Если duplicate key error - значит голос уже есть (race condition)
      if (err.code === 11000) {
        // Повторно вызываем vote для обработки существующего голоса
        return this.vote(targetType, targetId, voteType, visitorId, ipAddress);
      }
      throw err;
    }
  }
};

// Статический метод: обновить счётчики лайков/дизлайков для поста
blogVoteSchema.statics.updatePostVotes = async function(postId) {
  const BlogPost = mongoose.model('BlogPost');

  const [likesResult, dislikesResult] = await Promise.all([
    this.countDocuments({ targetType: 'post', targetId: postId, voteType: 'like' }),
    this.countDocuments({ targetType: 'post', targetId: postId, voteType: 'dislike' })
  ]);

  await BlogPost.findByIdAndUpdate(postId, {
    likes: likesResult,
    dislikes: dislikesResult
  });

  return { likes: likesResult, dislikes: dislikesResult };
};

// Статический метод: обновить счётчики лайков/дизлайков для комментария
blogVoteSchema.statics.updateCommentVotes = async function(commentId) {
  const BlogComment = mongoose.model('BlogComment');

  const [likesResult, dislikesResult] = await Promise.all([
    this.countDocuments({ targetType: 'comment', targetId: commentId, voteType: 'like' }),
    this.countDocuments({ targetType: 'comment', targetId: commentId, voteType: 'dislike' })
  ]);

  await BlogComment.findByIdAndUpdate(commentId, {
    likes: likesResult,
    dislikes: dislikesResult
  });

  return { likes: likesResult, dislikes: dislikesResult };
};

// Статический метод: получить голос пользователя
blogVoteSchema.statics.getUserVote = async function(targetType, targetId, visitorId) {
  const vote = await this.findOne({ targetType, targetId, visitorId });
  return vote ? vote.voteType : null;
};

const BlogVote = mongoose.model('BlogVote', blogVoteSchema);

module.exports = BlogVote;
