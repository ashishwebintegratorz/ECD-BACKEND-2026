import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import { upload } from "../middlewares/multer.js";
import {
    getGroceryStores,
    getGroceryStoreBySlug,
    getGroceryProducts,
    getGroceryProductById,
    getGroceryCategories,
    createGroceryStore,
    updateGroceryStore,
    setGroceryRating,
    deleteGroceryStore,
    addGroceryProduct,
    updateGroceryProduct,
    toggleGroceryProduct,
    deleteGroceryProduct,
    getExpiringProducts,
    getLowStockProducts,
} from "../controllers/grocery.controller.js";
import {
    createGrocerySchema,
    updateGrocerySchema,
    setGroceryRatingSchema,
} from "../validators/grocery.validator.js";

const router = Router();

// ═════════════════════════════════════════════════════════════════
// PUBLIC — Store
// ═════════════════════════════════════════════════════════════════

// GET /api/v1/grocery/list?page=&limit=&search=&lat=&lng=
router.get("/list", asyncHandler(getGroceryStores));

// GET /api/v1/grocery/details/:slug
router.get("/details/:slug", asyncHandler(getGroceryStoreBySlug));

// ═════════════════════════════════════════════════════════════════
// PUBLIC — Products
// ═════════════════════════════════════════════════════════════════

// GET /api/v1/grocery/products/:storeId?category=&search=&page=&sort=
router.get("/products/:storeId", asyncHandler(getGroceryProducts));

// GET /api/v1/grocery/product/:productId
router.get("/product/:productId", asyncHandler(getGroceryProductById));

// GET /api/v1/grocery/categories/:storeId
router.get("/categories/:storeId", asyncHandler(getGroceryCategories));

// ═════════════════════════════════════════════════════════════════
// ADMIN — Store Management
// ═════════════════════════════════════════════════════════════════

router.post("/admin/create", jwtAuth, requireRole("admin"), validate(createGrocerySchema), asyncHandler(createGroceryStore));
router.put("/admin/update/:id", jwtAuth, requireRole("admin"), validate(updateGrocerySchema), asyncHandler(updateGroceryStore));
router.patch("/admin/set-rating/:id", jwtAuth, requireRole("admin"), validate(setGroceryRatingSchema), asyncHandler(setGroceryRating));
router.delete("/admin/delete/:id", jwtAuth, requireRole("admin"), asyncHandler(deleteGroceryStore));

// ═════════════════════════════════════════════════════════════════
// ADMIN — Product Management
// ═════════════════════════════════════════════════════════════════

// POST /api/v1/grocery/admin/product/add  (multipart/form-data)
router.post("/admin/product/add", jwtAuth, requireRole("admin"), upload.any(), asyncHandler(addGroceryProduct));

// PUT /api/v1/grocery/admin/product/update/:productId  (multipart/form-data)
router.put("/admin/product/update/:productId", jwtAuth, requireRole("admin"), upload.any(), asyncHandler(updateGroceryProduct));

// PATCH /api/v1/grocery/admin/product/toggle/:productId
router.patch("/admin/product/toggle/:productId", jwtAuth, requireRole("admin"), asyncHandler(toggleGroceryProduct));

// DELETE /api/v1/grocery/admin/product/delete/:productId
router.delete("/admin/product/delete/:productId", jwtAuth, requireRole("admin"), asyncHandler(deleteGroceryProduct));

// ═════════════════════════════════════════════════════════════════
// ADMIN — Inventory Alerts
// ═════════════════════════════════════════════════════════════════

// GET /api/v1/grocery/admin/expiring-products?days=3
router.get("/admin/expiring-products", jwtAuth, requireRole("admin"), asyncHandler(getExpiringProducts));

// GET /api/v1/grocery/admin/low-stock?threshold=10
router.get("/admin/low-stock", jwtAuth, requireRole("admin"), asyncHandler(getLowStockProducts));

export default router;
