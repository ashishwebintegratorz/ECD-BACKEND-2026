import { z } from "zod";

// minim order amout or Slote time

export const createOrderSchema = z.object({
    body: z.object({
        amount: z.number().min(100, "Minmum order amount"),
        items: z.array(z.string()),
        deliverySlot: z.enum(["morning", "afternoon", "evening"]),
        address: z.string().min(1,"Address is required")
    })


});