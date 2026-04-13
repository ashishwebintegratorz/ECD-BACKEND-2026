import mongoose from "mongoose";
import { config } from "./app.config.js";

const connectDatabase = async () => {
  if (!config.MONGO_URI) throw new Error("MONGO_URI not set");
  await mongoose.connect(config.MONGO_URI);
  console.log("Connected to MongoDB");
};

export default connectDatabase;
