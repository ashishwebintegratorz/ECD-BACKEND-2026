import { Request, Response } from "express";
import { imagekit } from "../config/imagekit.js";
import { BadRequestException } from "../utils/appError.js";

export const uploadImage = async (req: Request, res: Response) => {

    if (!req.file) {
        throw new BadRequestException("No file provided");
    }

    try {
        const response = await imagekit.upload({
            file: req.file.buffer.toString("base64"), // required
            fileName: req.file.originalname, // required
            folder: "/ecd-backend", // optional
        });

        return res.status(200).json({
            success: true,
            url: response.url,
            fileId: response.fileId,
        });
    } catch (error: any) {
        throw new BadRequestException("Image upload failed: " + error.message);
    }
};
