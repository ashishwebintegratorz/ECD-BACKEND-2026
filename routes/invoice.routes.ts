import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import {
    getAllInvoices,
    getMyInvoices,
    getInvoiceById,
    getInvoiceByOrder,
} from "../controllers/invoice.controller.js";

const router = Router();

// Apply jwtAuth to all routes
router.use(jwtAuth);

// Admin: Get all invoices
router.get("/", requireRole("admin"), asyncHandler(getAllInvoices));

// User: Get my invoices
router.get("/me", asyncHandler(getMyInvoices));

// User/Admin: Get invoice by order ID
router.get("/order/:orderId", asyncHandler(getInvoiceByOrder));

// User/Admin: Get invoice by ID
router.get("/:id", asyncHandler(getInvoiceById));

export default router;
