import { UploadApiErrorResponse, UploadApiResponse, v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

dotenv.config();

function initCloudinary() {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error(
        "Cloudinary credentials not defined: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET",
      );
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });

    console.log("✅ Cloudinary configured");
    return cloudinary;
  } catch (error) {
    console.error("❌ Failed to configure Cloudinary:", error);
    throw error;
  }
}

export const getCloudinary = () => {
  return cloudinary;
};

export const uploadToCloudinary = async (
  fileBuffer: Buffer,
  filename: string,
  folder: string = "vibechat",
) => {
  try {
    return new Promise<UploadApiResponse | undefined>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "auto",
          folder,
          public_id: filename,
        },
        (
          error: UploadApiErrorResponse | undefined,
          result: UploadApiResponse | undefined,
        ) => {
          if (error) {
            console.error("❌ Cloudinary upload error:", error);
            reject(error);
          } else {
            console.log("✅ File uploaded to Cloudinary:", result?.public_id);
            resolve(result);
          }
        },
      );

      uploadStream.end(fileBuffer);
    });
  } catch (error) {
    console.error("❌ Upload failed:", error);
    throw error;
  }
};

export default initCloudinary;
