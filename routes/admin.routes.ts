import { Router } from "express";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";

const router = Router();

router.get(
    "/dashboard",
    jwtAuth,
    requireRole("admin"),
    async (_req, res) => {
        // Example admin-only endpoint
        return res.json({ message: "Admin dashboard data" });
    }
);

export default router;
