import axios from "axios";

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
        const privateKey = process.env.IMAGEKIT_PRIVATE_KEY || "";
        const authHeader = Buffer.from(privateKey + ":").toString("base64");

        // Support both raw buffers/strings and full Multer file objects
        let rawFile = file;
        if (file && typeof file === "object" && file.buffer) {
            rawFile = file.buffer;
        }

        const fileData = Buffer.isBuffer(rawFile) ? rawFile.toString("base64") : rawFile;

        // User requested debug logs
        console.log("UPLOAD FILE DATA:", file);
        console.log("BUFFER EXISTS:", !!(file as any)?.buffer || Buffer.isBuffer(file));
        console.log("ORIGINAL NAME:", (file as any)?.originalname);

        const response = await axios.post("https://upload.imagekit.io/api/v1/files/upload", {
            file: fileData,
            fileName: fileName,
            folder: folder
        }, {
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Basic ${authHeader}`
            }
        });

        if (response.data && response.data.url) {
            return response.data.url;
        }
        throw new Error("Failed to upload image to ImageKit");
    } catch (error: any) {
        console.error("❌ ImageKit Upload Error:", error?.response?.data || error.message);
        throw new Error(error?.response?.data?.message || "ImageKit upload failed");
    }
};
