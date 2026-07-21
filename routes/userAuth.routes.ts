import { Router } from "express";
import * as authCtrl from "../controllers/userAuth.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  sendOtpSchema,
  verifyOtpSchema,
  refreshTokenSchema,
  googleLoginSchema,
  verifyGooglePhoneSchema,
} from "../validators/auth.validator.js";

import { otpRateLimiter } from "../middlewares/otpRateLimiter.middleware.js";
import { authLimiter } from "../middlewares/rateLimiter.middleware.js";

const router = Router();

router.post("/send-otp", otpRateLimiter, validate(sendOtpSchema), authCtrl.sendOtp);
router.post("/verify-otp", authLimiter, validate(verifyOtpSchema), authCtrl.verifyOtpController);
router.post(
  "/refresh-token",
  authLimiter,
  validate(refreshTokenSchema),
  authCtrl.refreshTokenController
);
router.post("/refresh", authLimiter, authCtrl.refreshAccessToken);

router.post("/google", authLimiter, validate(googleLoginSchema), authCtrl.googleLoginController);
router.post("/verify-google-phone", authLimiter, validate(verifyGooglePhoneSchema), authCtrl.verifyGooglePhoneController);

export default router;
