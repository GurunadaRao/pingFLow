import mongoose, { Connection } from "mongoose";
import dotenv from "dotenv";

dotenv.config();

let cachedConnection: Connection | null = null;

async function connectMongoDB(): Promise<Connection> {
  if (cachedConnection) {
    console.log("✅ Using cached MongoDB connection");
    return cachedConnection;
  }

  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MONGODB_URI not defined in .env");
    }

    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(mongoUri);

    cachedConnection = mongoose.connection;

    mongoose.connection.on("connected", () => {
      console.log("✅ MongoDB connected");
    });

    mongoose.connection.on("error", (error) => {
      console.error("❌ MongoDB connection error:", error);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️  MongoDB disconnected");
    });

    return mongoose.connection;
  } catch (error) {
    console.error("❌ Failed to connect MongoDB:", error);
    throw error;
  }
}

export default connectMongoDB;
