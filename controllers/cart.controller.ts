import { Request, Response } from "express";
import Cart from "../models/Cart.model.js";
import Product from "../models/Product.model.js";
import {
  BadRequestException,
  NotFoundException,
  InternalServerException,
} from "../utils/appError.js";


// ---------------------------------
// 🔍 Helper: Fetch or Create User Cart
// ---------------------------------
const getOrCreateCart = async (userId: string) => {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
  }
  return cart;
};

// ---------------------------------
// 🔍 Helper: Validate Product + Variant
// ---------------------------------
const validateProductVariant = async (
  productId: string,
  variantIndex?: number
) => {
  const product = await Product.findById(productId);
  if (!product) throw new NotFoundException("Product not found");

  const variant = product.variants?.[variantIndex || 0];

  if (!variant)
    throw new BadRequestException("Invalid product variant selected");

  if (variant.stock <= 0)
    throw new BadRequestException("Selected variant is out of stock");

  return {
    product,
    variant,
  };
};

// ==================================================================
// 1️⃣ GET CART
// ==================================================================
export const getCart = async (req: Request, res: Response) => {
  const userId = req.user.id;

  const cart = await getOrCreateCart(userId);

  return res.json({
    cart,
  });
};

// ==================================================================
// 2️⃣ ADD TO CART
// ==================================================================
export const addToCart = async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { productId, variantIndex, qty } = req.body;

  if (!productId) throw new BadRequestException("Product ID is required");
  if (!qty || qty <= 0) throw new BadRequestException("Invalid quantity");

  const { product, variant } = await validateProductVariant(
    productId,
    variantIndex
  );

  const cart = await getOrCreateCart(userId);

  const existingIndex = cart.items.findIndex(
    (item) =>
      item.product.toString() === productId &&
      item.variantIndex === (variantIndex ?? 0)
  );

  if (existingIndex >= 0) {
    // Increase quantity
    cart.items[existingIndex].qty += qty;
  } else {
    // Add new item
    cart.items.push({
      product: product._id,
      variantIndex: variantIndex || 0,
      qty,
      priceAtAdd: variant.price,
      name: product.name,
      image: variant.images?.[0],
    });
  }

  await cart.save();

  return res.json({
    message: "Added to cart",
    cart,
  });
};

// ==================================================================
// 3️⃣ UPDATE CART ITEM (qty, variant…)
// ==================================================================
export const updateCartItem = async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { productId, variantIndex, qty } = req.body;

  if (!productId) throw new BadRequestException("Product ID required");
  if (variantIndex === undefined)
    throw new BadRequestException("Variant index required");

  const cart = await getOrCreateCart(userId);

  // Find item by product + variant
  const item = cart.items.find(
    (i: any) =>
      i.product.toString() === productId &&
      i.variantIndex === Number(variantIndex)
  );

  if (!item) throw new NotFoundException("Cart item not found");

  // Update quantity
  if (qty !== undefined) {
    if (qty <= 0) throw new BadRequestException("Quantity must be > 0");
    item.qty = qty;
  }

  // Validate variant
  const { variant } = await validateProductVariant(productId, variantIndex);
  item.priceAtAdd = variant.price;
  item.image = variant.images?.[0];

  await cart.save();

  return res.json({
    message: "Cart item updated",
    cart,
  });
};


// ==================================================================
// 4️⃣ REMOVE CART ITEM
// ==================================================================
export const removeCartItem = async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { productId, variantIndex } = req.body;

  if (!productId) throw new BadRequestException("Product ID is required");
  if (variantIndex === undefined)
    throw new BadRequestException("Variant index is required");

  const cart = await getOrCreateCart(userId);

  const index = cart.items.findIndex(
    (item: any) =>
      item.product.toString() === productId &&
      item.variantIndex === Number(variantIndex)
  );

  if (index === -1) throw new NotFoundException("Cart item not found");

  // Remove the item
  cart.items.splice(index, 1);

  await cart.save();

  return res.json({
    message: "Item removed",
    cart,
  });
};

// ==================================================================
// 5️⃣ CLEAR CART
// ==================================================================
export const clearCart = async (req: Request, res: Response) => {
  const userId = req.user.id;

  const cart = await getOrCreateCart(userId);
  cart.items = [];
  await cart.save();

  return res.json({
    message: "Cart cleared",
  });
};
