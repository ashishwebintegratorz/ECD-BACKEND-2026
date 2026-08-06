import { z } from "zod";
import type { Secret } from "jsonwebtoken";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.string().default("5000"),
  BASE_PATH: z.string().default("/api/v1"),
  MONGO_URI: z.string().min(1, "MONGO_URI is required"),

  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),

  OTP_EXPIRES_MINUTES: z.string().default("5"),
  FRONTEND_ORIGIN: z.string().default("http://localhost:5173"),

  RAZORPAY_KEY_ID: z.string().default(""),
  RAZORPAY_KEY_SECRET: z.string().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(""),

  IMAGEKIT_PUBLIC_KEY: z.string().default(""),
  IMAGEKIT_PRIVATE_KEY: z.string().default(""),
  IMAGEKIT_URL_ENDPOINT: z.string().default(""),

  TWO_FACTOR_API_KEY: z.string().default(""),
  AISENSY_API_KEY: z.string().default(""),
  AISENSY_CAMPAIGN_NAME: z.string().default("otp_verification"),
  GOOGLE_MAPS_API_KEY: z.string().default(""),

  FIREBASE_SERVICE_ACCOUNT: z.string().default(""),
  PLATFORM_REF_ID: z.string().default("000000000000000000000000"),
});

export type AppConfig = {
  NODE_ENV: string;
  PORT: string;
  BASE_PATH: string;
  MONGO_URI: string;

  JWT_ACCESS_SECRET: Secret;
  JWT_REFRESH_SECRET: Secret;
  JWT_ACCESS_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;

  OTP_EXPIRES_MINUTES: string;
  FRONTEND_ORIGIN: string;

  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
  RAZORPAY_WEBHOOK_SECRET: string;

  IMAGEKIT_PUBLIC_KEY: string;
  IMAGEKIT_PRIVATE_KEY: string;
  IMAGEKIT_URL_ENDPOINT: string;

  TWO_FACTOR_API_KEY: string;
  AISENSY_API_KEY: string;
  AISENSY_CAMPAIGN_NAME: string;
  GOOGLE_MAPS_API_KEY: string;

  FIREBASE_SERVICE_ACCOUNT: string;
  PLATFORM_REF_ID: string;
};

const parseConfig = (): AppConfig => {
  const result = envSchema.safeParse(process.env);
  if (!result.success && process.env.NODE_ENV === "production") {
    console.error("❌ Invalid environment variables configuration:", result.error.format());
    throw new Error("Invalid environment configuration. Check server configuration.");
  }
  
  const env = result.success ? result.data : (process.env as any);

  return {
    NODE_ENV: env.NODE_ENV || "development",
    PORT: env.PORT || "5000",
    BASE_PATH: env.BASE_PATH || "/api/v1",
    MONGO_URI: env.MONGO_URI || "",

    JWT_ACCESS_SECRET: (env.JWT_ACCESS_SECRET || "super-long-random-access-secret") as Secret,
    JWT_REFRESH_SECRET: (env.JWT_REFRESH_SECRET || "super-long-random-refresh-secret") as Secret,
    JWT_ACCESS_EXPIRES_IN: env.JWT_ACCESS_EXPIRES_IN || "15m",
    JWT_REFRESH_EXPIRES_IN: env.JWT_REFRESH_EXPIRES_IN || "30d",

    OTP_EXPIRES_MINUTES: env.OTP_EXPIRES_MINUTES || "5",
    FRONTEND_ORIGIN: env.FRONTEND_ORIGIN || "http://localhost:5173",

    RAZORPAY_KEY_ID: env.RAZORPAY_KEY_ID || "",
    RAZORPAY_KEY_SECRET: env.RAZORPAY_KEY_SECRET || "",
    RAZORPAY_WEBHOOK_SECRET: env.RAZORPAY_WEBHOOK_SECRET || "",

    IMAGEKIT_PUBLIC_KEY: env.IMAGEKIT_PUBLIC_KEY || "",
    IMAGEKIT_PRIVATE_KEY: env.IMAGEKIT_PRIVATE_KEY || "",
    IMAGEKIT_URL_ENDPOINT: env.IMAGEKIT_URL_ENDPOINT || "",

    TWO_FACTOR_API_KEY: env.TWO_FACTOR_API_KEY || "",
    AISENSY_API_KEY: env.AISENSY_API_KEY || "",
    AISENSY_CAMPAIGN_NAME: env.AISENSY_CAMPAIGN_NAME || "otp_verification",
    GOOGLE_MAPS_API_KEY: env.GOOGLE_MAPS_API_KEY || "",

    FIREBASE_SERVICE_ACCOUNT: env.FIREBASE_SERVICE_ACCOUNT || "",
    PLATFORM_REF_ID: env.PLATFORM_REF_ID || "000000000000000000000000",
  };
};

export const config = parseConfig();

