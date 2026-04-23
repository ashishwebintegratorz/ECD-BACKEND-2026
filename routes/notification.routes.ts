import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import {
    registerDevice,
    removeDevice,
    getMyNotifications,
    markAsRead,
    markAllAsRead,
    getUnreadCount,
} from "../controllers/notification.controller.js";

const router = Router();

router.use(jwtAuth);

// Device token management
router.post("/register-device", asyncHandler(registerDevice));
router.delete("/remove-device", asyncHandler(removeDevice));

// Notification history
router.get("/my", asyncHandler(getMyNotifications));
router.get("/unread-count", asyncHandler(getUnreadCount));
router.patch("/:id/read", asyncHandler(markAsRead));
router.patch("/read-all", asyncHandler(markAllAsRead));

export default router;
