// components/CreateNewChatButton.tsx
"use client";

import { useTransition } from "react";
import { createNewConversationAction } from "@/server/actions/conversations"; // Adjust path

interface Props {
  projectId: string;
}

export function CreateNewChatButton({ projectId }: Props) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const result = await createNewConversationAction(projectId);
      if (result?.error) {
        // TODO: Show an error message to the user (e.g., using a toast notification library)
        alert(`Error: ${result.error}`); // Simple alert for now
      }
      // Redirect happens server-side on success
    });
  };

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="w-full flex items-center justify-center gap-2 px-3 py-2 mb-4 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isPending ? "Creating..." : "New Chat"}
    </button>
  );
}
