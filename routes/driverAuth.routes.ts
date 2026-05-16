import { Router } from "express";
import * as authCtrl from "../controllers/driverAuth.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  sendOtpSchema,
  verifyOtpSchema,
  loginWithPinSchema,
  refreshTokenSchema,
} from "../validators/auth.validator.js";

const router = Router();

router.post("/send-otp", validate(sendOtpSchema), authCtrl.sendOtp);
router.post("/verify-otp", validate(verifyOtpSchema), authCtrl.verifyOtpController);
router.post(
  "/login-with-pin",
  validate(loginWithPinSchema),
  authCtrl.loginWithPin
);
router.post(
  "/refresh-token",
  validate(refreshTokenSchema),
  authCtrl.refreshTokenController
);

export default router;
