import { z } from "zod";

const optionalEmail = z.union([z.email("Invalid email"), z.literal("")]).optional();
const optionalUrl = z.union([z.url("Invalid URL"), z.literal("")]).optional();
const mongoId = z.string().length(24, "Invalid ID");

// ── Create Grocery Store ─────────────────────────────────────────
export const createGrocerySchema = z.object({
    body: z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
        slug: z.string().min(2).optional(),
        description: z.string().optional(),
        address: z.string().min(5, "Address must be at least 5 characters"),
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
        phone: z.string().optional(),
        email: optionalEmail,
        logo: optionalUrl,
        coverImage: optionalUrl,
    }),
});

// ── Update Grocery Store ─────────────────────────────────────────
export const updateGrocerySchema = z.object({
    params: z.object({ id: mongoId }),
    body: z.object({
        name: z.string().min(2).optional(),
        slug: z.string().min(2).optional(),
        description: z.string().optional(),
        address: z.string().min(5).optional(),
        lat: z.coerce.number().min(-90).max(90).optional(),
        lng: z.coerce.number().min(-180).max(180).optional(),
        phone: z.string().optional(),
        email: optionalEmail,
        logo: optionalUrl,
        coverImage: optionalUrl,
        isActive: z.boolean().optional(),
        featured: z.boolean().optional(),
    }),
});

// ── Set Rating ───────────────────────────────────────────────────
export const setGroceryRatingSchema = z.object({
    params: z.object({ id: mongoId }),
    body: z.object({
        rating: z.coerce.number().min(0).max(5),
    }),
});
