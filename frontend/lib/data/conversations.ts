// lib/data/conversations.ts
import clientPromise from "@/lib/db";
import { ObjectId } from "mongodb";
import { auth } from "@/auth";
import type { ChatMessage, Conversation } from "@/lib/data/types";

/**
 * Fetches all conversations belonging to the currently logged-in user
 * within a specific project.
 *
 * @param projectId The ID of the project to filter conversations by.
 * @returns An array of Conversation documents owned by the user in that project.
 */
export async function getConversationsForUserInProject(
  projectId: string | ObjectId
): Promise<Conversation[]> {
  const session = await auth();
  if (!session?.user?.id) {
    console.log("getConversationsForUserInProject: No session found.");
    return [];
  }

  let projIdObject: ObjectId;
  try {
    projIdObject =
      typeof projectId === "string" ? new ObjectId(projectId) : projectId;
  } catch (e) {
    console.error(
      "getConversationsForUserInProject: Invalid Project ID format.",
      projectId,
      e
    );
    return [];
  }

  const userIdObject = new ObjectId(session.user.id);

  try {
    const client = await clientPromise;
    const db = client.db();
    const conversationsCollection =
      db.collection<Conversation>("conversations");

    // Find conversations matching BOTH projectId AND userId (owner)
    const conversations = await conversationsCollection
      .find({
        projectId: projIdObject,
        userId: userIdObject,
      })
      .sort({ updatedAt: -1 })
      .toArray();

    console.log(
      `getConversationsForUserInProject: Found ${conversations.length} convos for user ${session.user.id} in project ${projectId}.`
    );
    return conversations;
  } catch (error) {
    console.error("getConversationsForUserInProject: Database error.", error);
    return [];
  }
}

/**
 * Fetches a single conversation by its ID *only if* the currently logged-in user
 * is the owner (matches the conversation's userId field).
 *
 * @param conversationId The ID of the conversation to fetch.
 * @returns The Conversation document if found and user is owner, otherwise null.
 */
export async function getConversationIfOwner(
  conversationId: string | ObjectId
): Promise<Conversation | null> {
  const session = await auth();
  if (!session?.user?.id) {
    console.log("getConversationIfOwner: No session found.");
    return null;
  }

  let convoIdObject: ObjectId;
  try {
    convoIdObject =
      typeof conversationId === "string"
        ? new ObjectId(conversationId)
        : conversationId;
  } catch (e) {
    console.error(
      "getConversationIfOwner: Invalid Conversation ID format.",
      conversationId,
      e
    );
    return null;
  }

  const userIdObject = new ObjectId(session.user.id);

  try {
    const client = await clientPromise;
    const db = client.db();
    const conversationsCollection =
      db.collection<Conversation>("conversations");

    // Find conversation by its ID AND check if userId matches the current user
    const conversation = await conversationsCollection.findOne({
      _id: convoIdObject,
      userId: userIdObject,
    });

    if (!conversation) {
      console.log(
        `getConversationIfOwner: Conversation ${conversationId} not found or user ${session.user.id} is not the owner.`
      );
      return null;
    }

    console.log(
      `getConversationIfOwner: User ${session.user.id} accessed conversation ${conversationId}.`
    );
    return conversation;
  } catch (error) {
    console.error("getConversationIfOwner: Database error.", error);
    return null;
  }
}

/**
 * Appends new messages to a conversation and updates its timestamp.
 * Performs an ownership check to ensure the user can modify this conversation.
 *
 * @param conversationId The ID of the conversation to update.
 * @param messages An array of ChatMessage objects to append.
 * @returns Boolean indicating success or failure.
 */
export async function saveMessagesToConversation(
  conversationId: string | ObjectId,
  messages: ChatMessage[]
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    console.error("saveMessagesToConversation: No session found.");
    return false;
  }

  let convoIdObject: ObjectId;
  try {
    convoIdObject =
      typeof conversationId === "string"
        ? new ObjectId(conversationId)
        : conversationId;
  } catch (e) {
    console.error(
      "saveMessagesToConversation: Invalid Conversation ID format.",
      conversationId,
      e
    );
    return false;
  }

  const userIdObject = new ObjectId(session.user.id);

  if (!messages || messages.length === 0) {
    console.warn("saveMessagesToConversation: No messages provided to save.");
    return true;
  }

  try {
    const client = await clientPromise;
    const db = client.db();
    const conversationsCollection =
      db.collection<Conversation>("conversations");

    const messagesToSave = messages.map((msg) => ({
      ...msg,
      _id: msg._id || new ObjectId(),
      createdAt: msg.createdAt || new Date(),
    }));

    // Update the conversation:
    // 1. Match conversation ID (_id)
    // 2. Match the owner (userId) to ensure only the owner can add messages
    // 3. Push the new message(s) to the 'messages' array
    // 4. Set the 'updatedAt' timestamp
    const result = await conversationsCollection.updateOne(
      {
        _id: convoIdObject,
        userId: userIdObject, // Essential Ownership Check
      },
      {
        $push: { messages: { $each: messagesToSave } },
        $set: { updatedAt: new Date() },
      }
    );

    if (result.matchedCount === 0) {
      console.error(
        `saveMessagesToConversation: Conversation ${conversationId} not found or user ${session.user.id} is not the owner.`
      );
      return false;
    }

    if (result.modifiedCount === 0) {
      console.warn(
        `saveMessagesToConversation: Matched conversation ${conversationId} but didn't modify (maybe empty messages array?).`
      );
    }

    console.log(
      `saveMessagesToConversation: Successfully saved ${messagesToSave.length} messages to conversation ${conversationId}.`
    );
    return true;
  } catch (error) {
    console.error("saveMessagesToConversation: Database error.", error);
    return false;
  }
}

// Add functions for creating conversations, adding messages, etc. as Server Actions later
// e.g., createConversation(projectId: string, title?: string): Promise<Conversation | null>

/**
 * Updates the title of a specific conversation.
 *
 * @param conversationId The ID of the conversation to update.
 * @param newTitle The new title string.
 * @returns Boolean indicating if the update was acknowledged by the database.
 */
export async function updateConversationTitle(
  conversationId: string | ObjectId,
  newTitle: string
): Promise<boolean> {
  // Basic validation
  if (!newTitle || newTitle.trim().length === 0) {
    console.warn(
      "Attempted to update conversation title with empty string. Skipping."
    );
    return false;
  }

  try {
    const client = await clientPromise;
    const db = client.db(); // Use your DB name logic
    const conversationsCollection =
      db.collection<Conversation>("conversations");

    const convoIdObject = new ObjectId(conversationId);

    console.log(
      `Updating title for conversation ${convoIdObject} to "${newTitle}"`
    );

    const result = await conversationsCollection.updateOne(
      { _id: convoIdObject },
      {
        $set: {
          title: newTitle.trim(), // Ensure trimmed title is saved
          updatedAt: new Date(), // Update timestamp
        },
      }
    );

    if (result.matchedCount === 0) {
      console.warn(`Update title: Conversation ${convoIdObject} not found.`);
      return false;
    }
    if (result.modifiedCount === 0) {
      console.warn(
        `Update title: Conversation ${convoIdObject} found, but title was not modified (maybe it was already set?).`
      );
      // Consider this success or failure based on requirements, true seems reasonable
      return true;
    }

    console.log(
      `Successfully updated title for conversation ${convoIdObject}.`
    );
    return true;
  } catch (error) {
    console.error("Error updating conversation title:", error);
    return false;
  }
}
