import Order from "../models/Order.model.js";
import Cart from "../models/Cart.model.js";
import Product from "../models/Product.model.js";
import Invoice from "../models/Invoice.model.js";
import PaymentTransaction from "../models/PaymentTransaction.model.js";

/**
 * Logic to run when an order is confirmed (either via COD, Payment Verification or Webhook)
 */
export const confirmOrderLogic = async (orderId: string) => {
    console.log(`[confirmOrderLogic] Starting for orderId: ${orderId}`);
    const order = await Order.findById(orderId);
    if (!order) {
        console.error(`[confirmOrderLogic] Order not found: ${orderId}`);
        return;
    }

    // 1. Mark status as confirmed if not already
    if (order.status !== "confirmed") {
        order.status = "confirmed";
        await order.save();
        console.log(`[confirmOrderLogic] Order status updated to confirmed`);
    }

    // 2. Subtract Stock
    console.log(`[confirmOrderLogic] Updating stock for ${order.items.length} items`);
    for (const item of order.items) {
        if (item.variantIndex !== undefined) {
            const updatePath = `variants.${item.variantIndex}.stock`;
            await Product.findByIdAndUpdate(item.product, {
                $inc: { [updatePath]: -item.qty },
            });
        }
    }

    // 3. Clear Cart
    console.log(`[confirmOrderLogic] Clearing cart for user: ${order.customer}`);
    await Cart.updateOne({ user: order.customer }, { items: [] });

    // 4. Generate Invoice
    const invoiceExists = await Invoice.findOne({ order: orderId });
    if (!invoiceExists) {
        console.log(`[confirmOrderLogic] Generating invoice`);
        const transaction = await PaymentTransaction.findOne({ order: orderId, status: "success" });
        await Invoice.create({
            invoiceNumber: `INV-${Date.now()}-${order.orderNumber}`,
            order: order._id,
            customer: order.customer,
            amount: order.payableAmount,
            paymentMethod: transaction ? transaction.provider : "unknown",
            status: "paid",
        });
        console.log(`[confirmOrderLogic] Invoice generated successfully`);
    } else {
        console.log(`[confirmOrderLogic] Invoice already exists`);
    }
};
