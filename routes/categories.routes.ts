import { Router } from "express";
import {
  addCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} from "../controllers/categories.controller.js";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { addCategorySchema, updateCategorySchema } from "../validators/category.validator.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import { upload } from "../middlewares/multer.js";

const router = Router();

// POST /categories  OR  /categories/create — both work
router.post(
  "/",
  asyncHandler(jwtAuth),
  requireRole("admin"),
  upload.single("image"),
  validate(addCategorySchema),
  asyncHandler(addCategory)
);
router.post(
  "/create",
  asyncHandler(jwtAuth),
  requireRole("admin"),
  upload.single("image"),
  validate(addCategorySchema),
  asyncHandler(addCategory)
);
router.get("/", asyncHandler(getAllCategories));
router.get("/:id", asyncHandler(getCategoryById));
router.put(
  "/:id",
  asyncHandler(jwtAuth),
  requireRole("admin"),
  upload.single("image"),
  validate(updateCategorySchema),
  asyncHandler(updateCategory)
);
router.delete(
  "/:id",
  asyncHandler(jwtAuth),
  requireRole("admin"),
  asyncHandler(deleteCategory)
);

export default router;
