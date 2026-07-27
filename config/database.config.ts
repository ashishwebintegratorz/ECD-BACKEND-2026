import mongoose from "mongoose";
import { config } from "./app.config.js";

const connectDatabase = async () => {
  if (!config.MONGO_URI) throw new Error("MONGO_URI is not set in environment variables");

  // Secure Mongoose query execution settings
  mongoose.set("strictQuery", true);

  // Secure connection event listeners
  mongoose.connection.on("error", (err) => {
    // Strip sensitive connection URIs / passwords from error logs if present
    const sanitizedErrorMsg = String(err.message || err).replace(/mongodb(\+srv)?:\/\/[^@]+@/, "mongodb$1://***:***@");
    console.error("❌ MongoDB connection error:", sanitizedErrorMsg);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("⚠️ MongoDB connection disconnected. Reconnecting...");
  });

  mongoose.connection.on("reconnected", () => {
    console.log("🟢 MongoDB connection re-established.");
  });

  try {
    await mongoose.connect(config.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      autoIndex: config.NODE_ENV !== "production",
    });
    console.log("🟢 Connected to MongoDB securely");
  } catch (error: any) {
    const safeMsg = String(error.message || error).replace(/mongodb(\+srv)?:\/\/[^@]+@/, "mongodb$1://***:***@");
    console.error("❌ Failed to connect to MongoDB:", safeMsg);
    throw new Error(`Database connection failed: ${safeMsg}`);
  }
};

export default connectDatabase;


