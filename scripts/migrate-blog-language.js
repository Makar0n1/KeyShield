/**
 * Migration: set language: 'ru' on all existing blog posts without language field
 * Run once: node scripts/migrate-blog-language.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const result = await mongoose.connection.collection('blogposts').updateMany(
    { language: { $exists: false } },
    { $set: { language: 'ru' } }
  );

  console.log(`Updated ${result.modifiedCount} posts -> language: 'ru'`);
  await mongoose.disconnect();
}

migrate().catch(console.error);
