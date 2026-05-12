import PaymentTransaction from "../models/PaymentTransaction.model.js";
import { Request, Response } from "express";
import crypto from "crypto";
import Razorpay from "razorpay";

import {
  confirmOrderLogic,
} from "../services/order.service.js";

const razorpay = new Razorpay({

  key_id:
    process.env.RAZORPAY_KEY_ID!,

  key_secret:
    process.env.RAZORPAY_KEY_SECRET!,

});

export const createRazorpayOrder =
  async (
    req: Request,
    res: Response
  ) => {

    try {

      const { amount } = req.body;

      if (!amount) {

        return res.status(400).json({

          success: false,

          message:
            "Amount is required",

        });

      }

      const options = {

        amount: amount * 100,

        currency: "INR",

        receipt:
          `receipt_${Date.now()}`,

      };

      const order =
        await razorpay.orders.create(options);

      res.status(200).json({

        success: true,

        order,

      });

    } catch (error) {

      console.log(error);

      res.status(500).json({

        success: false,

        message:
          "Failed to create Razorpay order",

      });

    }

  };

export const razorpayWebhook =
  async (
    req: Request,
    res: Response
  ) => {

    try {

      const webhookSecret =
        process.env
          .RAZORPAY_WEBHOOK_SECRET!;

      const razorpaySignature =
        req.headers[
        "x-razorpay-signature"
        ] as string;

      // 1️⃣ Verify signature

      const expectedSignature =
        crypto
          .createHmac(
            "sha256",
            webhookSecret
          )
          .update(req.body)
          .digest("hex");

      if (
        expectedSignature !==
        razorpaySignature
      ) {

        return res
          .status(400)
          .send("Invalid signature");

      }

      // 2️⃣ Parse payload

      const payload =
        JSON.parse(req.body.toString());

      const event = payload.event;

      const payment =
        payload?.payload?.payment?.entity;

      if (!payment?.order_id) {

        return res.json({

          received: true,

        });

      }

      const razorpayOrderId =
        payment.order_id;

      // 3️⃣ Handle payment failed

      if (event === "payment.failed") {

        await PaymentTransaction
          .findOneAndUpdate(

            {
              providerPaymentId:
                razorpayOrderId,
            },

            {
              status: "failed",
            }

          );

        return res.json({

          received: true,

        });

      }

      // 4️⃣ Handle payment success

      if (
        event === "payment.captured"
      ) {

        const txn =
          await PaymentTransaction
            .findOne({

              providerPaymentId:
                razorpayOrderId,

            });

        if (!txn) {

          return res.json({

            received: true,

          });

        }

        // Prevent duplicate processing

        if (txn.status === "success") {

          return res.json({

            received: true,

          });

        }

        txn.status = "success";

        txn.meta = {

          razorpay_payment_id:
            payment.id,

          method:
            payment.method,

        };

        await txn.save();

        // Confirm order

        await confirmOrderLogic(
          txn.order.toString()
        );

      }

      // 5️⃣ Acknowledge Razorpay

      res.json({

        received: true,

      });

    } catch (error) {

      console.error(

        "Razorpay webhook error:",

        error

      );

      res.status(500).json({

        error:
          "Webhook handler failed",

      });

    }

  };