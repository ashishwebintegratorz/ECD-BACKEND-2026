import multer from "multer";
import { BadRequestException } from "../utils/appError.js";

const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/octet-stream"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestException(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, WEBP, and GIF images are allowed.`));
    }
  },
});

