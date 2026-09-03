import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import {
    registerDevice,
    removeDevice,
    getMyNotifications,
    markAsRead,
    markAllAsRead,
    getUnreadCount,
} from "../controllers/notification.controller.js";
import { 
    sendNotificationToAllUsers,
    getAdminNotificationHistory,
    getAdminNotifications,
    markAdminNotificationAsRead,
    markAllAdminNotificationsAsRead,
    deleteAdminNotification,
    clearAllAdminNotifications
} from "../controllers/adminNotification.controller.js";

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

// Admin routes
router.get("/admin", requireRole("admin"), asyncHandler(getAdminNotifications));
router.patch("/admin/read-all", requireRole("admin"), asyncHandler(markAllAdminNotificationsAsRead));
router.patch("/admin/:id/read", requireRole("admin"), asyncHandler(markAdminNotificationAsRead));
router.delete("/admin/clear-all", requireRole("admin"), asyncHandler(clearAllAdminNotifications));
router.delete("/admin/:id", requireRole("admin"), asyncHandler(deleteAdminNotification));

router.post("/admin/send", requireRole("admin"), asyncHandler(sendNotificationToAllUsers));
router.get("/admin/history", requireRole("admin"), asyncHandler(getAdminNotificationHistory));

export default router;
