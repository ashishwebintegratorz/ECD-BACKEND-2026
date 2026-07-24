import PaymentTransaction from "../models/PaymentTransaction.model.js";
import { Request, Response } from "express";
import crypto from "crypto";
import { razorpay } from "../config/razorpay.config.js";
import { config } from "../config/app.config.js";

import {
  confirmOrderLogic,
} from "../services/order.service.js";

export const createRazorpayOrder =
  async (
    req: Request,
    res: Response
  ) => {

    try {
      if (!req.body) {
        return res.status(400).json({
          success: false,
          message: "Request body is missing",
        });
      }
      const { amount } = req.body;

      if (!amount) {
        return res.status(400).json({
          success: false,
          message: "Amount is required",
        });
      }

      const options = {

        amount: Math.round(amount * 100),

        currency: "INR",

        receipt:
          `receipt_${Date.now()}`,

      };

      const order =
        await razorpay.orders.create(options);

      console.log("RAZORPAY ORDER CREATED:", JSON.stringify(order, null, 2));

      res.status(200).json({

        success: true,

        order,

      });

    } catch (error) {
      console.error("RAZORPAY ERROR:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create Razorpay order",
        error: error instanceof Error ? error.message : String(error),
      });
    }

  };

export const razorpayWebhook =
  async (
    req: Request,
    res: Response
  ) => {

    try {

      const webhookSecret = config.RAZORPAY_WEBHOOK_SECRET;

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