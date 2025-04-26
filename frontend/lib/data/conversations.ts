// lib/data/conversations.ts
import clientPromise from "@/lib/db";
import { ObjectId } from "mongodb";
import { auth } from "@/auth";
import type { Conversation } from "./types";

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

// Add functions for creating conversations, adding messages, etc. as Server Actions later
// e.g., createConversation(projectId: string, title?: string): Promise<Conversation | null>
