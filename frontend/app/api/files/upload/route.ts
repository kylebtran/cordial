// app/api/files/upload/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth"; // Your authentication setup
import { uploadFileToGCS } from "@/lib/gcs/upload"; // Import the GCS utility

const MAX_FILE_SIZE_MB = 10; // Example: Set a max file size limit (e.g., 10MB)
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate the user
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. Get file from request body (using FormData)
    const formData = await req.formData();
    const file = formData.get("file") as File | null; // "file" is the key used in FormData on client

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // 3. Validate file size and type (optional but recommended)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File size exceeds limit of ${MAX_FILE_SIZE_MB}MB` },
        { status: 413 }
      ); // 413 Payload Too Large
    }
    // Add content type validation if needed (e.g., allow only images/pdfs)
    // const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    // if (!allowedTypes.includes(file.type)) {
    //     return NextResponse.json({ error: `Invalid file type: ${file.type}` }, { status: 415 }); // 415 Unsupported Media Type
    // }

    // 4. Read file content into a buffer
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // 5. Upload to GCS using the utility function
    console.log(`Uploading file for user: ${userId}`);
    const uploadResult = await uploadFileToGCS(
      fileBuffer,
      file.name, // Original filename
      file.type, // Content type
      userId // Pass userId for potential path organization
    );

    // 6. Return success response with file details
    return NextResponse.json(
      {
        message: "File uploaded successfully",
        file: {
          url: uploadResult.publicUrl, // Or just path if not public
          path: uploadResult.name,
          bucket: uploadResult.bucket,
          originalFilename: file.name,
          contentType: uploadResult.contentType,
          size: uploadResult.size,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("File upload API error:", error);
    // Check if it's a specific GCS error we threw
    if (
      error instanceof Error &&
      error.message.startsWith("GCS Upload Failed:")
    ) {
      return NextResponse.json({ error: error.message }, { status: 500 }); // Internal Server Error related to GCS
    }
    // Generic internal server error
    return NextResponse.json(
      { error: "Internal Server Error during file upload" },
      { status: 500 }
    );
  }
}
