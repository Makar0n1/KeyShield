/**
 * Fix canonical URLs for categories and tags
 * Removes /blog from category URLs: /blog/category/slug -> /category/slug
 */

require('dotenv').config();
const mongoose = require('mongoose');
const BlogCategory = require('../src/models/BlogCategory');
const BlogTag = require('../src/models/BlogTag');

async function fixCanonicalUrls() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Fix categories
    const categories = await BlogCategory.find({
      canonical: { $regex: /\/blog\/category\// }
    });

    console.log(`Found ${categories.length} categories with old canonical URLs`);

    for (const category of categories) {
      const oldCanonical = category.canonical;
      category.canonical = category.canonical.replace('/blog/category/', '/category/');
      await category.save();
      console.log(`Fixed: ${oldCanonical} -> ${category.canonical}`);
    }

    // Fix tags (just in case)
    const tags = await BlogTag.find({
      canonical: { $regex: /\/blog\/tag\// }
    });

    console.log(`Found ${tags.length} tags with old canonical URLs`);

    for (const tag of tags) {
      const oldCanonical = tag.canonical;
      tag.canonical = tag.canonical.replace('/blog/tag/', '/tag/');
      await tag.save();
      console.log(`Fixed: ${oldCanonical} -> ${tag.canonical}`);
    }

    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixCanonicalUrls();
