/**
 * In-process event bus.
 *
 * Bot and admin web server run in the same Node process (Promise.all in
 * src/index.js), so a plain EventEmitter is enough — no Redis pub/sub needed.
 *
 * Currently used to push dispute-chat messages from the bot side to SSE
 * subscribers in the admin panel.
 */

const { EventEmitter } = require('events');

class AppEventBus extends EventEmitter {
  constructor() {
    super();
    // Many concurrent SSE clients can subscribe to the same event — raise
    // the default 10-listener warning ceiling.
    this.setMaxListeners(100);
  }
}

module.exports = new AppEventBus();
