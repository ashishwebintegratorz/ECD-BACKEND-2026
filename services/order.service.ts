import Order from "../models/Order.model.js";
import Cart from "../models/Cart.model.js";
import Product from "../models/Product.model.js";
import Invoice from "../models/Invoice.model.js";
import PaymentTransaction from "../models/PaymentTransaction.model.js";
import Restaurant from "../models/Restaurant.model.js";

/**
 * Runs when an order is confirmed — via COD, payment verification, or webhook.
 * 1. Marks order as confirmed
 * 2. Decrements product stock
 * 3. Increments restaurant orderCount
 * 4. Clears customer cart
 * 5. Generates invoice with full item snapshot
 */
export const confirmOrderLogic = async (orderId: string) => {
    const order = await Order.findById(orderId);
    if (!order) {
        console.error(`[confirmOrderLogic] Order not found: ${orderId}`);
        return;
    }

    // 1. Mark confirmed
    if (order.status !== "confirmed") {
        order.status = "confirmed";
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

    // 5. Generate invoice (idempotent — skip if already exists)
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
};
