/**
 * Скрипт для пересчёта commentsCount во всех постах
 * Запуск: node scripts/recalculate-comments.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const BlogPost = require('../src/models/BlogPost');
const BlogComment = require('../src/models/BlogComment');

async function recalculateComments() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!\n');

    const posts = await BlogPost.find().select('_id title commentsCount');
    console.log(`Found ${posts.length} posts\n`);

    let updated = 0;

    for (const post of posts) {
      const actualCount = await BlogComment.countDocuments({
        postId: post._id,
        status: 'approved'
      });

      if (post.commentsCount !== actualCount) {
        await BlogPost.findByIdAndUpdate(post._id, { commentsCount: actualCount });
        console.log(`✓ "${post.title}": ${post.commentsCount} -> ${actualCount}`);
        updated++;
      } else {
        console.log(`  "${post.title}": ${actualCount} (OK)`);
      }
    }

    console.log(`\nDone! Updated ${updated} posts.`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

recalculateComments();
