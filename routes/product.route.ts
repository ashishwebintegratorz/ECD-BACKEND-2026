import { Router } from "express";
import {
  addProduct,
  updateProduct,
  deleteProduct,
  getProductById,
  getProductsByCategory,
  getAllProducts,
} from "../controllers/product.controller.js";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { upload } from "../middlewares/multer.js";

const router = Router();

// list with pagination
router.get("/all", asyncHandler(getAllProducts));

// add product (with images)
router.post(
  "/add",
  upload.any(), // parses form-data into req.body + req.files
  asyncHandler(addProduct)
);

// update product
router.put(
  "/:id",
  upload.any(),
  asyncHandler(updateProduct)
);

// delete
router.delete("/:id", asyncHandler(deleteProduct));

// others if needed
router.get("/:id", asyncHandler(getProductById));
router.get("/category/:slug", asyncHandler(getProductsByCategory));

export default router;
