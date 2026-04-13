import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js"; // user auth
//import { authDriver } from "../middlewares/driverAuth.middleware.js"; // if you separate drivers

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
  asyncHandler(addAddress)
);

// 🟢 Get my saved addresses (Customer)
router.get(
  "/me",
  jwtAuth,
  asyncHandler(getMyAddresses)
);

// 🟢 Driver fetches customer address using customerId
router.get(
  "/customer/:userId",
  jwtAuth,
  asyncHandler(getCustomerAddress)
);

// 🟡 Update address
router.put(
  "/update/:id",
  jwtAuth,
  asyncHandler(updateAddress)
);

// 🔴 Delete address
router.delete(
  "/delete/:id",
  jwtAuth,
  asyncHandler(deleteAddress)
);

// ⭐ Mark address as default
router.patch(
  "/set-default/:id",
  jwtAuth,
  asyncHandler(setDefaultAddress)
);

export default router;
