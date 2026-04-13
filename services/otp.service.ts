import bcrypt from "bcrypt";
import OtpModel from "../models/Otp.model.js";
import { config } from "../config/app.config.js";
import { sendSms } from "../utils/sms.provider.js";

const OTP_LENGTH = 6;
const OTP_MAX_ATTEMPTS = 5;

const OTP_TTL_MINUTES = Number(config.OTP_EXPIRES_MINUTES || "5");

function generateOtpCode(): string {
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

export async function createAndSendOtp(phone: string) {
  await OtpModel.deleteMany({ phone });

  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await OtpModel.create({
    phone,
    codeHash,
    expiresAt,
    attempts: 0,
    used: false,
  });

  //  ************************** */
  // I have just create the normal basic otp service For Testing purpose 
  // I will create the whatsapp otp service in the next commit
  //  ************************** */
  //  ************************** */
  await sendSms(
    phone,
    `Your login OTP is ${code}. It is valid for ${OTP_TTL_MINUTES} minutes.`
  );

  //  ************************** */
  //  ************************** */

  return { ok: true };
}

export async function verifyOtp(phone: string, code: string) {
  const otpDoc = await OtpModel.findOne({ phone }).sort({ createdAt: -1 });

  if (!otpDoc) {
    return { ok: false, reason: "OTP not found. Please request a new one." };
  }

  if (otpDoc.used) {
    return { ok: false, reason: "OTP already used. Please request a new one." };
  }

  if (otpDoc.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "OTP expired. Please request a new one." };
  }

  if (otpDoc.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: "Too many attempts. Please request a new OTP." };
  }

  const isMatch = await bcrypt.compare(code, otpDoc.codeHash);
  if (!isMatch) {
    otpDoc.attempts += 1;
    await otpDoc.save();
    return { ok: false, reason: "Invalid OTP" };
  }

  otpDoc.used = true;
  await otpDoc.save();

  return { ok: true };
}
