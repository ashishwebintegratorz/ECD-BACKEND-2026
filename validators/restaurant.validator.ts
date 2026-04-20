import { z } from "zod";

export const slugify = (name: string) =>
    name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

// Reusable field helpers for Zod v4
const optionalEmail = z.union([z.email("Invalid email"), z.literal("")]).optional();
const optionalUrl = z.union([z.url("Invalid URL"), z.literal("")]).optional();
const mongoId = z.string().length(24, "Invalid ID");

// ── Create Restaurant ────────────────────────────────────────────
export const createRestaurantSchema = z.object({
    body: z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
        slug: z.string().min(2).optional(),
        storeType: z.enum(["restaurant", "grocery"]).default("restaurant"),
        description: z.string().optional(),
        address: z.string().min(5, "Address must be at least 5 characters"),
        lat: z.coerce.number().min(-90, "lat must be >= -90").max(90, "lat must be <= 90"),
        lng: z.coerce.number().min(-180, "lng must be >= -180").max(180, "lng must be <= 180"),
        phone: z.string().optional(),
        email: optionalEmail,
        logo: optionalUrl,
        coverImage: optionalUrl,
    }),
});

// ── Update Restaurant ────────────────────────────────────────────
export const updateRestaurantSchema = z.object({
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
        storeType: z.enum(["restaurant", "grocery"]).optional(),
    }),
});

// ── Set Admin Rating ─────────────────────────────────────────────
export const setRatingSchema = z.object({
    params: z.object({ id: mongoId }),
    body: z.object({
        rating: z.coerce.number().min(0, "Rating must be >= 0").max(5, "Rating must be <= 5"),
    }),
});

// ── Add Menu Item ────────────────────────────────────────────────
export const addMenuItemSchema = z.object({
    params: z.object({ id: mongoId }),
    body: z.object({
        name: z.string().min(2, "Item name must be at least 2 characters"),
        description: z.string().optional(),
        price: z.coerce.number().positive("Price must be a positive number"),
        image: optionalUrl,
        foodType: z.enum(["veg", "non-veg", "vegan"], { error: "foodType must be veg, non-veg, or vegan" }),
        isAvailable: z.boolean().default(true),
    }),
});

// ── Update Menu Item ─────────────────────────────────────────────
export const updateMenuItemSchema = z.object({
    params: z.object({
        id: mongoId,
        itemId: mongoId,
    }),
    body: z.object({
        name: z.string().min(2).optional(),
        description: z.string().optional(),
        price: z.coerce.number().positive().optional(),
        image: optionalUrl,
        foodType: z.enum(["veg", "non-veg", "vegan"]).optional(),
        isAvailable: z.boolean().optional(),
    }),
});
