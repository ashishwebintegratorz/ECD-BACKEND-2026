import { razorpay } from "../config/razorpay.config.js";

export async function createRazorpayOrder(

    amount: number

) {

    const options = {

        amount: Math.round(amount * 100),

        currency: "INR",

        receipt:
            `receipt_${Date.now()}`,

    };

    const order =
        await razorpay.orders.create(options);

    return order;

}