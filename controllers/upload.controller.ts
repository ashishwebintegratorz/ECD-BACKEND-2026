import { Request, Response } from "express";
import { imagekit } from "../config/imagekit.js";
import { BadRequestException } from "../utils/appError.js";

export const uploadImage = async (req: Request, res: Response) => {
    // Debug incoming files payload
    console.log("DEBUG [uploadImage]: req.file =", req.file);
    console.log("DEBUG [uploadImage]: req.files =", (req as any).files);
    if ((req as any).files && (req as any).files[0]) {
        console.log("DEBUG [uploadImage]: req.files[0] =", (req as any).files[0]);
    }

    if (!req.file) {
        throw new BadRequestException("No file provided");
    }

    try {
        const response = await imagekit.upload({
            file: req.file.buffer, // required
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
