import type { Request, Response, NextFunction } from "express";

/**
 * Middleware to ensure drivers have completed their onboarding (uploaded documents)
 * before accessing active delivery features.
 */
export const checkOnboarding = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (user.role === "driver") {
        const docs = user.documents;
        // Basic requirement: Aadhar and License must be present
        if (!docs || !docs.aadharFront || !docs.license) {
            return res.status(403).json({
                message: "Onboarding incomplete. Please upload your documents first.",
                onboarding_required: true,
                required_docs: ["aadhar_front", "license"]
            });
        }
    }

    next();
};
