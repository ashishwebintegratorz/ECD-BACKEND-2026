import { imagekit } from "../config/imagekit.js";

/**
 * Uploads a file buffer or base64 string to ImageKit
 * @param file - Buffer or base64 string or file URL
 * @param fileName - Name of the file
 * @param folder - Folder path inside ImageKit (e.g. "/drivers/driverId")
 */
export const uploadToImageKit = async (
    file: any,
    fileName: string,
    folder: string
): Promise<string> => {
    try {
        let rawFile = file;
        if (file && typeof file === "object" && file.buffer) {
            rawFile = file.buffer;
        }

        const response = await imagekit.upload({
            file: rawFile, // required
            fileName: fileName, // required
            folder: folder, // optional
        });

        if (response && response.url) {
            return response.url;
        }
        throw new Error("Failed to upload image to ImageKit");
    } catch (error: any) {
        console.error("❌ ImageKit Upload Error:", error?.message || error);
        throw new Error(error?.message || "ImageKit upload failed");
    }
};
