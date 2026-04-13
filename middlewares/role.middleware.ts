import type { Request, Response, NextFunction } from "express";
import { ForbiddenException } from "../utils/appError.js";
import type { UserRole } from "../models/User.model.js";

export const requireRole =
    (...allowedRoles: UserRole[]) =>
        (req: Request, _res: Response, next: NextFunction) => {
            const user = (req as any).user;
            if (!user) {
                return next(new ForbiddenException("Not authenticated"));
            }

            if (!allowedRoles.includes(user.role)) {
                return next(
                    new ForbiddenException("You do not have permission to access this resource")
                );
            }

            return next();
        };
