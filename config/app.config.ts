import { getEnv } from "../utils/get-env.js";
import type { Secret } from "jsonwebtoken";

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
};

const appConfig = (): AppConfig => ({
  NODE_ENV: getEnv("NODE_ENV", "development"),
  PORT: getEnv("PORT", "5000"),
  BASE_PATH: getEnv("BASE_PATH", "/api"),
  MONGO_URI: getEnv("MONGO_URI", ""),

  JWT_ACCESS_SECRET: getEnv("JWT_ACCESS_SECRET", "access-secret") as Secret,
  JWT_REFRESH_SECRET: getEnv("JWT_REFRESH_SECRET", "refresh-secret") as Secret,
  JWT_ACCESS_EXPIRES_IN: "365d", // Hardcoded to 1 year to avoid Render env var issues
  JWT_REFRESH_EXPIRES_IN: "365d", // Hardcoded to 1 year

  OTP_EXPIRES_MINUTES: getEnv("OTP_EXPIRES_MINUTES", "5"),
  FRONTEND_ORIGIN: getEnv("FRONTEND_ORIGIN", "https://your-frontend-deployment.com"),
});

export const config = appConfig();
