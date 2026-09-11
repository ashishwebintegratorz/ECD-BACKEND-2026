import ImageKit from "imagekit";
import { config } from "./app.config.js";

export const imagekit = new ImageKit({
  publicKey: config.IMAGEKIT_PUBLIC_KEY || "mock_public_key",
  privateKey: config.IMAGEKIT_PRIVATE_KEY || "mock_private_key",
  urlEndpoint: config.IMAGEKIT_URL_ENDPOINT || "https://ik.imagekit.io/mock",
});

