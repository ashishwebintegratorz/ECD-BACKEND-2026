import { v2 as cloudinary } from "cloudinary";

export const deleteCloudinaryImage = async (imageUrl: string) => {
  try {
    const publicId = imageUrl
      .split("/")
      .slice(-2)
      .join("/")
      .split(".")[0]; // folder/file

    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("Cloudinary delete failed:", error);
  }
};
