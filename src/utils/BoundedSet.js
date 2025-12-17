/**
 * Bounded Set with FIFO eviction
 *
 * Prevents memory leaks in long-running processes.
 * When max size is reached, oldest entries are removed first.
 */

class BoundedSet {
  constructor(maxSize = 5000) {
    this.maxSize = maxSize;
    this.set = new Set();

    // For FIFO ordering
    this.insertOrder = [];
  }

  /**
   * Add item to set
   * If at max size, removes oldest item first
   */
  add(item) {
    // If already exists, don't add again
    if (this.set.has(item)) {
      return;
    }

    // Evict oldest if at max size
    while (this.set.size >= this.maxSize && this.insertOrder.length > 0) {
      const oldest = this.insertOrder.shift();
      this.set.delete(oldest);
    }

    // Add new item
    this.set.add(item);
    this.insertOrder.push(item);
  }

  /**
   * Check if item exists
   */
  has(item) {
    return this.set.has(item);
  }

  /**
   * Delete specific item
   */
  delete(item) {
    if (this.set.has(item)) {
      this.set.delete(item);
      // Remove from insert order (O(n) but rarely called)
      const idx = this.insertOrder.indexOf(item);
      if (idx !== -1) {
        this.insertOrder.splice(idx, 1);
      }
      return true;
    }
    return false;
  }

  /**
   * Clear all items
   */
  clear() {
    this.set.clear();
    this.insertOrder = [];
  }

  /**
   * Get current size
   */
  get size() {
    return this.set.size;
  }

  /**
   * Iterate over values
   */
  values() {
    return this.set.values();
  }

  /**
   * For...of support
   */
  [Symbol.iterator]() {
    return this.set[Symbol.iterator]();
  }
}

module.exports = BoundedSet;
