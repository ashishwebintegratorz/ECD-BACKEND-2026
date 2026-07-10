import { Router } from "express";
import {
    getRestaurants,
    searchRestaurants,
    getSuggestions,
    getRestaurantsByCategory,
    getRestaurantBySlug,
    getRestaurantMenu,
    createRestaurant,
    updateRestaurant,
    deleteRestaurant,
    setAdminRating,
    addMenuItem,
    updateMenuItem,
    deleteMenuItem,
    toggleRestaurantActive,
    getRestaurantProfile,
    getRestaurantOrderHistory,
    payoutRestaurant,
    restaurantSendOtp,
    restaurantVerifyOtp,
    getDashboardStats,
    vendorAddMenuItem,
    vendorToggleMenuItem,
    adminApproveMenuItem,
    getPendingMenuItems
} from "../controllers/restaurant.controller.js";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import {
    createRestaurantSchema,
    updateRestaurantSchema,
    setRatingSchema,
    addMenuItemSchema,
    updateMenuItemSchema,
} from "../validators/restaurant.validator.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────
// PUBLIC
// ─────────────────────────────────────────────────────────────────

// GET /api/restaurants/list?page=1&limit=10&search=&lat=&lng=
router.get("/list", asyncHandler(getRestaurants));

// GET /api/restaurants/search?query=biryani
router.get("/search", asyncHandler(searchRestaurants));

// GET /api/restaurants/suggestions?query=biry
router.get("/suggestions", asyncHandler(getSuggestions));

// GET /api/restaurants/by-category/:slug
router.get("/by-category/:slug", asyncHandler(getRestaurantsByCategory));

// GET /api/restaurants/details/:slug
router.get("/details/:slug", asyncHandler(getRestaurantBySlug));

// GET /api/restaurants/menu/:slug?foodType=veg|non-veg|vegan
router.get("/menu/:slug", asyncHandler(getRestaurantMenu));

// ─────────────────────────────────────────────────────────────────
// ADMIN & RESTAURANT 
// ─────────────────────────────────────────────────────────────────

// POST /api/restaurants/send-otp
router.post("/send-otp", asyncHandler(restaurantSendOtp));

// POST /api/restaurants/verify-otp
router.post("/verify-otp", asyncHandler(restaurantVerifyOtp));

// GET /api/restaurants/:restaurantId/profile
router.get("/:restaurantId/profile", jwtAuth, requireRole("admin"), asyncHandler(getRestaurantProfile));

// GET /api/restaurants/:restaurantId/order-history
// GET /api/restaurants/:restaurantId/order-history
router.get("/:restaurantId/order-history", jwtAuth, requireRole("admin"), asyncHandler(getRestaurantOrderHistory));

// GET /api/restaurants/:restaurantId/dashboard-stats
router.get("/:restaurantId/dashboard-stats", jwtAuth, requireRole("admin"), asyncHandler(getDashboardStats));

// POST /api/restaurants/:restaurantId/payout
router.post("/:restaurantId/payout", jwtAuth, requireRole("admin"), asyncHandler(payoutRestaurant));

// PATCH /api/restaurants/:restaurantId/toggle-active
router.patch(
    "/:restaurantId/toggle-active",
    jwtAuth,
    requireRole("admin"),
    asyncHandler(toggleRestaurantActive)
);

// POST /api/restaurants/admin/create
router.post(
    "/admin/create",
    jwtAuth,
    requireRole("admin"),
    validate(createRestaurantSchema),
    asyncHandler(createRestaurant)
);

// PUT /api/restaurants/admin/update/:id
router.put(
    "/admin/update/:id",
    jwtAuth,
    requireRole("admin"),
    validate(updateRestaurantSchema),
    asyncHandler(updateRestaurant)
);

// PATCH /api/restaurants/admin/set-rating/:id
router.patch(
    "/admin/set-rating/:id",
    jwtAuth,
    requireRole("admin"),
    validate(setRatingSchema),
    asyncHandler(setAdminRating)
);

// DELETE /api/restaurants/admin/delete/:id
router.delete(
    "/admin/delete/:id",
    jwtAuth,
    requireRole("admin"),
    asyncHandler(deleteRestaurant)
);

// ─────────────────────────────────────────────────────────────────
// ADMIN — Menu Item Management
// ─────────────────────────────────────────────────────────────────

// POST /api/restaurants/admin/menu/add/:id
router.post(
    "/admin/menu/add/:id",
    jwtAuth,
    requireRole("admin"),
    validate(addMenuItemSchema),
    asyncHandler(addMenuItem)
);

// PUT /api/restaurants/admin/menu/update/:id/:itemId
router.put(
    "/admin/menu/update/:id/:itemId",
    jwtAuth,
    requireRole("admin"),
    validate(updateMenuItemSchema),
    asyncHandler(updateMenuItem)
);

// DELETE /api/restaurants/admin/menu/delete/:id/:itemId
router.delete(
    "/admin/menu/delete/:id/:itemId",
    jwtAuth,
    requireRole("admin"),
    asyncHandler(deleteMenuItem)
);



// POST /api/restaurants/vendor/menu/add/:restaurantId
router.post(
    "/vendor/menu/add/:restaurantId",
    jwtAuth,
    asyncHandler(vendorAddMenuItem)
);

// PATCH /api/restaurants/vendor/menu/toggle/:restaurantId/:itemId
router.patch(
    "/vendor/menu/toggle/:restaurantId/:itemId",
    jwtAuth,
    asyncHandler(vendorToggleMenuItem)
);

// PATCH /api/restaurants/admin/menu/approve/:restaurantId/:itemId
router.patch(
    "/admin/menu/approve/:restaurantId/:itemId",
    jwtAuth,
    requireRole("admin"),
    asyncHandler(adminApproveMenuItem)
);



// GET /api/restaurants/admin/menu/pending
router.get(
    "/admin/menu/pending",
    jwtAuth,
    requireRole("admin"),
    asyncHandler(getPendingMenuItems)
);

export default router;
