import type { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { createAndSendOtp, verifyOtp } from "../services/otp.service.js";
import {
  findOrCreateUserByPhone,
  createAuthTokens,
} from "../services/auth.service.js";
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "../utils/appError.js";
import UserModel from "../models/User.model.js";
import { verifyRefreshJwt, signAccessJwt } from "../utils/jwt.js";
import admin from "../config/firebase.config.js";

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
    const { phone, code, name } = req.body;

    if (!phone || !code) {
      throw new BadRequestException("Phone and OTP code are required");
    }

    const verification = await verifyOtp(phone, code);
    if (!verification.ok) {
      throw new BadRequestException(verification.reason || "Invalid OTP");
    }

    const user = await findOrCreateUserByPhone(phone, "customer", name);
    const auth = createAuthTokens(user);

    return res.json({
      token: auth.accessToken,
      refreshToken: auth.refreshToken,
      user: auth.user,
    });
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

    const user = await UserModel.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    const auth = createAuthTokens(user);

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

    const payload = verifyRefreshJwt(refreshToken);

    const user = await UserModel.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: "Invalid refresh token" });
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

/**
 * GOOGLE: Login (Verify Token)
 */
export const googleLoginController = asyncHandler(async (req: Request, res: Response) => {
  const { idToken } = req.body;

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Check if user already exists by googleId
    let existingUser = await UserModel.findOne({ googleId: decodedToken.uid });

    if (existingUser) {
      const auth = createAuthTokens(existingUser);
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

        const auth = createAuthTokens(existingUser);
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
  const auth = createAuthTokens(user);

  return res.json({
    token: auth.accessToken,
    refreshToken: auth.refreshToken,
    user: auth.user,
  });
});
