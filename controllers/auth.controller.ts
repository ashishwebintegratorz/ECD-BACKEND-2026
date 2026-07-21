import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { createAndSendOtp, verifyOtp } from "../services/otp.service.js";
import {
  findOrCreateUserByPhone,
  createAuthTokens,
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
import { verifyRefreshJwt, signAccessJwt } from "../utils/jwt.js";

export const sendOtp = asyncHandler(async (req: Request, res: Response) => {
  const { phone, role } = req.body;
  if (!phone) throw new BadRequestException("Phone required");

  await createAndSendOtp(phone);

  return res.json({
    message: `OTP sent on WhatsApp for ${role || "customer"} login`,
  });
});

/**
 * Verify OTP
 * - Customer: normal OTP login
 * - Driver/Admin: OTP + optional PIN set on first time
 */
export const verifyOtpController = asyncHandler(
  async (req: Request, res: Response) => {
    const { phone, code, role, pin, name } = req.body;

    if (!phone || !code) {
      throw new BadRequestException("Phone and OTP code are required");
    }

    const verification = await verifyOtp(phone, code);
    if (!verification.ok) {
      throw new BadRequestException(verification.reason || "Invalid OTP");
    }

    const isDriver = role === "driver";
    const isAdmin = role === "admin";

    // Enforce PIN only for admin/driver on first registration
    if ((isAdmin || isDriver) && !pin) {
      throw new BadRequestException("PIN is required for admin and driver accounts");
    }

    const user = await findOrCreateUserByPhone(phone, role as any, name);

    // Set PIN for admin or driver
    if ((isAdmin || isDriver) && pin) {
      await setUserPin(user, pin);
    }

    // Reset lockout counter on successful verification
    await clearAccountLockout(user);

    const auth = createAuthTokens(user);

    return res.json({
      token: auth.accessToken,
      refreshToken: auth.refreshToken,
      user: auth.user,
    });
  }
);

/**
 * Admin PIN Login — phone + PIN only, no OTP needed
 */
export const loginWithPin = asyncHandler(
  async (req: Request, res: Response) => {
    const { phone, pin } = req.body;
    const clientIp = (req.headers["x-forwarded-for"] as string || req.ip || "unknown-ip").split(",")[0].trim();

    const user = await UserModel.findOne({ phone });
    if (!user) throw new NotFoundException("User not found");

    // PIN login is admin or driver only
    if (user.role !== "admin" && user.role !== "driver") {
      throw new BadRequestException("PIN login is only for admin and driver accounts");
    }

    if (user.status === "suspended") {
      throw new UnauthorizedException("Your account has been blocked. Please contact admin.");
    }

    // 1. Check if user account is currently locked
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

    const auth = createAuthTokens(user);

    return res.json({
      token: auth.accessToken,
      refreshToken: auth.refreshToken,
      user: auth.user,
    });
  }
);

/**
 * Refresh token – returns new access + refresh + user
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

    const user = await UserModel.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    if (user.status === "suspended") {
      throw new UnauthorizedException("Your account has been blocked. Please contact admin.");
    }

    const auth = createAuthTokens(user);

    return res.json({
      token: auth.accessToken,
      refreshToken: auth.refreshToken,
      user: auth.user,
    });
  }
);

//refresh token controller
export const refreshAccessToken = async (req: Request, res: Response, next: Function) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ message: "Missing refresh token" });
    }

    const payload = verifyRefreshJwt(refreshToken);

    const user = await UserModel.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    if (user.status === "suspended") {
      return res.status(403).json({ message: "Your account has been blocked. Please contact admin." });
    }

    const newAccessToken = signAccessJwt({
      sub: user._id.toString(),
      role: user.role,
    });

    return res.json({ token: newAccessToken });
  } catch (err) {
    next(err);
  }
};