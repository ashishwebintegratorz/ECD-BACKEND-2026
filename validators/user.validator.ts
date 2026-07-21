import { z } from "zod";

const mongoId = z.string().length(24, "Invalid ID format");
const optionalEmail = z.union([z.email("Invalid email format"), z.literal("")]).optional();

// ── User Profile Update ──────────────────────────────────────────────
export const updateUserProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Name must be at least 2 characters").optional(),
    email: optionalEmail,
    avatar: z.union([z.url("Invalid URL format"), z.literal("")]).optional(),
    gender: z.enum(["male", "female", "other"]).optional(),
    dateOfBirth: z.string().optional(),
  }),
});

// ── Address Validation Schemas ────────────────────────────────────────
export const createAddressSchema = z.object({
  body: z.object({
    fullAddress: z.string().min(5, "Full address must be at least 5 characters"),
    apartment: z.string().optional(),
    landmark: z.string().optional(),
    label: z.enum(["Home", "Work", "Other"]).optional(),
    phone: z.string().min(10, "Phone number must be at least 10 digits"),
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    isDefault: z.boolean().optional(),
  }),
});

export const updateAddressSchema = z.object({
  params: z.object({ id: mongoId }),
  body: z.object({
    fullAddress: z.string().min(5).optional(),
    apartment: z.string().optional(),
    landmark: z.string().optional(),
    label: z.enum(["Home", "Work", "Other"]).optional(),
    phone: z.string().min(10).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    isDefault: z.boolean().optional(),
  }),
});

// ── Cart Validation Schemas ───────────────────────────────────────────
export const addToCartSchema = z.object({
  body: z.object({
    productId: mongoId,
    quantity: z.coerce.number().int().positive("Quantity must be a positive integer"),
  }),
});

export const updateCartQuantitySchema = z.object({
  body: z.object({
    productId: mongoId,
    quantity: z.coerce.number().int().min(0, "Quantity cannot be negative"),
  }),
});
