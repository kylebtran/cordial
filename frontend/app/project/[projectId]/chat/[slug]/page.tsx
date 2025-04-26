// app/project/[projectId]/chat/[slug]/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getConversationIfOwner } from "@/lib/data/conversations"; // Adjust path if needed
import type { Conversation, Project, Role } from "@/lib/data/types"; // Adjust path if needed
import { getProjectDetails } from "@/lib/data/projects";

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

  return (
    <div className="container mx-auto p-4 flex flex-col h-screen">
      <header className="mb-4 pb-4 border-b">
        <h1 className="text-2xl font-bold">
          {conversation.title ||
            `Chat from ${conversation.createdAt.toLocaleDateString()}`}
        </h1>
        {/* Link back to the specific project's overview page */}
        <Link
          href={`/project/${conversation.projectId.toString()}/overview`}
          className="text-sm text-blue-600 hover:underline"
        >
          Back to Project Overview
        </Link>
      </header>

      {/* --- Chatbot UI Placeholder --- */}
      <div className="flex-grow overflow-y-auto mb-4 p-4 border rounded bg-gray-50">
        <p className="text-center text-gray-500">Chat message history...</p>
      </div>
      <footer className="mt-auto">
        <input
          type="text"
          placeholder="Type your message..."
          className="w-full p-3 border rounded"
          disabled
        />
      </footer>
      {/* ----------------------------- */}
    </div>
  );
}
