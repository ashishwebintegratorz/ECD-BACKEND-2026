import { z } from "zod";

const phoneSchema = z.string().min(6, "Phone too short");

export const sendOtpSchema = z.object({
  body: z.object({
    phone: phoneSchema,
    role: z.enum(["customer", "driver", "admin"]).optional(),
  }),
});

export const verifyOtpSchema = z.object({
  body: z.object({
    phone: phoneSchema,
    code: z.string().length(6, "OTP must be 6 digits"),
    role: z.enum(["customer", "driver", "admin"]).optional(),
    // For driver/admin first-time or reset pin
    pin: z.string().min(4).max(10).optional(),
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
