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

// Статический метод: добавить или изменить голос + вернуть дельты для инкремента
blogVoteSchema.statics.vote = async function(targetType, targetId, voteType, visitorId, ipAddress) {
  const filter = { targetType, targetId, visitorId };

  // Проверяем существующий голос
  const existingVote = await this.findOne(filter).lean();

  if (existingVote) {
    if (existingVote.voteType === voteType) {
      // Тот же тип - удаляем (toggle off)
      await this.deleteOne({ _id: existingVote._id });
      // Дельта: -1 для текущего типа
      return {
        action: 'removed',
        voteType,
        delta: voteType === 'like' ? { likes: -1, dislikes: 0 } : { likes: 0, dislikes: -1 }
      };
    } else {
      // Другой тип - меняем
      await this.updateOne({ _id: existingVote._id }, { voteType, ipAddress });
      // Дельта: +1 для нового, -1 для старого
      return {
        action: 'changed',
        oldVoteType: existingVote.voteType,
        voteType,
        delta: voteType === 'like' ? { likes: 1, dislikes: -1 } : { likes: -1, dislikes: 1 }
      };
    }
  } else {
    // Новый голос
    try {
      await this.create({ targetType, targetId, voteType, visitorId, ipAddress });
      // Дельта: +1 для нового типа
      return {
        action: 'added',
        voteType,
        delta: voteType === 'like' ? { likes: 1, dislikes: 0 } : { likes: 0, dislikes: 1 }
      };
    } catch (err) {
      if (err.code === 11000) {
        return this.vote(targetType, targetId, voteType, visitorId, ipAddress);
      }
      throw err;
    }
  }
};

// Быстрое обновление счётчиков через $inc (без пересчёта)
blogVoteSchema.statics.updatePostVotesIncrement = async function(postId, delta) {
  const BlogPost = mongoose.model('BlogPost');
  const update = {};
  if (delta.likes !== 0) update.likes = delta.likes;
  if (delta.dislikes !== 0) update.dislikes = delta.dislikes;

  const post = await BlogPost.findByIdAndUpdate(
    postId,
    { $inc: update },
    { new: true, select: 'likes dislikes' }
  ).lean();

  return { likes: post?.likes || 0, dislikes: post?.dislikes || 0 };
};

blogVoteSchema.statics.updateCommentVotesIncrement = async function(commentId, delta) {
  const BlogComment = mongoose.model('BlogComment');
  const update = {};
  if (delta.likes !== 0) update.likes = delta.likes;
  if (delta.dislikes !== 0) update.dislikes = delta.dislikes;

  const comment = await BlogComment.findByIdAndUpdate(
    commentId,
    { $inc: update },
    { new: true, select: 'likes dislikes' }
  ).lean();

  return { likes: comment?.likes || 0, dislikes: comment?.dislikes || 0 };
};

// Статический метод: получить голос пользователя
blogVoteSchema.statics.getUserVote = async function(targetType, targetId, visitorId) {
  const vote = await this.findOne({ targetType, targetId, visitorId });
  return vote ? vote.voteType : null;
};

const BlogVote = mongoose.model('BlogVote', blogVoteSchema);

module.exports = BlogVote;
