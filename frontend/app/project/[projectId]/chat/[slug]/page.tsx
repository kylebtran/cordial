// app/project/[projectId]/chat/[slug]/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getConversationIfOwner } from "@/lib/data/conversations";
import type {
  Conversation,
  Project,
  Role,
  SerializedChatMessage,
} from "@/lib/data/types";
import { getProjectDetails } from "@/lib/data/projects";
import { ChatInterface } from "@/components/ChatInterface";

interface PageProps {
  params: {
    projectId: string;
    slug: string;
  };
}

export default async function ChatPage({ params }: PageProps) {
  const { projectId, slug: conversationId } = params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/chat/${conversationId}`);
  }
  const userId = session.user.id;

  // --- Permission Check: Project Membership ---
  const result: { project: Project; userRole: Role } | null =
    await getProjectDetails(projectId);
  if (!result) {
    console.log(
      `ProjectChatPage: Access denied to project ${projectId} for user ${userId}`
    );
    notFound();
  }

  // --- Permission Check: Conversation Ownership ---
  const conversation: Conversation | null = await getConversationIfOwner(
    conversationId
  );
  if (!conversation) {
    console.log(
      `ProjectChatPage: Conversation ${conversationId} not found or not owned by user ${userId}`
    );
    notFound();
  }

  if (conversation.projectId.toString() !== projectId) {
    console.error(
      `ProjectChatPage: Mismatch! User ${userId} attempted to access Conversation ${conversationId} (belongs to Project ${conversation.projectId}) via URL for Project ${projectId}.`
    );
    notFound();
  }

  const initialSerializedChatMessages: SerializedChatMessage[] =
    conversation.messages.map((msg) => {
      const serializableMsg: SerializedChatMessage = {
        role: msg.role,
        content: msg.content,
        // Include 'id' (string) if it exists (common for assistant messages)
        id: msg.id,
        // Include 'parts' if it exists and assuming it's serializable
        parts: msg.parts,
        // --- Convert complex types ---
        // Convert MongoDB ObjectId to string (handle optionality)
        _id: msg._id?.toString(),
        // Convert JavaScript Date to ISO string (handle optionality)
        createdAt: msg.createdAt?.toISOString(),
        // Add any other fields from ChatMessage that are needed and serializable
      };
      return serializableMsg;
    });

  return (
    <div className="container mx-auto flex flex-col h-full">
      <header className="pb-3 border-outline">
        <h1 className="ml-4 mt-3 text-xl font-medium">
          {conversation.title ||
            `Chat from ${new Date(
              conversation.createdAt
            ).toLocaleDateString()}`}
        </h1>
      </header>

      {/* Main Chat Area - Render the Client Component */}
      <main className="flex flex-grow container mx-auto w-full overflow-hidden justify-center">
        <ChatInterface
          conversationId={conversationId}
          projectId={projectId}
          initialMessages={initialSerializedChatMessages}
        />
      </main>
    </div>
  );
}
