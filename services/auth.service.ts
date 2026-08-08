import bcrypt from "bcrypt";
import UserModel, { IUser, UserRole } from "../models/User.model.js";
import { signAccessJwt, signRefreshJwt } from "../utils/jwt.js";

export async function findOrCreateUserByPhone(
  phone: string,
  requestedRole?: UserRole,
  name?: string
): Promise<IUser> {
  let user = await UserModel.findOne({ phone });

  if (!user) {
    const isDriver = (requestedRole || "customer") === "driver";
    user = await UserModel.create({
      phone,
      name: name || undefined,
      role: requestedRole || "customer",
      isVerified: true,
      riderId: isDriver ? `DRV-${Math.floor(1000 + Math.random() * 9000)}` : undefined
    });
  } else {
    if (!user.isVerified) user.isVerified = true;

    // Save name if provided and not already set
    if (name && !user.name) user.name = name;

    // Allow upgrading from customer to driver only if creating a driver account specifically
    // Do NOT allow arbitrary upgrades to admin
    if (requestedRole === "driver" && user.role === "customer") {
      user.role = "driver";
      if (!user.riderId) {
        user.riderId = `DRV-${Math.floor(1000 + Math.random() * 9000)}`;
      }
    }

    await user.save();
  }

  return user;
}

export async function setUserPin(user: IUser, pin: string): Promise<IUser> {
  const pinHash = await bcrypt.hash(pin, 10);
  user.pinHash = pinHash;
  await user.save();
  return user;
}

export function createAuthTokens(user: IUser) {
  const payload = {
    sub: user._id.toString(),
    role: user.role,
    phone: user.phone,
    tv: user.tokenVersion || 0,
  };

  const accessToken = signAccessJwt(payload);
  const refreshToken = signRefreshJwt(payload);

  const safeUser = {
    id: user._id.toString(),
    riderId: user.riderId,
    phone: user.phone,
    name: user.name,
    role: user.role,
    isVerified: user.isVerified,
    avatar: user.avatar,
    createdAt: user.createdAt,
    upi: user.upi,
    isOnline: user.isOnline,
    isReturning: user.isReturning,
  };

  return {
    accessToken,
    refreshToken,
    user: safeUser,
  };
}

import crypto from "crypto";
import RefreshTokenModel from "../models/RefreshToken.model.js";

export async function createAuthTokensWithDb(user: IUser, ip?: string, userAgent?: string) {
  const tokens = createAuthTokens(user);
  
  // Store refresh token hash in DB
  const tokenHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  
  // Delete old refresh tokens for this user to prevent duplicate key errors 
  // if the DB index was created as unique, and to keep the collection clean.
  await RefreshTokenModel.deleteMany({ user: user._id });

  await RefreshTokenModel.create({
    user: user._id,
    tokenHash,
    ip,
    userAgent,
    expiresAt
  });
  
  return tokens;
}

export function formatRemainingTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes} minute(s) and ${seconds} second(s)`;
  }
  return `${seconds} second(s)`;
}

export async function checkAccountLockout(user: IUser): Promise<{ isLocked: boolean; remainingText?: string }> {
  if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
    const remainingMs = user.lockUntil.getTime() - Date.now();
    return {
      isLocked: true,
      remainingText: formatRemainingTime(remainingMs),
    };
  }
  // If lock period has expired, clear lockUntil and failedLoginAttempts
  if (user.lockUntil && user.lockUntil.getTime() <= Date.now()) {
    user.lockUntil = undefined as any;
    user.failedLoginAttempts = 0;
    await user.save();
  }
  return { isLocked: false };
}

export async function recordFailedLoginAttempt(user: IUser, clientIp: string): Promise<{ isLockedNow: boolean; attempts: number; remainingText?: string }> {
  user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
  
  if (user.failedLoginAttempts >= 5) {
    user.lockUntil = new Date(Date.now() + 5 * 60 * 1000); // Lock for 5 minutes
    await user.save();
    console.warn(`[SECURITY WARN] Account locked for 5 minutes (phone: ${user.phone}, IP: ${clientIp}) due to 5 consecutive failed login attempts.`);
    return {
      isLockedNow: true,
      attempts: user.failedLoginAttempts,
      remainingText: "5 minute(s) and 0 second(s)",
    };
  } else {
    await user.save();
    console.warn(`[SECURITY LOG] Failed login attempt ${user.failedLoginAttempts}/5 for phone: ${user.phone}, IP: ${clientIp}`);
    return {
      isLockedNow: false,
      attempts: user.failedLoginAttempts,
    };
  }
}

export async function clearAccountLockout(user: IUser): Promise<void> {
  if ((user.failedLoginAttempts && user.failedLoginAttempts > 0) || user.lockUntil) {
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined as any;
    await user.save();
  }
}
