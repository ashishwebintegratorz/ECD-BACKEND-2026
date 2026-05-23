import { Router } from "express";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import { updateProfile } from "../controllers/user.controller.js";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";

const router = Router();

router.get("/me", jwtAuth, (req, res) => {
    const user = (req as any).user;
    return res.json({
        user: {
            id: user._id.toString(),
            phone: user.phone,
            name: user.name,
            role: user.role,
            isVerified: user.isVerified,
            avatar: user.avatar,
            createdAt: user.createdAt,
        },
    });
});

// PUT /api/v1/user/update-profile
router.put("/update-profile", jwtAuth, asyncHandler(updateProfile));

export default router;
