// lib/data/files.ts
import clientPromise from "@/lib/db";
import { ObjectId } from "mongodb";
import type { ProjectFile } from "@/lib/data/types";

// Type for data needed to create a new file record (excluding generated fields)
type ProjectFileCreationData = Omit<
  ProjectFile,
  | "_id"
  | "ragStatus"
  | "createdAt"
  | "updatedAt"
  | "aiMetadata"
  | "errorMessage"
  | "publicUrl"
> & {
  taskId: ObjectId | null; // Make taskId explicitly nullable ObjectId
  publicUrl: string; // Include publicUrl from upload
};

/**
 * Creates a new record for an uploaded file in the projectFiles collection.
 * @param fileData - Data for the file record.
 * @returns The newly created ProjectFile document or null if insertion fails.
 */
export async function createProjectFileRecord(
  fileData: ProjectFileCreationData
): Promise<ProjectFile | null> {
  try {
    const client = await clientPromise;
    const db = client.db(); // Use your DB name logic
    const collection = db.collection<ProjectFile>("projectFiles");

    const now = new Date();
    const newRecord: Omit<ProjectFile, "_id"> = {
      ...fileData,
      taskId: fileData.taskId, // Ensure taskId is passed correctly
      publicUrl: fileData.publicUrl, // Pass publicUrl
      createdAt: now,
      updatedAt: now,
      conversationId: fileData.conversationId,
    };

    const result = await collection.insertOne(newRecord as ProjectFile); // Assert type after adding required fields

    if (!result.insertedId) {
      console.error(
        "Failed to insert project file record, no insertedId returned."
      );
      return null;
    }

    // Fetch the inserted document to return the complete object
    const insertedDoc = await collection.findOne({ _id: result.insertedId });
    console.log(`Created project file record: ${result.insertedId}`);
    return insertedDoc;
  } catch (error) {
    console.error("Error creating project file record:", error);
    return null;
  }
}
