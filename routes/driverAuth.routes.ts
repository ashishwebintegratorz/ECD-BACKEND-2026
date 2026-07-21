import { Router } from "express";
import * as authCtrl from "../controllers/driverAuth.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  sendOtpSchema,
  verifyOtpSchema,
  loginWithPinSchema,
  refreshTokenSchema,
} from "../validators/auth.validator.js";

import { otpRateLimiter } from "../middlewares/otpRateLimiter.middleware.js";
import { authLimiter } from "../middlewares/rateLimiter.middleware.js";

const router = Router();

router.post("/send-otp", otpRateLimiter, validate(sendOtpSchema), authCtrl.sendOtp);
router.post("/verify-otp", authLimiter, validate(verifyOtpSchema), authCtrl.verifyOtpController);
router.post(
  "/login-with-pin",
  authLimiter,
  validate(loginWithPinSchema),
  authCtrl.loginWithPin
);
router.post(
  "/refresh-token",
  authLimiter,
  validate(refreshTokenSchema),
  authCtrl.refreshTokenController
);

export default router;
