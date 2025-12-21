/**
 * Circuit Breaker Pattern
 *
 * Prevents cascading failures when external service (TronGrid) is down.
 * States:
 * - CLOSED: Normal operation, requests go through
 * - OPEN: Service is down, requests fail fast
 * - HALF_OPEN: Testing if service recovered
 */

class CircuitBreaker {
  constructor(options = {}) {
    // Failure threshold to open circuit
    this.failureThreshold = options.failureThreshold || 5;

    // Time to wait before trying again (ms)
    this.resetTimeoutMs = options.resetTimeoutMs || 60000; // 1 minute

    // Time window to count failures (ms)
    this.failureWindowMs = options.failureWindowMs || 30000; // 30 seconds

    // Service name for identification
    this.serviceName = options.serviceName || 'Unknown';

    // Callback for state changes (for admin alerts)
    this.onStateChange = options.onStateChange || null;

    // Current state
    this.state = 'CLOSED';

    // Failure tracking
    this.failures = [];
    this.lastFailureTime = null;

    // Stats
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
      stateChanges: []
    };
  }

  /**
   * Execute function with circuit breaker protection
   * @param {Function} fn - Async function to execute
   * @returns {Promise} Result of function or throws error
   */
  async execute(fn) {
    this.stats.totalCalls++;

    // Check if circuit is open
    if (this.state === 'OPEN') {
      // Check if reset timeout has passed
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.setState('HALF_OPEN');
      } else {
        this.stats.rejectedCalls++;
        throw new Error('Circuit breaker is OPEN - service unavailable');
      }
    }

    try {
      const result = await fn();

      // Success - reset if half-open
      if (this.state === 'HALF_OPEN') {
        this.setState('CLOSED');
        this.failures = [];
      }

      this.stats.successfulCalls++;
      return result;

    } catch (error) {
      this.stats.failedCalls++;
      this.recordFailure();

      // Check if we should open the circuit
      if (this.shouldOpen()) {
        this.setState('OPEN');
        this.lastFailureTime = Date.now();
      }

      throw error;
    }
  }

  /**
   * Record a failure
   */
  recordFailure() {
    const now = Date.now();
    this.failures.push(now);

    // Remove old failures outside window
    this.failures = this.failures.filter(
      time => now - time < this.failureWindowMs
    );
  }

  /**
   * Check if circuit should open
   */
  shouldOpen() {
    return this.failures.length >= this.failureThreshold;
  }

  /**
   * Set state and log
   */
  setState(newState) {
    if (this.state !== newState) {
      const oldState = this.state;
      console.log(`⚡ CircuitBreaker [${this.serviceName}]: ${oldState} → ${newState}`);
      this.stats.stateChanges.push({
        from: oldState,
        to: newState,
        at: new Date().toISOString()
      });
      this.state = newState;

      // Call state change callback (for admin alerts)
      if (this.onStateChange) {
        try {
          this.onStateChange(this.serviceName, oldState, newState);
        } catch (e) {
          console.error('CircuitBreaker onStateChange callback error:', e);
        }
      }
    }
  }

  /**
   * Check if requests are allowed
   */
  isAllowed() {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'HALF_OPEN') return true;

    // OPEN - check timeout
    if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
      this.setState('HALF_OPEN');
      return true;
    }

    return false;
  }

  /**
   * Get current state
   */
  getState() {
    return this.state;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      currentState: this.state,
      recentFailures: this.failures.length
    };
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this.state = 'CLOSED';
    this.failures = [];
    this.lastFailureTime = null;
  }
}

module.exports = CircuitBreaker;
