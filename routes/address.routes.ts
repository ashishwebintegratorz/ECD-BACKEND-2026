import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { validateObjectId } from "../middlewares/validateObjectId.middleware.js";
import { createAddressSchema, updateAddressSchema } from "../validators/user.validator.js";

import {
  addAddress,
  getMyAddresses,
  getCustomerAddress,
  deleteAddress,
  updateAddress,
  setDefaultAddress,
} from "../controllers/address.controller.js";

const router = Router();

// 🟢 Add Address (Manual + Coordinates)
router.post(
  "/add",
  jwtAuth,
  validate(createAddressSchema),
  asyncHandler(addAddress)
);

// 🟢 Get my saved addresses (Customer)
router.get(
  "/me",
  jwtAuth,
  asyncHandler(getMyAddresses)
);

import { requireRole } from "../middlewares/role.middleware.js";

// 🟢 Driver fetches customer address using customerId
router.get(
  "/customer/:userId",
  jwtAuth,
  requireRole("admin", "driver"),
  validateObjectId("userId"),
  asyncHandler(getCustomerAddress)
);

// 🟡 Update address
router.put(
  "/update/:id",
  jwtAuth,
  validateObjectId("id"),
  validate(updateAddressSchema),
  asyncHandler(updateAddress)
);

// 🔴 Delete address
router.delete(
  "/delete/:id",
  jwtAuth,
  validateObjectId("id"),
  asyncHandler(deleteAddress)
);

// ⭐ Mark address as default
router.patch(
  "/set-default/:id",
  jwtAuth,
  validateObjectId("id"),
  asyncHandler(setDefaultAddress)
);

export default router;
