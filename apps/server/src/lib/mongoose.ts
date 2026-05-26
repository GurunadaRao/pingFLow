import mongoose, { Connection } from "mongoose";
import dotenv from "dotenv";

dotenv.config();

let cachedConnection: Connection | null = null;
let mongod: any = null;

async function connectMongoDB(): Promise<Connection> {
  if (cachedConnection) {
    console.log("✅ Using cached MongoDB connection");
    return cachedConnection;
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI not defined in .env");
  }

  const isLocal = mongoUri.includes("localhost") || mongoUri.includes("127.0.0.1");

  try {
    console.log(`🔗 Connecting to MongoDB...`);
    // Connect with a shorter timeout so we fallback quickly if local database is not running
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });

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
    if (isLocal) {
      console.warn("⚠️ Failed to connect to local MongoDB. Initializing mongodb-memory-server as fallback...");
      try {
        const { MongoMemoryServer } = require("mongodb-memory-server");
        mongod = await MongoMemoryServer.create();
        const uri = mongod.getUri();
        console.log(`🔗 Connecting to In-Memory MongoDB at ${uri}...`);
        await mongoose.connect(uri);

        cachedConnection = mongoose.connection;
        console.log("✅ MongoDB connected (In-Memory)");
        return mongoose.connection;
      } catch (innerError) {
        console.error("❌ Failed to initialize In-Memory MongoDB:", innerError);
        throw innerError;
      }
    } else {
      console.error("❌ Failed to connect MongoDB:", error);
      throw error;
    }
  }
}

export default connectMongoDB;
