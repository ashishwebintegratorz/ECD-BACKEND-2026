import { Request, Response } from "express";
import Issue from "../models/Issue.model.js";
import Order from "../models/Order.model.js";

export const reportIssue = async (req: Request, res: Response) => {
  try {
    const { orderId, description } = req.body;
    // Assuming user details are attached to req.user by an auth middleware
    const userId = (req as any).user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!orderId || !description) {
      return res.status(400).json({ success: false, message: "Order ID and description are required" });
    }

    // Verify order belongs to user and is delivered
    const order = await Order.findOne({ _id: orderId, customer: userId });
    
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.status !== "delivered") {
      return res.status(400).json({ success: false, message: "Issues can only be reported for delivered orders" });
    }

    const issue = new Issue({
      user: userId,
      order: orderId,
      description,
    });

    await issue.save();

    return res.status(201).json({
      success: true,
      message: "Issue reported successfully",
      issue,
    });
  } catch (error) {
    console.error("Error reporting issue:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getIssues = async (req: Request, res: Response) => {
  try {
    const issues = await Issue.find()
      .populate("user", "phone name email")
      .populate("order", "orderNumber totalAmount items")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      issues,
    });
  } catch (error) {
    console.error("Error fetching issues:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const updateIssueStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["open", "resolved"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const issue = await Issue.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).populate("user", "phone name email")
     .populate("order", "orderNumber totalAmount items");

    if (!issue) {
      return res.status(404).json({ success: false, message: "Issue not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Issue status updated successfully",
      issue,
    });
  } catch (error) {
    console.error("Error updating issue status:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
