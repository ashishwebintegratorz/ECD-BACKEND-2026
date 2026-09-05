import { z } from "zod";

const mongoId = z.string().length(24, "Invalid MongoDB ObjectId");

export const createCityZoneSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Zone / Area name must be at least 2 characters").optional(),
    state: z.string().optional(),
    city: z.string().optional(),
    lat: z.number().min(-90).max(90, "Valid latitude required").optional(),
    lng: z.number().min(-180).max(180, "Valid longitude required").optional(),
    radiusKm: z.number().min(0.5).max(100).default(15).optional(),
    isActive: z.boolean().optional().default(true),
  }),
});

export const updateCityZoneSchema = z.object({
  params: z.object({ id: mongoId }),
  body: z.object({
    state: z.string().min(2).optional(),
    city: z.string().min(2).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const addSubAreaSchema = z.object({
  params: z.object({ zoneId: mongoId }),
  body: z.object({
    name: z.string().min(2, "Sub-area / Zone name is required"),
    lat: z.number().min(-90).max(90, "Valid latitude required"),
    lng: z.number().min(-180).max(180, "Valid longitude required"),
    radiusKm: z.number().min(0.5).max(100).default(10),
    isActive: z.boolean().optional().default(true),
  }),
});

export const updateSubAreaSchema = z.object({
  params: z.object({ zoneId: mongoId, subAreaId: mongoId }),
  body: z.object({
    name: z.string().min(2).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    radiusKm: z.number().min(0.5).max(100).optional(),
    isActive: z.boolean().optional(),
  }),
});
