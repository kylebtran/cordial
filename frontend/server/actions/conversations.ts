// server/actions/conversations.ts
"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import clientPromise from "@/lib/db";
import { ObjectId } from "mongodb";
import type { Conversation, Membership } from "@/lib/data/types"; // Import types
import { revalidatePath } from "next/cache";

export async function createNewConversationAction(
  projectId: string
): Promise<{ error?: string; success?: boolean }> {
  // Return type indicates potential error
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Authentication required." };
  }
  const userId = session.user.id;

  let projectIdObject: ObjectId;
  let userIdObject: ObjectId;
  try {
    projectIdObject = new ObjectId(projectId);
    userIdObject = new ObjectId(userId);
  } catch (e) {
    console.error("Invalid ID format in createNewConversationAction", e);
    return { error: "Invalid project or user ID format." };
  }

  // Variable to hold the ID of the created conversation, declared outside try block
  let newConversationId: ObjectId | null = null;

  // Single try block for all database operations
  try {
    const client = await clientPromise;
    const db = client.db(); // Get database instance

    // 1. **Permission Check**: Verify user is a member of the project
    const membership = await db.collection<Membership>("memberships").findOne({
      projectId: projectIdObject,
      userId: userIdObject,
    });

    if (!membership) {
      console.warn(
        `User ${userId} attempted to create conversation in project ${projectId} but is not a member.`
      );
      // Return error directly, no need to throw unless you want different handling
      return { error: "You are not a member of this project." };
    }

    // 2. Create the new conversation document data (without _id)
    const newConversationData: Omit<Conversation, "_id"> = {
      projectId: projectIdObject,
      userId: userIdObject,
      messages: [],
      title: null, // Start with no title
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 3. Insert the document
    const conversationsCollection =
      db.collection<Conversation>("conversations");
    const result = await conversationsCollection.insertOne(
      newConversationData as Conversation // <-- Use type assertion here
    );

    if (!result.insertedId) {
      // Throw an error if insertion failed unexpectedly
      throw new Error("Database insertion failed to return an ID.");
    }

    // 4. If insertion succeeded, store the new ID
    newConversationId = result.insertedId;
    console.log(
      `New conversation created: ${newConversationId} in project ${projectId} for user ${userId}`
    );

    // 5. Revalidate the path (do this *before* redirecting)
    revalidatePath(`/project/${projectId}`, "layout");
  } catch (error) {
    // Catch any errors from DB connection, permission check, or insertion
    console.error("Error creating new conversation:", error);
    // Return a generic error message (don't expose detailed DB errors to client)
    return { error: "Could not create new conversation. Please try again." };
  }

  // --- Redirect Logic ---
  // This runs *only* if the try block completed without throwing/returning an error AND insertedId was obtained

  if (newConversationId) {
    // If we have a new ID, redirect the user to the new chat page
    redirect(`/project/${projectId}/chat/${newConversationId.toString()}`);
  } else {
    // This case should ideally not be reached if the try/catch logic is correct,
    // but acts as a fallback.
    console.error(
      "Create conversation succeeded but ID was not captured for redirect."
    );
    return { error: "Failed to create conversation, redirect aborted." };
  }
}
