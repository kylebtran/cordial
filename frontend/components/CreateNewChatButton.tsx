// components/CreateNewChatButton.tsx
"use client";

import { useTransition } from "react";
import { createNewConversationAction } from "@/server/actions/conversations"; // Adjust path
import { PlusIcon } from "lucide-react";

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
      className="w-full h-8 flex items-center gap-2 px-2 text-[12px] font-semibold text-background bg-accent rounded-md hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <PlusIcon strokeWidth={2} width={16} />
      {isPending ? "Creating..." : "New Chat"}
    </button>
  );
}
