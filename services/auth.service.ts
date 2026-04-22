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
    user = await UserModel.create({
      phone,
      name: name || undefined,
      role: requestedRole || "customer",
      isVerified: true,
    });
  } else {
    if (!user.isVerified) user.isVerified = true;

    // Save name if provided and not already set
    if (name && !user.name) user.name = name;

    // Allow upgrading from customer to driver/admin if requested
    if (requestedRole && requestedRole !== "customer" && user.role === "customer") {
      user.role = requestedRole;
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
    createdAt: user.createdAt,
  };

  return { accessToken, refreshToken, user: safeUser };
}
