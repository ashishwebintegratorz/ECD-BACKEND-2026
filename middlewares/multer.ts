import multer from "multer";
import { BadRequestException } from "../utils/appError.js";

const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    const isMimeAllowed = ALLOWED_MIME_TYPES.includes(file.mimetype);
    const hasImageExt = /\.(jpe?g|png|webp|gif)$/i.test(file.originalname);

    if (isMimeAllowed || (file.mimetype === "application/octet-stream" && hasImageExt)) {
      cb(null, true);
    } else {
      cb(new BadRequestException(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, WEBP, and GIF images are allowed.`));
    }
  },
});

