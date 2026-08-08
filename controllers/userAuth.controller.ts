import type { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { createAndSendOtp, verifyOtp } from "../services/otp.service.js";
import {
  findOrCreateUserByPhone,
  createAuthTokens,
  createAuthTokensWithDb,
} from "../services/auth.service.js";
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "../utils/appError.js";
import UserModel from "../models/User.model.js";
import RefreshTokenModel from "../models/RefreshToken.model.js";
import { verifyRefreshJwt } from "../utils/jwt.js";
import admin from "../config/firebase.config.js";
import crypto from "crypto";

/**
 * CUSTOMER: Send OTP
 */
export const sendOtp = asyncHandler(async (req: Request, res: Response) => {
  const { phone } = req.body;
  if (!phone) throw new BadRequestException("Phone required");

  await createAndSendOtp(phone, false, true);

  return res.json({
    message: `OTP sent on number for customer login`,
  });
});

/**
 * CUSTOMER: Verify OTP
 */
export const verifyOtpController = asyncHandler(
  async (req: Request, res: Response) => {
    try {
      const requestId = Math.random().toString(36).substring(7);
      console.log(`\n[${requestId}] 🔥 verifyOtpController CALLED for ${req.body.phone}`);
      
      const { phone, code, name } = req.body;

      if (!phone || !code) {
        throw new BadRequestException("Phone and OTP code are required");
      }

      const verification = await verifyOtp(phone, code);
      if (!verification.ok) {
        throw new BadRequestException(verification.reason || "Invalid OTP");
      }

      const user = await findOrCreateUserByPhone(phone, "customer", name);
      const ip = (req.headers["x-forwarded-for"] as string || req.ip || "unknown-ip").split(",")[0].trim();
      const userAgent = req.headers["user-agent"];
      const auth = await createAuthTokensWithDb(user, ip, userAgent);

      return res.json({
        token: auth.accessToken,
        refreshToken: auth.refreshToken,
        user: auth.user,
      });
    } catch (error) {
      console.error("🔥 VERIFY OTP FATAL ERROR:", error);
      throw error;
    }
  }
);

/**
 * REFRESH TOKEN (Shared logic, but kept in user controller for cleanliness)
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

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const storedToken = await RefreshTokenModel.findOne({ tokenHash });
    
    if (!storedToken || storedToken.revoked) {
      throw new UnauthorizedException("Invalid or revoked refresh token");
    }

    const user = await UserModel.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException("User not found");
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

export const refreshAccessToken = async (req: Request, res: Response, next: Function) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ message: "Missing refresh token" });
    }

    let payload: any;
    try {
      payload = verifyRefreshJwt(refreshToken);
    } catch {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // Check against DB-stored token hash (rotation system)
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const storedToken = await RefreshTokenModel.findOne({ tokenHash });

    if (!storedToken || storedToken.revoked) {
      return res.status(401).json({ message: "Invalid or revoked refresh token" });
    }

    const user = await UserModel.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // Rotate: revoke old, issue new
    storedToken.revoked = true;
    await storedToken.save();

    const ip = (req.headers["x-forwarded-for"] as string || req.ip || "unknown-ip").split(",")[0].trim();
    const userAgent = req.headers["user-agent"];
    const auth = await createAuthTokensWithDb(user, ip, userAgent);

    return res.json({ token: auth.accessToken, refreshToken: auth.refreshToken });
  } catch (err) {
    next(err);
  }
};

/**
 * GOOGLE: Login (Verify Token)
 */
export const googleLoginController = asyncHandler(async (req: Request, res: Response) => {
  const { idToken } = req.body;

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Check if user already exists by googleId
    let existingUser = await UserModel.findOne({ googleId: decodedToken.uid });
    
    const ip = (req.headers["x-forwarded-for"] as string || req.ip || "unknown-ip").split(",")[0].trim();
    const userAgent = req.headers["user-agent"];

    if (existingUser) {
      const auth = await createAuthTokensWithDb(existingUser, ip, userAgent);
      return res.json({
        token: auth.accessToken,
        refreshToken: auth.refreshToken,
        user: auth.user,
      });
    }

    // STEP 7: Search by Email if googleId not found
    if (decodedToken.email) {
      existingUser = await UserModel.findOne({ email: decodedToken.email });

      if (existingUser) {
        existingUser.googleId = decodedToken.uid;
        existingUser.provider = "google";
        existingUser.emailVerified = true;

        await existingUser.save();

        const auth = await createAuthTokensWithDb(existingUser, ip, userAgent);
        return res.json({
          token: auth.accessToken,
          refreshToken: auth.refreshToken,
          user: auth.user,
        });
      }
    }
    
    // If user completely not found, do not create them yet.
    // Return Google details to the frontend to prompt for a phone number.
    return res.json({
      requiresPhoneVerification: true,
      googleUser: {
        googleId: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
        avatar: decodedToken.picture,
      },
    });
  } catch (error: any) {
    throw new UnauthorizedException(`Firebase token verification failed: ${error.message}`);
  }
});

/**
 * GOOGLE: Verify Phone (After Google Login)
 */
export const verifyGooglePhoneController = asyncHandler(async (req: Request, res: Response) => {
  const { phone, otp, googleId, email, name, avatar } = req.body;

  if (!phone || !otp || !googleId) {
    throw new BadRequestException("Phone, OTP, and googleId are required");
  }

  // 1. Verify the OTP
  const verification = await verifyOtp(phone, otp);
  if (!verification.ok) {
    throw new BadRequestException(verification.reason || "Invalid OTP");
  }

  // 2. Find existing user by phone
  let user = await UserModel.findOne({ phone });

  if (user) {
    // STEP 13: Check Phone -> If exists, return error
    return res.status(400).json({
      message: "Phone already registered"
    });
  }

  // STEP 14: Create User
  user = await UserModel.create({
    phone,
    email: email || undefined,
    googleId,
    provider: "google",
    avatar: avatar || undefined,
    name: name || undefined,
    emailVerified: true,
    role: "customer",
    isVerified: true,
  });

  // 4. Generate Tokens
  const ip = (req.headers["x-forwarded-for"] as string || req.ip || "unknown-ip").split(",")[0].trim();
  const userAgent = req.headers["user-agent"];
  const auth = await createAuthTokensWithDb(user, ip, userAgent);

  return res.json({
    token: auth.accessToken,
    refreshToken: auth.refreshToken,
    user: auth.user,
  });
});
