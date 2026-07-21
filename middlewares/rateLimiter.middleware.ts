import rateLimit from "express-rate-limit";

/**
 * Strict authentication limiter for verification, login, and refresh endpoints
 * Max 10 requests per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { message: "Too many authentication attempts. Please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * General API limiter
 * Max 200 requests per minute per IP
 */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { message: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});
