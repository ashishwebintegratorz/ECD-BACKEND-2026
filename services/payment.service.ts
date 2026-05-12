import Razorpay from "razorpay";

const razorpay = new Razorpay({

    key_id:
        process.env.RAZORPAY_KEY_ID!,

    key_secret:
        process.env.RAZORPAY_KEY_SECRET!,

});

export async function createRazorpayOrder(

    amount: number

) {

    const options = {

        amount: amount * 100,

        currency: "INR",

        receipt:
            `receipt_${Date.now()}`,

    };

    const order =
        await razorpay.orders.create(options);

    return order;

}