// components/ChatSidebar.tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation"; // To identify the active chat
import type { Role, SidebarConversationInfo } from "@/lib/data/types";
import { CreateNewChatButton } from "@/components/CreateNewChatButton"; // Button using Server Action
import { useState } from "react";
import { Searchbar } from "./Searchbar";

interface ChatSidebarProps {
  projectId: string;
  initialConversations: SidebarConversationInfo[];
  projectName: string;
  userRole: Role;
}

export function ChatSidebar({
  projectId,
  initialConversations, // Could be updated via state/revalidation later
}: ChatSidebarProps) {
  const params = useParams<{ slug?: string }>(); // Get current chat slug if available
  const activeConversationId = params?.slug;
  const [search, setSearch] = useState<string>("");

  return (
    <aside className="w-[260px] flex flex-col gap-4 p-4 overflow-y-auto border-x border-t border-outline mt-12">
      {/* Button to create a new chat */}
      <div className="flex flex-col w-full gap-2">
        <Searchbar search={search} setSearch={setSearch} />
        <CreateNewChatButton projectId={projectId} />
      </div>

      <nav className="flex-grow">
        <h3 className="text-[12px] font-semibold text-foreground/70 mb-2 uppercase">
          Recents
        </h3>
        <ul className="space-y-0">
          {initialConversations.length === 0 ? (
            <li className="text-foreground px-2">No chats yet.</li>
          ) : (
            initialConversations.map((convo) => {
              const isActive = activeConversationId === convo._id.toString();
              return (
                <li key={convo._id.toString()}>
                  <Link
                    href={`/project/${projectId}/chat/${convo._id.toString()}`}
                    className={`block px-3 py-2 rounded text-sm font-medium truncate transition-all ease-in-out duration-300 ${
                      isActive
                        ? "bg-outline/50" // Active chat styling
                        : "text-foreground/70 hover:bg-outline/20 hover:text-white" // Inactive chat styling
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
    </aside>
  );
}
