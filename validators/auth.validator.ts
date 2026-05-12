import { z } from "zod";

const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, "Phone must be exactly 10 digits");

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
