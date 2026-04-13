// controllers/address.controller.ts
import Address from "../models/Address.model.js";
import User from "../models/User.model.js";
import { Request, Response } from "express";

// 🟢 Add new address
export const addAddress = async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { fullAddress, latitude, longitude, label, apartment, landmark, phone, isDefault } = req.body;

  const address = await Address.create({
    user: userId,
    fullAddress,
    label,
    apartment,
    landmark,
    phone,
    isDefault,
    location: {
      type: "Point",
      coordinates: [longitude, latitude],
    },
  });

  await User.findByIdAndUpdate(userId, { $push: { addresses: address._id } });

  res.json({ success: true, address });
};

// 🟢 Get logged-in user's addresses
export const getMyAddresses = async (req: Request, res: Response) => {
  const addresses = await Address.find({ user: req.user.id }).sort({ createdAt: -1 });
  res.json({ success: true, addresses });
};

// 🟢 Driver fetches customer address
export const getCustomerAddress = async (req: Request, res: Response) => {
  const customerId = req.params.userId;

  const user = await User.findById(customerId).populate("addresses");

  if (!user) return res.status(404).json({ msg: "User not found" });

  res.json({ success: true, addresses: user.addresses });
};

// 🟡 Update address
export const updateAddress = async (req: Request, res: Response) => {
  const { id } = req.params;

  const address = await Address.findOneAndUpdate(
    { _id: id, user: req.user.id },
    {
      $set: {
        fullAddress: req.body.fullAddress,
        apartment: req.body.apartment,
        landmark: req.body.landmark,
        label: req.body.label,
        phone: req.body.phone,
        "location.coordinates": req.body.longitude ? [req.body.longitude, req.body.latitude] : undefined,
      },
    },
    { new: true }
  );

  res.json({ success: true, address });
};

// 🔴 Delete Address
export const deleteAddress = async (req: Request, res: Response) => {
  const { id } = req.params;

  await Address.findOneAndDelete({ _id: id, user: req.user.id });

  await User.findByIdAndUpdate(req.user.id, { $pull: { addresses: id } });

  res.json({ success: true, message: "Address deleted" });
};

// ⭐ Mark as default
export const setDefaultAddress = async (req: Request, res: Response) => {
  const { id } = req.params;

  await Address.updateMany({ user: req.user.id }, { isDefault: false });
  await Address.findByIdAndUpdate(id, { isDefault: true });

  res.json({ success: true, message: "Default address set" });
};
