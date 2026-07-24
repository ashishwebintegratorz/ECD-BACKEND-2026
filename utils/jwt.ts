import jwt from "jsonwebtoken";
import type { Secret, SignOptions, JwtPayload } from "jsonwebtoken";
import { config } from "../config/app.config.js";

export function signAccessJwt(payload: string | JwtPayload): string {
  const secret: Secret = config.JWT_ACCESS_SECRET;
  const opts: SignOptions = { expiresIn: config.JWT_ACCESS_EXPIRES_IN };
  return jwt.sign(payload, secret, opts);
}

export function verifyAccessJwt<T = JwtPayload>(token: string): T {
  const primarySecret: Secret = config.JWT_ACCESS_SECRET;
  try {
    return jwt.verify(token, primarySecret) as T;
  } catch (err) {
    const fallbackSecretsRaw = process.env.JWT_ACCESS_SECRET_FALLBACKS;
    if (fallbackSecretsRaw) {
      const fallbacks = fallbackSecretsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      for (const fallback of fallbacks) {
        try {
          return jwt.verify(token, fallback) as T;
        } catch {
          // continue checking remaining fallbacks
        }
      }
    }
    throw err;
  }
}

export function signRefreshJwt(payload: string | JwtPayload): string {
  const secret: Secret = config.JWT_REFRESH_SECRET;
  const opts: SignOptions = { expiresIn: config.JWT_REFRESH_EXPIRES_IN };
  return jwt.sign(payload, secret, opts);
}

export function verifyRefreshJwt<T = JwtPayload>(token: string): T {
  const primarySecret: Secret = config.JWT_REFRESH_SECRET;
  try {
    return jwt.verify(token, primarySecret) as T;
  } catch (err) {
    const fallbackSecretsRaw = process.env.JWT_REFRESH_SECRET_FALLBACKS;
    if (fallbackSecretsRaw) {
      const fallbacks = fallbackSecretsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      for (const fallback of fallbacks) {
        try {
          return jwt.verify(token, fallback) as T;
        } catch {
          // continue checking remaining fallbacks
        }
      }
    }
    throw err;
  }
}

