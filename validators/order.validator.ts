import { z } from "zod";

// minim order amout or Slote time

export const createOrderSchema = z.object({
    body: z.object({
        userId: z.string(),
        items: z.array(z.string()),
        deliverySlot: z.enum(["morning", "afternoon", "evening"]),
        address: z.string().min(1,"Address is required")
    })


});