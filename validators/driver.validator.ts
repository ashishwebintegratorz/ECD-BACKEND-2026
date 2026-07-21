import { z } from "zod";

const mongoId = z.string().length(24, "Invalid ID format");

export const updateDriverStatusSchema = z.object({
  body: z.object({
    isOnline: z.boolean().optional(),
    isAvailable: z.boolean().optional(),
  }),
});

export const updateDriverLocationSchema = z.object({
  body: z.object({
    lat: z.coerce.number().min(-90, "lat must be >= -90").max(90, "lat must be <= 90"),
    lng: z.coerce.number().min(-180, "lng must be >= -180").max(180, "lng must be <= 180"),
    heading: z.coerce.number().min(0).max(360).optional(),
    speed: z.coerce.number().min(0).optional(),
  }),
});

export const updateDriverProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Name must be at least 2 characters").optional(),
    email: z.string().email("Invalid email format").optional(),
    vehicleNumber: z.string().min(3).optional(),
    vehicleType: z.enum(["bike", "scooter", "auto", "car"]).optional(),
    licenseNumber: z.string().optional(),
  }),
});

export const adminVerifyDriverSchema = z.object({
  params: z.object({ driverId: mongoId }),
  body: z.object({
    isApproved: z.boolean(),
    rejectionReason: z.string().optional(),
  }),
});
