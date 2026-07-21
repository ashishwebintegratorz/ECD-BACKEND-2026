import type { Request, Response, NextFunction } from "express";
import { TooManyRequestsException } from "../utils/appError.js";

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

// Memory stores for IP and Phone limits
const ipStore = new Map<string, RateLimitRecord>();
const phoneStore = new Map<string, RateLimitRecord>();

// Configurable thresholds
const PHONE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const PHONE_MAX_ATTEMPTS = 3;            // Max 3 OTP requests per phone per window

const IP_WINDOW_MS = 15 * 60 * 1000;    // 15 minutes
const IP_MAX_ATTEMPTS = 10;              // Max 10 OTP requests per IP per window

/**
 * Cleanup expired entries every 5 minutes to prevent memory leaks
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of ipStore.entries()) {
    if (now > record.resetTime) ipStore.delete(key);
  }
  for (const [key, record] of phoneStore.entries()) {
    if (now > record.resetTime) phoneStore.delete(key);
  }
}, 5 * 60 * 1000);

function formatRemainingTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes} minute(s) and ${seconds} second(s)`;
  }
  return `${seconds} second(s)`;
}

export const otpRateLimiter = (req: Request, _res: Response, next: NextFunction) => {
  const now = Date.now();
  const clientIp = (req.headers["x-forwarded-for"] as string || req.ip || "unknown-ip").split(",")[0].trim();
  const phone = req.body?.phone ? String(req.body.phone).trim() : null;

  // 1. IP-based Rate Limit Check
  if (clientIp) {
    const ipRecord = ipStore.get(clientIp);
    if (ipRecord) {
      if (now > ipRecord.resetTime) {
        ipStore.set(clientIp, { count: 1, resetTime: now + IP_WINDOW_MS });
      } else {
        if (ipRecord.count >= IP_MAX_ATTEMPTS) {
          const remaining = formatRemainingTime(ipRecord.resetTime - now);
          console.warn(`[SECURITY WARN] OTP IP rate limit exceeded for IP: ${clientIp}`);
          return next(
            new TooManyRequestsException(
              `Too many OTP requests from this IP address. Please try again in ${remaining}.`
            )
          );
        }
        ipRecord.count += 1;
      }
    } else {
      ipStore.set(clientIp, { count: 1, resetTime: now + IP_WINDOW_MS });
    }
  }

  // 2. Phone-based Rate Limit Check
  if (phone) {
    const phoneRecord = phoneStore.get(phone);
    if (phoneRecord) {
      if (now > phoneRecord.resetTime) {
        phoneStore.set(phone, { count: 1, resetTime: now + PHONE_WINDOW_MS });
      } else {
        if (phoneRecord.count >= PHONE_MAX_ATTEMPTS) {
          const remaining = formatRemainingTime(phoneRecord.resetTime - now);
          console.warn(`[SECURITY WARN] OTP Phone rate limit exceeded for phone: ${phone}`);
          return next(
            new TooManyRequestsException(
              `Too many OTP requests for this phone number. Please try again in ${remaining}.`
            )
          );
        }
        phoneRecord.count += 1;
      }
    } else {
      phoneStore.set(phone, { count: 1, resetTime: now + PHONE_WINDOW_MS });
    }
  }

  next();
};

export default otpRateLimiter;
