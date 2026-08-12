import type { Request, Response, NextFunction } from "express";
import { ForbiddenException } from "../utils/appError.js";

export const requireRestaurantAccess = (
    req: Request,
    _res: Response,
    next: NextFunction
) => {
    const user = (req as any).user;
    if (!user) {
        return next(new ForbiddenException("Not authenticated"));
    }

    if (user.role === "admin") {
        return next();
    }

    const authenticatedRestaurantId = (user._id ?? user.id)?.toString();
    if (
        user.role !== "restaurant" ||
        !authenticatedRestaurantId ||
        authenticatedRestaurantId !== req.params.restaurantId
    ) {
        return next(
            new ForbiddenException(
                "You do not have permission to access this restaurant"
            )
        );
    }

    return next();
};
