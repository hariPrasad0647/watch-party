import { redis } from './index.js';

/**
 * A simple reusable token-bucket or fixed-window rate limiter using Redis.
 * This ensures rate limits work across multiple Node instances.
 */
export class RateLimiter {
  /**
   * Checks if an action is allowed based on the rate limit.
   * Increments the counter and returns true if allowed, false if limit exceeded.
   * Uses a fixed window approach for simplicity and performance.
   *
   * @param key Unique key for the rate limit (e.g. `rate-limit:chat:${roomId}:${userId}`)
   * @param limit Maximum number of requests allowed in the window
   * @param windowSeconds The time window in seconds
   * @returns Promise<boolean> True if allowed, false otherwise
   */
  static async checkLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    try {
      const current = await redis.incr(key);
      if (current === 1) {
        // Set expiry on the first increment
        await redis.expire(key, windowSeconds);
      }
      return current <= limit;
    } catch (err) {
      // If Redis fails, we can choose to either fail open or fail closed.
      // Failing open is generally better for user experience during cache degradation,
      // unless strict security is required.
      return true;
    }
  }
}
