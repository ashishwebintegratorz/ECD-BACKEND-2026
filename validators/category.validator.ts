import { z } from "zod";

export const addCategorySchema = z.object({
  body: z.object({
    name: z.string().min(2, "Category name must be at least 2 characters"),
    parent: z.string().optional(),
    ordering: z.string().regex(/^\d+$/, "Ordering must be a number").optional(),
  }),
});

export const updateCategorySchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    parent: z.string().optional(),
    ordering: z.string().regex(/^\d+$/).optional(),
  }),
});
