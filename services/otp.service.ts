import bcrypt from "bcrypt";
import axios from "axios";
import OtpModel from "../models/Otp.model.js";
import { config } from "../config/app.config.js";

const OTP_LENGTH = 4;
const OTP_MAX_ATTEMPTS = 5;

const OTP_TTL_MINUTES = Number(
  config.OTP_EXPIRES_MINUTES || "5"
);

function generateOtpCode(): string {

  const min = 10 ** (OTP_LENGTH - 1);

  const max = 10 ** OTP_LENGTH - 1;

  return String(

    Math.floor(
      Math.random() * (max - min + 1)
    ) + min

  );

}

export async function createAndSendOtp(
  phone: string,
  skipSms: boolean = false
) {

  await OtpModel.deleteMany({ phone });

  const code = generateOtpCode();
  console.log("OTP CODE:", code);

  const codeHash =
    await bcrypt.hash(code, 10);

  const expiresAt = new Date(

    Date.now() +
    OTP_TTL_MINUTES * 60 * 1000

  );

  await OtpModel.create({

    phone,

    codeHash,

    expiresAt,

    attempts: 0,

    used: false,

  });

  try {
    if (skipSms) {
      console.log(`[2Factor OTP] Skipped sending SMS for user app testing. Code: ${code}`);
      return { ok: true };
    }

    const apiKey = process.env.TWO_FACTOR_API_KEY;
    if (apiKey) {
      const url = `https://2factor.in/API/V1/${apiKey}/SMS/${phone}/${code}`;
      const response = await axios.get(url);
      console.log("[2Factor OTP] Sent successfully:", response.data);
    } else {
      console.log("[2Factor OTP] API key missing, skipped sending");
    }
  } catch (error: any) {
    console.error("[2Factor OTP] Failed to send:", error.message || error);
  }

  return { ok: true };

}

export async function sendPickupOtpSms(phone: string, code: string) {
  try {
    const apiKey = process.env.TWO_FACTOR_API_KEY;
    if (apiKey) {
      const url = `https://2factor.in/API/V1/${apiKey}/SMS/${phone}/${code}`;
      const response = await axios.get(url);
      console.log(`[2Factor OTP] Pickup OTP sent to ${phone}:`, response.data);
    } else {
      console.log(`[2Factor OTP] API key missing, skipped sending pickup OTP to ${phone}`);
    }
  } catch (error: any) {
    console.error("[2Factor OTP] Failed to send pickup OTP:", error.message || error);
  }
}

export async function verifyOtp(
  phone: string,
  code: string
) {

  const otpDoc =
    await OtpModel.findOne({ phone })
      .sort({ createdAt: -1 });

  if (!otpDoc) {

    return {

      ok: false,

      reason:
        "OTP not found. Please request a new one.",

    };

  }

  if (otpDoc.used) {

    return {

      ok: false,

      reason:
        "OTP already used. Please request a new one.",

    };

  }

  if (
    otpDoc.expiresAt.getTime() <
    Date.now()
  ) {

    return {

      ok: false,

      reason:
        "OTP expired. Please request a new one.",

    };

  }

  if (
    otpDoc.attempts >= OTP_MAX_ATTEMPTS
  ) {

    return {

      ok: false,

      reason:
        "Too many attempts. Please request a new OTP.",

    };

  }

  const isMatch =
    await bcrypt.compare(
      code,
      otpDoc.codeHash
    );

  if (!isMatch) {

    otpDoc.attempts += 1;

    await otpDoc.save();

    return {

      ok: false,

      reason: "Invalid OTP",

    };

  }

  otpDoc.used = true;

  await otpDoc.save();

  return { ok: true };

}