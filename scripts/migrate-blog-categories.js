/**
 * Migration: set language: 'ru' on all existing blog categories without language field
 * Run once: node scripts/migrate-blog-categories.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const result = await mongoose.connection.collection('blogcategories').updateMany(
    { language: { $exists: false } },
    { $set: { language: 'ru' } }
  );

  console.log(`Updated ${result.modifiedCount} categories -> language: 'ru'`);
  await mongoose.disconnect();
}

migrate().catch(console.error);
