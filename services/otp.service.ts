import bcrypt from "bcrypt";
import crypto from "crypto";
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
  const max = 10 ** OTP_LENGTH;
  return String(crypto.randomInt(min, max));
}


export async function createAndSendOtp(
  phone: string,
  skipSms: boolean = false,
  isCustomerApp: boolean = false
) {

  await OtpModel.deleteMany({ phone });

  // Extract only the last 10 digits to handle phone numbers sent with or without +91
  const normalizedPhone = phone.replace(/[^0-9]/g, '').slice(-10);

  const TEST_ACCOUNTS: Record<string, string> = {
    "9876543210": "4829",
    "9876543211": "4829",
    "9876543212": "4829",
  };

  const isTestAccount = TEST_ACCOUNTS[normalizedPhone] !== undefined;
  const code = isTestAccount ? TEST_ACCOUNTS[normalizedPhone] : generateOtpCode();

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

  if (isTestAccount) {
    console.log(`[TEST ACCOUNT] Skipped SMS for test number ${phone}. Using OTP: ${code}`);
    return { ok: true };
  }

  try {
    if (skipSms && process.env.NODE_ENV === "development") {
      console.log(`[2Factor OTP] Skipped sending SMS for user app testing.`);
      return { ok: true };
    }

    const apiKey = config.TWO_FACTOR_API_KEY;
    if (apiKey) {
      const encodedPhone = encodeURIComponent(phone);
      const url = `https://2factor.in/API/V1/${apiKey}/SMS/${encodedPhone}/${code}/ECDKARTOTP`;
      const response = await axios.get(url);
      console.log("[2Factor OTP] Sent successfully");
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
    const apiKey = config.TWO_FACTOR_API_KEY;
    if (apiKey) {
      const encodedPhone = encodeURIComponent(phone);
      const url = `https://2factor.in/API/V1/${apiKey}/SMS/${encodedPhone}/${code}/ECDKARTOTP`;
      const response = await axios.get(url);
      console.log(`[2Factor OTP] Pickup OTP sent to ${phone}`);
    } else {
      console.log(`[2Factor OTP] API key missing, skipped sending pickup OTP to ${phone}`);
    }
  } catch (error: any) {
    console.error("[2Factor OTP] Failed to send pickup OTP:", error.message || error);
  }
}

export async function sendDeliveryOtpSms(phone: string, code: string) {
  try {
    if (process.env.NODE_ENV === "development") {
      console.log(`\n=========================================`);
      console.log(`[TESTING DELIVERY OTP] Send to ${phone}`);
      console.log(`[TESTING DELIVERY OTP] Code is: ${code}`);
      console.log(`=========================================\n`);
    }

    const apiKey = config.TWO_FACTOR_API_KEY;
    if (apiKey) {
      const encodedPhone = encodeURIComponent(phone);
      const url = `https://2factor.in/API/V1/${apiKey}/SMS/${encodedPhone}/${code}/ECDKARTOTP`;
      const response = await axios.get(url);
      console.log(`[2Factor OTP] Delivery OTP sent to ${phone}`);
    } else {
      console.log(`[2Factor OTP] API key missing, skipped sending delivery OTP SMS to ${phone}`);
    }
  } catch (error: any) {

    console.error("[2Factor OTP] Failed to send delivery OTP:", error.message || error);
  }
}

export async function verifyOtp(phone: string, code: string) {
  const otpDoc = await OtpModel.findOne({ phone }).sort({ createdAt: -1 });

  console.log(`\n🔍 [verifyOtp] Found OTP Doc:`, !!otpDoc);
  if (otpDoc) {
    console.log(`🔍 [verifyOtp] otpDoc.used: ${otpDoc.used}`);
    console.log(`🔍 [verifyOtp] otpDoc.codeHash: (hidden)`);
  }

  if (!otpDoc) {
    return {
      ok: false,
      reason: "OTP not found. Please request a new one.",
    };
  }

  if (otpDoc.used) {
    console.error(`❌ [verifyOtp] REJECTING BECAUSE otpDoc.used === true!`);
    return {
      ok: false,
      reason: "OTP already used. Please request a new one.",
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