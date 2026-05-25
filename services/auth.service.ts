import bcrypt from "bcrypt";
import UserModel, { IUser, UserRole } from "../models/User.model.js";
import { signAccessJwt, signRefreshJwt } from "../utils/jwt.js";

export async function findOrCreateUserByPhone(
  phone: string,
  requestedRole?: UserRole,
  name?: string
): Promise<IUser> {
  let user = await UserModel.findOne({ phone });

  if (!user) {
    const isDriver = (requestedRole || "customer") === "driver";
    user = await UserModel.create({
      phone,
      name: name || undefined,
      role: requestedRole || "customer",
      isVerified: true,
      riderId: isDriver ? `DRV-${Math.floor(1000 + Math.random() * 9000)}` : undefined
    });
  } else {
    if (!user.isVerified) user.isVerified = true;

    // Save name if provided and not already set
    if (name && !user.name) user.name = name;

    // Allow upgrading from customer to driver/admin if requested
    if (requestedRole && requestedRole !== "customer" && user.role === "customer") {
      user.role = requestedRole;
      if (requestedRole === "driver" && !user.riderId) {
        user.riderId = `DRV-${Math.floor(1000 + Math.random() * 9000)}`;
      }
    }

    await user.save();
  }

  return user;
}

export async function setUserPin(user: IUser, pin: string): Promise<IUser> {
  const pinHash = await bcrypt.hash(pin, 10);
  user.pinHash = pinHash;
  await user.save();
  return user;
}

export function createAuthTokens(user: IUser) {
  const payload = {
    sub: user._id.toString(),
    role: user.role,
    phone: user.phone,
  };

  const accessToken = signAccessJwt(payload);
  const refreshToken = signRefreshJwt(payload);

  const safeUser = {
    id: user._id.toString(),
    phone: user.phone,
    name: user.name,
    role: user.role,
    isVerified: user.isVerified,
    avatar: user.avatar,
    createdAt: user.createdAt,
    upi: user.upi,
    isOnline: user.isOnline,
    isReturning: user.isReturning,
    riderId: user.riderId,
  };

  return { accessToken, refreshToken, user: safeUser };
}
