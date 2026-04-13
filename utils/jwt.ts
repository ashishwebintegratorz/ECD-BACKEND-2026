import jwt from "jsonwebtoken";
import type { Secret, SignOptions, JwtPayload } from "jsonwebtoken";
import { config } from "../config/app.config.js";

export function signAccessJwt(payload: string | JwtPayload): string {
  const secret: Secret = config.JWT_ACCESS_SECRET;
  const opts: SignOptions = { expiresIn: config.JWT_ACCESS_EXPIRES_IN };
  return jwt.sign(payload, secret, opts);
}

export function verifyAccessJwt<T = JwtPayload>(token: string): T {
  const secret: Secret = config.JWT_ACCESS_SECRET;
  return jwt.verify(token, secret) as T;
}

export function signRefreshJwt(payload: string | JwtPayload): string {
  const secret: Secret = config.JWT_REFRESH_SECRET;
  const opts: SignOptions = { expiresIn: config.JWT_REFRESH_EXPIRES_IN };
  return jwt.sign(payload, secret, opts);
}

export function verifyRefreshJwt<T = JwtPayload>(token: string): T {
  const secret: Secret = config.JWT_REFRESH_SECRET;
  return jwt.verify(token, secret) as T;
}
