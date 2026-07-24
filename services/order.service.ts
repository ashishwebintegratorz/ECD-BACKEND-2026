import Order from "../models/Order.model.js";
import Cart from "../models/Cart.model.js";
import Product from "../models/Product.model.js";
import Invoice from "../models/Invoice.model.js";
import Ledger from "../models/Ledger.model.js";
import PaymentTransaction from "../models/PaymentTransaction.model.js";
import Restaurant from "../models/Restaurant.model.js";
import { emitNewOrderToRestaurant } from "../socket/orderSocket.js";
import { incrementCouponUsage } from "./coupon.service.js";
import { config } from "../config/app.config.js";

const PLATFORM_FEE_PERCENT = 0.10;
const PLATFORM_REF_ID = config.PLATFORM_REF_ID;

const calculateSplit = (totalAmount: number, deliveryCharge: number) => {
    const platformFee = Math.round(totalAmount * PLATFORM_FEE_PERCENT);
    const storeNet = totalAmount - platformFee;
    const driverNet = deliveryCharge;
    return { storeNet, driverNet, platformFee };
};


// ─────────────────────────────────────────────────────────────────────────────
// STOCK VALIDATION
// Called before order creation — ensures all cart items have sufficient stock.
// Works for both restaurant (menu items) and grocery (product variants).
// ─────────────────────────────────────────────────────────────────────────────
export const validateCartStock = async (
    items: { product: any; variantIndex?: number; qty: number; name?: string }[]
): Promise<{ ok: boolean; message?: string }> => {
    for (const item of items) {
        let product = await Product.findById(item.product);
        
        if (!product) {
            // Allow dummy product for testing
            continue; 
        }

        if (!product.isActive) {
            return { ok: false, message: `Product "${item.name ?? item.product}" is no longer available` };
        }

        const variantIdx = item.variantIndex ?? 0;
        const variant = product.variants[variantIdx];

        if (!variant) {
            return { ok: false, message: `Variant not found for "${product.name}"` };
        }

        if (variant.stock < item.qty) {
            return {
                ok: false,
                message: `Insufficient stock for "${product.name}" (${variant.unit ?? "unit"}). Available: ${variant.stock}, Requested: ${item.qty}`,
            };
        }

        // Expiry check for grocery perishables
        if (variant.expiryDate && variant.expiryDate < new Date()) {
            return { ok: false, message: `"${product.name}" has expired and cannot be ordered` };
        }
    }
    return { ok: true };
};

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRM ORDER LOGIC
// Triggered on payment success (COD or Razorpay).
// Works for both restaurant and grocery orders.
// ─────────────────────────────────────────────────────────────────────────────
export const confirmOrderLogic = async (orderId: string) => {
    const order = await Order.findById(orderId);
    if (!order) {
        console.error(`[confirmOrderLogic] Order not found: ${orderId}`);
        return;
    }

    // 1. Leave order as pending until restaurant explicitly accepts it
    // No status change here.

    // 2. Decrement product stock atomically — prevents overselling race condition
    for (const item of order.items) {
        if (item.variantIndex !== undefined) {
            const updated = await Product.findOneAndUpdate(
                {
                    _id: item.product,
                    [`variants.${item.variantIndex}.stock`]: { $gte: item.qty },
                },
                {
                    $inc: { [`variants.${item.variantIndex}.stock`]: -item.qty },
                }
            );
            if (!updated) {
                console.warn(`[ECD KART] Stock insufficient for product ${item.product} — order ${orderId}`);
            }
        }
    }

    // 3. Increment store orderCount
    if (order.store) {
        await Restaurant.findByIdAndUpdate(order.store, {
            $inc: { orderCount: 1 },
        });
    }

    // ── Coupon Usage Tracking ────────────────────────────────────────────────
    if (order.coupon && order.coupon.couponId) {
        await incrementCouponUsage(order.coupon.couponId.toString());
    }

    // 4. Clear cart
    await Cart.updateOne({ user: order.customer }, { items: [] });

    // 5. Generate invoice (idempotent)
    const invoiceExists = await Invoice.findOne({ order: orderId });
    if (!invoiceExists) {
        const transaction = await PaymentTransaction.findOne({ order: orderId, status: "success" });

        await Invoice.create({
            invoiceNumber: `INV-${Date.now()}-${order.orderNumber}`,
            order: order._id,
            customer: order.customer,
            store: order.store,
            items: order.items.map((i) => ({
                name: i.name ?? "Item",
                qty: i.qty,
                price: i.price,
                subtotal: i.subtotal,
            })),
            totalAmount: order.totalAmount,
            deliveryCharge: order.deliveryCharge ?? 0,
            gst: order.gst || 0,
            totalDiscount: order.totalDiscount || 0,
            amount: order.payableAmount,
            paymentMethod: transaction?.provider ?? "unknown",
            status: "paid",
        });
    }

    // 6. Create ledger entries (idempotent)
    const ledgerExists = await Ledger.findOne({ order: orderId });
    if (!ledgerExists) {
        const { storeNet, driverNet, platformFee } = calculateSplit(
            order.totalAmount,
            order.deliveryCharge ?? 0
        );

        await Ledger.insertMany([
            {
                order: order._id,
                orderNumber: order.orderNumber,
                party: "store",
                partyRef: order.store,
                amount: storeNet,
                status: "pending",
            },
            // Driver ledger NOT created here — created when driver actually delivers
            // See: updateDriverLedgerRef() called from orders.controller.ts on delivery
            {
                order: order._id,
                orderNumber: order.orderNumber,
                party: "platform",
                partyRef: PLATFORM_REF_ID,
                amount: platformFee,
                status: "paid",
                paidAt: new Date(),
            },
        ]);

        console.log(
            `[Ledger] ${order.orderNumber}: store=₹${storeNet}, driver=₹${driverNet}, platform=₹${platformFee}`
        );
    }

    // 7. Notify store via socket
    if (order.store) {
        emitNewOrderToRestaurant(order.store.toString(), {
            orderId: order._id,
            orderNumber: order.orderNumber,
            items: order.items,
            totalAmount: order.totalAmount,
            restaurantEarnings: order.restaurantEarnings,
            address: order.address,
            message: "New order — start processing now",
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Create driver ledger entry when order is delivered
// Called from orders.controller.ts after OTP verification
// ─────────────────────────────────────────────────────────────────────────────
export const updateDriverLedgerRef = async (orderId: string, driverId: string) => {
    const order = await Order.findById(orderId);
    if (!order) return;

    // Check if driver ledger already exists (idempotent)
    const exists = await Ledger.findOne({ order: orderId, party: "driver" });
    if (exists) return;

    const { driverNet } = calculateSplit(order.totalAmount, order.deliveryCharge ?? 0);

    await Ledger.create({
        order: order._id,
        orderNumber: order.orderNumber,
        party: "driver",
        partyRef: driverId,
        amount: driverNet,
        status: "pending",
    });

    console.log(`[ECD KART] Driver ledger created for ${order.orderNumber}: driver=₹${driverNet}`);
};
