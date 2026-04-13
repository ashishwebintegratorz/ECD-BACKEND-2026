import { Request, Response } from "express";
import Invoice from "../models/Invoice.model.js";
import { NotFoundException, ForbiddenException } from "../utils/appError.js";

export const getAllInvoices = async (req: Request, res: Response) => {
    const { status, from, to } = req.query;
    const query: any = {};

    if (status) query.status = status;
    if (from || to) {
        query.createdAt = {};
        if (from) query.createdAt.$gte = new Date(from as string);
        if (to) query.createdAt.$lte = new Date(to as string);
    }

    const invoices = await Invoice.find(query)
        .sort({ createdAt: -1 })
        .populate("customer", "name email")
        .populate("order", "orderNumber status");

    res.json(invoices);
};

export const getMyInvoices = async (req: Request, res: Response) => {
    const userId = req.user.id;
    const invoices = await Invoice.find({ customer: userId })
        .sort({ createdAt: -1 })
        .populate("order", "orderNumber status");
    res.json(invoices);
};

export const getInvoiceById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = req.user;

    const invoice = await Invoice.findById(id)
        .populate("customer", "name email")
        .populate("order");

    if (!invoice) {
        throw new NotFoundException("Invoice not found");
    }

    const isAdmin = user.role === "admin";
    const isOwner = invoice.customer._id.toString() === user.id;

    if (!isAdmin && !isOwner) {
        throw new ForbiddenException("You do not have permission to access this invoice");
    }

    res.json(invoice);
};

export const getInvoiceByOrder = async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const user = req.user;

    const invoice = await Invoice.findOne({ order: orderId })
        .populate("customer", "name email")
        .populate("order");

    if (!invoice) {
        throw new NotFoundException("Invoice not found");
    }

    const isAdmin = user.role === "admin";
    const isOwner = invoice.customer._id.toString() === user.id;

    if (!isAdmin && !isOwner) {
        throw new ForbiddenException("You do not have permission to access this invoice");
    }

    res.json(invoice);
};
