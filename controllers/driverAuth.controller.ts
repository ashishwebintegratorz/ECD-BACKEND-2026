import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { createAndSendOtp, verifyOtp } from "../services/otp.service.js";
import {
  findOrCreateUserByPhone,
  createAuthTokens,
  setUserPin,
} from "../services/auth.service.js";
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "../utils/appError.js";
import UserModel from "../models/User.model.js";
import { verifyRefreshJwt, signAccessJwt } from "../utils/jwt.js";

/**
 * DRIVER: Send OTP
 */
export const sendOtp = asyncHandler(async (req: Request, res: Response) => {
  const { phone } = req.body;
  if (!phone) throw new BadRequestException("Phone required");

  // Check if driver already exists
  const existingDriver = await UserModel.findOne({ phone, role: "driver" });
  if (existingDriver) {
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

    if (!pin) {
      throw new BadRequestException("4-digit PIN is required for driver accounts");
    }

    const user = await findOrCreateUserByPhone(phone, "driver", name);
    await setUserPin(user, pin);

    const auth = createAuthTokens(user);

    return res.json({
      token: auth.accessToken,
      refreshToken: auth.refreshToken,
      user: auth.user,
    });
  }
);

/**
 * DRIVER: Login with 4-digit PIN
 */
export const loginWithPin = asyncHandler(
  async (req: Request, res: Response) => {
    const { phone, pin } = req.body;

    const user = await UserModel.findOne({ phone, role: "driver" });
    if (!user) throw new NotFoundException("Driver not found");

    if (!user.pinHash) {
      throw new BadRequestException(
        "PIN not set. Please register via OTP first to set your PIN."
      );
    }

    const ok = await bcrypt.compare(pin, user.pinHash);
    if (!ok) throw new UnauthorizedException("Invalid PIN");

    const auth = createAuthTokens(user);

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

    const user = await UserModel.findById(payload.sub);
    if (!user || user.role !== "driver") {
      throw new UnauthorizedException("Unauthorized access");
    }

    const auth = createAuthTokens(user);

    return res.json({
      token: auth.accessToken,
      refreshToken: auth.refreshToken,
      user: auth.user,
    });
  }
);
