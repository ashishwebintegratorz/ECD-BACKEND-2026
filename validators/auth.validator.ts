import { z } from "zod";

const phoneSchema = z.string().regex(/^(?:\+91|91)?\d{10}$/, "Phone must be a valid 10-digit number with optional country code");

export const sendOtpSchema = z.object({
  body: z.object({
    phone: phoneSchema,
    role: z.enum(["customer", "driver", "admin"]).optional(),
  }),
});

export const verifyOtpSchema = z.object({
  body: z.object({
    phone: phoneSchema,
    code: z.string().length(4, "OTP must be 4 digits"),
    role: z.enum(["customer", "driver", "admin"]).optional(),
    name: z.string().min(2, "Name must be at least 2 characters").optional(),
    pin: z.string().min(4, "PIN must be at least 4 digits").max(10).optional(),
  }),
});

export const loginWithPinSchema = z.object({
  body: z.object({
    phone: phoneSchema,
    pin: z.string().min(4).max(10),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(10),
  }),
});

export const googleLoginSchema = z.object({
  body: z.object({
    idToken: z.string().min(1, "idToken is required"),
  }),
});

export const verifyGooglePhoneSchema = z.object({
  body: z.object({
    phone: phoneSchema,
    otp: z.string().length(4, "OTP must be 4 digits"),
    googleId: z.string().min(1, "googleId is required"),
    email: z.string().email("Invalid email").optional(),
    name: z.string().min(2, "Name must be at least 2 characters").optional(),
    avatar: z.string().url("Invalid avatar URL").optional(),
  }),
});
