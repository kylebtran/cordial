// components/ChatSidebar.tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation"; // To identify the active chat
import type { Role, SidebarConversationInfo } from "@/lib/data/types";
import { CreateNewChatButton } from "@/components/CreateNewChatButton"; // Button using Server Action

interface ChatSidebarProps {
  projectId: string;
  initialConversations: SidebarConversationInfo[];
  projectName: string;
  userRole: Role;
}

export function ChatSidebar({
  projectId,
  initialConversations, // Could be updated via state/revalidation later
  projectName,
  userRole,
}: ChatSidebarProps) {
  const params = useParams<{ slug?: string }>(); // Get current chat slug if available
  const activeConversationId = params?.slug;

  return (
    <aside className="w-64 flex flex-col p-4 overflow-y-auto">
      <h2 className="text-xl font-semibold mb-2 border-b border-gray-700 pb-2">
        {projectName}
      </h2>
      <p className="text-xs text-gray-400 mb-4">Role: {userRole}</p>

      {/* Button to create a new chat */}
      <CreateNewChatButton projectId={projectId} />

      <nav className="mt-6 flex-grow">
        <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase">
          Your Chats
        </h3>
        <ul className="space-y-1">
          {initialConversations.length === 0 ? (
            <li className="text-sm text-gray-500 px-2">No chats yet.</li>
          ) : (
            initialConversations.map((convo) => {
              const isActive = activeConversationId === convo._id.toString();
              return (
                <li key={convo._id.toString()}>
                  <Link
                    href={`/project/${projectId}/chat/${convo._id.toString()}`}
                    className={`block px-3 py-2 rounded-md text-sm font-medium truncate ${
                      isActive
                        ? "bg-gray-900 text-white" // Active chat styling
                        : "text-gray-300 hover:bg-gray-700 hover:text-white" // Inactive chat styling
                    }`}
                    title={
                      convo.title ||
                      `Chat from ${new Date(
                        convo.createdAt
                      ).toLocaleDateString()}`
                    }
                  >
                    {convo.title || `Chat...`}{" "}
                    {/* Display shorter title in sidebar */}
                  </Link>
                </li>
              );
            })
          )}
        </ul>
      </nav>

      {/* Footer or User Info could go here */}
      <div className="mt-auto pt-4 border-t border-gray-700">
        {/* Example: Link back to project settings or dashboard */}
      </div>
    </aside>
  );
}
