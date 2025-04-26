// lib/gcs/upload.ts
import { Storage } from "@google-cloud/storage";
import { v4 as uuidv4 } from "uuid"; // For generating unique filenames

// Initialize Storage instance.
// If GOOGLE_APPLICATION_CREDENTIALS is set, it authenticates automatically.
// Otherwise, you might need to pass credentials explicitly (less common for server-side).
const storage = new Storage();

const bucketName = process.env.GCS_BUCKET_NAME;

if (!bucketName) {
  throw new Error("Missing GCS_BUCKET_NAME environment variable.");
}

/**
 * Uploads a file buffer to Google Cloud Storage.
 *
 * @param fileBuffer The buffer containing the file data.
 * @param originalFilename The original name of the file uploaded by the user.
 * @param contentType The MIME type of the file (e.g., 'image/png').
 * @param userId Optional: Used for organizing files in GCS.
 * @returns Promise<{ bucket: string; name: string; publicUrl: string; size: number; contentType: string }> Information about the uploaded file.
 * @throws Throws an error if the upload fails.
 */
export async function uploadFileToGCS(
  fileBuffer: Buffer,
  originalFilename: string,
  contentType: string,
  userId?: string
): Promise<{
  bucket: string;
  name: string;
  publicUrl: string;
  size: number;
  contentType: string;
}> {
  if (!bucketName) {
    throw new Error("Missing GCS_BUCKET_NAME environment variable.");
  }
  const bucket = storage.bucket(bucketName);

  // Create a unique filename to avoid collisions
  const uniqueId = uuidv4();
  const fileExtension = originalFilename.split(".").pop() || "";
  // Example structure: uploads/user_id/uuid.extension (adjust as needed)
  const destinationPath = `uploads/${userId ? `${userId}/` : ""}${uniqueId}${
    fileExtension ? `.${fileExtension}` : ""
  }`;

  const file = bucket.file(destinationPath);

  console.log(
    `Attempting to upload '${originalFilename}' to gs://${bucketName}/${destinationPath}`
  );

  try {
    await file.save(fileBuffer, {
      metadata: {
        contentType: contentType,
        // Add custom metadata if needed (e.g., originalFilename)
        metadata: {
          originalFilename: originalFilename,
          ...(userId && { uploaderId: userId }), // Conditionally add uploaderId
        },
      },
    });

    // Get metadata after upload to confirm size etc.
    const [metadata] = await file.getMetadata();
    const fileSize = metadata.size;

    console.log(
      `Successfully uploaded ${originalFilename} to ${destinationPath}. Size: ${fileSize}`
    );

    return {
      bucket: bucketName,
      name: destinationPath, // The full path within the bucket
      publicUrl: file.publicUrl(), // URL if public: true
      size: Number(fileSize), // Ensure size is a number
      contentType: contentType,
    };
  } catch (error) {
    console.error(`Failed to upload ${originalFilename} to GCS:`, error);
    throw new Error(
      `GCS Upload Failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
