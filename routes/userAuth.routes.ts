import { Router } from "express";
import * as authCtrl from "../controllers/userAuth.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  sendOtpSchema,
  verifyOtpSchema,
  refreshTokenSchema,
} from "../validators/auth.validator.js";

const router = Router();

router.post("/send-otp", validate(sendOtpSchema), authCtrl.sendOtp);
router.post("/verify-otp", validate(verifyOtpSchema), authCtrl.verifyOtpController);
router.post(
  "/refresh-token",
  validate(refreshTokenSchema),
  authCtrl.refreshTokenController
);
router.post("/refresh", authCtrl.refreshAccessToken);

export default router;
