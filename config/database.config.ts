import mongoose from "mongoose";
import { config } from "./app.config.js";

const connectDatabase = async () => {
  if (!config.MONGO_URI) throw new Error("MONGO_URI not set");
  await mongoose.connect(config.MONGO_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
  console.log("Connected to MongoDB");
};

export default connectDatabase;

