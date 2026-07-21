import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { BadRequestException } from "../utils/appError.js";

/**
 * Middleware factory to validate that specified route parameters are valid 24-character hexadecimal MongoDB ObjectIds.
 * Prevents unhandled Mongoose CastError 500 crashes and invalid database queries.
 * 
 * Usage: router.get("/:id", validateObjectId("id"), controller);
 *        router.get("/:restaurantId/menu/:itemId", validateObjectId("restaurantId", "itemId"), controller);
 */
export const validateObjectId = (...paramNames: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    for (const name of paramNames) {
      const paramValue = req.params[name];
      if (typeof paramValue === "string" && !mongoose.Types.ObjectId.isValid(paramValue)) {
        return next(new BadRequestException(`Invalid ID format for parameter: ${name}`));
      }
    }
    return next();
  };
};
