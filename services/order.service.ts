import Order from "../models/Order.model.js";
import Cart from "../models/Cart.model.js";
import Product from "../models/Product.model.js";
import Invoice from "../models/Invoice.model.js";
import PaymentTransaction from "../models/PaymentTransaction.model.js";
import Restaurant from "../models/Restaurant.model.js";
import { emitNewOrderToRestaurant } from "../socket/orderSocket.js";

/**
 * Runs when payment is confirmed (COD or Razorpay).
 * No restaurant confirmation step — order goes straight to "preparing".
 * Restaurant is notified via socket to start immediately.
 *
 * 1. Sets status to "preparing" (restaurant starts right away)
 * 2. Decrements product stock
 * 3. Increments restaurant orderCount
 * 4. Clears customer cart
 * 5. Generates invoice
 * 6. Notifies restaurant via socket
 */
export const confirmOrderLogic = async (orderId: string) => {
    const order = await Order.findById(orderId);
    if (!order) {
        console.error(`[confirmOrderLogic] Order not found: ${orderId}`);
        return;
    }

    // 1. Set to preparing immediately — no confirmation step
    if (order.status !== "preparing") {
        order.status = "preparing";
        await order.save();
    }

    // 2. Decrement product stock
    for (const item of order.items) {
        if (item.variantIndex !== undefined) {
            await Product.findByIdAndUpdate(item.product, {
                $inc: { [`variants.${item.variantIndex}.stock`]: -item.qty },
            });
        }
    }

    // 3. Increment restaurant orderCount
    if (order.restaurant) {
        await Restaurant.findByIdAndUpdate(order.restaurant, {
            $inc: { orderCount: 1 },
        });
    }

    // 4. Clear cart
    await Cart.updateOne({ user: order.customer }, { items: [] });

    // 5. Generate invoice (idempotent)
    const invoiceExists = await Invoice.findOne({ order: orderId });
    if (!invoiceExists) {
        const transaction = await PaymentTransaction.findOne({
            order: orderId,
            status: "success",
        });

        await Invoice.create({
            invoiceNumber: `INV-${Date.now()}-${order.orderNumber}`,
            order: order._id,
            customer: order.customer,
            restaurant: order.restaurant,
            items: order.items.map((i) => ({
                name: i.name ?? "Item",
                qty: i.qty,
                price: i.price,
                subtotal: i.subtotal,
            })),
            totalAmount: order.totalAmount,
            deliveryCharge: order.deliveryCharge ?? 0,
            amount: order.payableAmount,
            paymentMethod: transaction?.provider ?? "unknown",
            status: "paid",
        });
    }

    // 6. Notify restaurant — start preparing immediately
    if (order.restaurant) {
        emitNewOrderToRestaurant(order.restaurant.toString(), {
            orderId: order._id,
            orderNumber: order.orderNumber,
            items: order.items,
            totalAmount: order.totalAmount,
            address: order.address,
            message: "New order — start preparing now",
        });
    }
};
