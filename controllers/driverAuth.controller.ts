import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { createAndSendOtp, verifyOtp } from "../services/otp.service.js";
import {
  findOrCreateUserByPhone,
  createAuthTokens,
  createAuthTokensWithDb,
  setUserPin,
  checkAccountLockout,
  recordFailedLoginAttempt,
  clearAccountLockout,
} from "../services/auth.service.js";
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "../utils/appError.js";
import UserModel from "../models/User.model.js";
import { verifyRefreshJwt } from "../utils/jwt.js";

/**
 * DRIVER: Send OTP
 */
export const sendOtp = asyncHandler(async (req: Request, res: Response) => {
  const { phone } = req.body;
  if (!phone) throw new BadRequestException("Phone required");

  // Check if driver already exists
  const existingDriver = await UserModel.findOne({ phone, role: "driver" });
  if (existingDriver) {
    if (existingDriver.status === "suspended") {
      throw new UnauthorizedException("Your account is suspended. You have to connect to admin.");
    }
    return res.json({
      exists: true,
      message: "Driver account already exists. Please login with PIN.",
    });
  }

  await createAndSendOtp(phone);

  return res.json({
    exists: false,
    message: `OTP sent on WhatsApp for driver login`,
  });
});

/**
 * DRIVER: Verify OTP + Set 4-digit PIN
 */
export const verifyOtpController = asyncHandler(
  async (req: Request, res: Response) => {
    const { phone, code, pin, name } = req.body;

    if (!phone || !code) {
      throw new BadRequestException("Phone and OTP code are required");
    }

    const verification = await verifyOtp(phone, code);
    if (!verification.ok) {
      throw new BadRequestException(verification.reason || "Invalid OTP");
    }

    let user = await UserModel.findOne({ phone, role: "driver" });
    
    if (user) {
      // Existing driver - regular login
      await clearAccountLockout(user);

      const ip = (req.headers["x-forwarded-for"] as string || req.ip || "unknown-ip").split(",")[0].trim();
      const userAgent = req.headers["user-agent"];
      const auth = await createAuthTokensWithDb(user, ip, userAgent);

      return res.json({
        token: auth.accessToken,
        refreshToken: auth.refreshToken,
        user: auth.user,
      });
    } else {
      // New driver - onboarding phase. Do NOT save to DB yet.
      const { signAccessJwt } = await import("../utils/jwt.js");
      const tempId = "temp_" + Date.now();
      
      const tempToken = signAccessJwt({
        sub: tempId,
        phone: phone,
        role: "driver",
        onboarding: true
      });

      return res.json({
        token: tempToken,
        refreshToken: "", 
        user: {
          _id: tempId,
          phone: phone,
          name: name || "",
          role: "driver",
          isVerified: true
        }
      });
    }
  }
);

/**
 * DRIVER: Login with 4-digit PIN
 */
export const loginWithPin = asyncHandler(
  async (req: Request, res: Response) => {
    const { phone, pin } = req.body;
    const clientIp = (req.headers["x-forwarded-for"] as string || req.ip || "unknown-ip").split(",")[0].trim();

    const user = await UserModel.findOne({ phone, role: "driver" });
    if (!user) throw new NotFoundException("Driver not found");

    if (user.status === "suspended") {
      throw new UnauthorizedException("Your account is suspended. You have to connect to admin.");
    }

    // 1. Check if driver account is currently locked
    const lockout = await checkAccountLockout(user);
    if (lockout.isLocked) {
      throw new UnauthorizedException(
        `Account is locked due to 5 consecutive failed login attempts. Please try again in ${lockout.remainingText}.`
      );
    }

    if (!user.pinHash) {
      throw new BadRequestException(
        "PIN not set. Please register via OTP first to set your PIN."
      );
    }

    const ok = await bcrypt.compare(pin, user.pinHash);
    if (!ok) {
      const failure = await recordFailedLoginAttempt(user, clientIp);
      if (failure.isLockedNow) {
        throw new UnauthorizedException(
          `Account is locked due to 5 consecutive failed login attempts. Please try again in ${failure.remainingText}.`
        );
      }
      const attemptsRemaining = 5 - failure.attempts;
      throw new UnauthorizedException(
        `Invalid PIN. ${attemptsRemaining} attempt(s) remaining before account lockout.`
      );
    }

    // 2. Clear lockout counter on successful authentication
    await clearAccountLockout(user);

    const userAgent = req.headers["user-agent"];
    const auth = await createAuthTokensWithDb(user, clientIp, userAgent);

    return res.json({
      token: auth.accessToken,
      refreshToken: auth.refreshToken,
      user: auth.user,
    });
  }
);

/**
 * DRIVER: Refresh Token
 */
export const refreshTokenController = asyncHandler(
  async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw new UnauthorizedException("Missing refresh token");
    }

    let payload: any;
    try {
      payload = verifyRefreshJwt(refreshToken);
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const crypto = await import("crypto");
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const RefreshTokenModel = (await import("../models/RefreshToken.model.js")).default;
    const storedToken = await RefreshTokenModel.findOne({ tokenHash });
    
    if (!storedToken || storedToken.revoked) {
      throw new UnauthorizedException("Invalid or revoked refresh token");
    }

    const user = await UserModel.findById(payload.sub);
    if (!user || user.role !== "driver") {
      throw new UnauthorizedException("Unauthorized access");
    }

    if (user.status === "suspended") {
      throw new UnauthorizedException("Your account has been blocked. Please contact admin.");
    }

    // Revoke old token and create new one (Rotation)
    storedToken.revoked = true;
    await storedToken.save();

    const ip = (req.headers["x-forwarded-for"] as string || req.ip || "unknown-ip").split(",")[0].trim();
    const userAgent = req.headers["user-agent"];
    const auth = await createAuthTokensWithDb(user, ip, userAgent);

    return res.json({
      token: auth.accessToken,
      refreshToken: auth.refreshToken,
      user: auth.user,
    });
  }
);
