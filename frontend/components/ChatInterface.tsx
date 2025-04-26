// components/ChatInterface.tsx
"use client";

import { useChat, type Message } from "ai/react";
import { useState } from "react";
import type { SerializedChatMessage } from "@/lib/data/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Map initial messages fetched from DB to the format useChat expects (if needed)
// Ensure they have string IDs for React keys
const mapInitialMessages = (messages: SerializedChatMessage[]): Message[] => {
  return messages.map((msg) => ({
    id: msg.id || msg._id || `db-${Math.random()}`,
    role: msg.role,
    content: msg.content,
  }));
};

interface ChatInterfaceProps {
  conversationId: string;
  projectId: string;
  initialMessages: SerializedChatMessage[];
}

export function ChatInterface({
  conversationId,
  projectId,
  initialMessages,
}: ChatInterfaceProps) {
  // State for potential file uploads (basic example)
  const [fileInput, setFileInput] = useState<File | null>(null);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    setMessages,
    append,
  } = useChat({
    // Point to your API route
    api: "/api/chat",
    // Provide initial messages fetched from the server
    initialMessages: mapInitialMessages(initialMessages),
    // Pass conversationId and projectId in the 'data' field of the request body
    body: {
      data: {
        conversationId: conversationId,
        projectId: projectId,
        // You could add other context here if needed by the API route
      },
    },
    // Handle errors from the API route
    onError: (err) => {
      console.error("Chat error:", err);
      // TODO: Display a user-friendly error message in the UI
    },
    // Optional: Callback when the API response finishes streaming
    // onFinish: (message) => {
    //     console.log('Stream finished:', message);
    //     // Assistant message is saved via the API route's onCompletion callback now
    // },
  });

  // --- TODO: Implement File Handling ---
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFileInput(file);
      // TODO: Add UI to show selected file, option to remove
      console.log("File selected:", file.name);
    }
  };

  // --- Custom Submit Handler (Optional - for more control, e.g., adding files) ---
  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const userMessageContent = input;
    if (!userMessageContent && !fileInput) return; // Need text or file

    // Create the user message object
    const userMessage: Message = {
      id: Date.now().toString(), // Temporary ID
      role: "user",
      content: userMessageContent,
      // TODO: Add file data if present (requires modification to useChat or manual fetch)
      // This part is complex with useChat. Sending files often requires a custom fetch
      // or encoding file as base64 and adding to 'data' if small enough.
      // For simplicity now, we'll ignore the file in the submit logic.
      // A more robust solution might use a separate upload step or custom fetch.
    };

    // Append the user message optimistically to the UI
    // Use `append` which triggers the API call internally
    await append(userMessage, {
      data: {
        // Ensure data is sent with append too
        conversationId: conversationId,
        projectId: projectId,
      },
    });

    // Reset input and file state
    // Input reset is handled by useChat's handleSubmit, but do manually if using append like this
    // handleInputChange({ target: { value: '' } } as any); // Reset input field (useChat does this)
    setFileInput(null);
    // TODO: Clear file input UI element
  };

  return (
    <div className="flex flex-col h-full">
      {" "}
      {/* Ensure parent has height */}
      {/* Message display area */}
      <div className="flex-grow overflow-y-auto mb-4 p-4 space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`whitespace-pre-wrap ${
              m.role === "user" ? "text-right" : "text-left"
            }`}
          >
            <div
              className={`inline-block p-3 rounded-lg ${
                m.role === "user"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 text-gray-800"
              } prose break-words`}
            >
              <strong>{m.role === "user" ? "You" : "AI"}:</strong>
              <ReactMarkdown
                children={m.content}
                remarkPlugins={[remarkGfm]}
                // Optional: Customize rendering of specific elements if needed
                // components={{
                //   // Example: Style code blocks
                //   code({node, inline, className, children, ...props}) {
                //     const match = /language-(\w+)/.exec(className || '')
                //     return !inline ? (
                //       <code className={`${className} bg-gray-700 text-white p-2 rounded block overflow-x-auto`} {...props}>
                //         {children}
                //       </code>
                //     ) : (
                //       <code className={`${className} bg-gray-300 text-red-600 px-1 rounded`} {...props}>
                //         {children}
                //       </code>
                //     )
                //   }
                // }}
              />
              {/* TODO: Display image/file previews if message contains them */}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="text-center text-gray-500">AI thinking...</div>
        )}
        {error && (
          <div className="text-center text-red-500 p-2 border border-red-500 rounded">
            Error: {error.message || "Could not get response."}
          </div>
        )}
      </div>
      {/* Input form */}
      {/* Use the default handleSubmit from useChat for simpler text-only for now */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 p-4 border-t"
      >
        {/* Basic File Input - Needs Styling and Integration */}
        {/* <input type="file" onChange={handleFileChange} accept="image/*" /> */}

        <input
          className="flex-grow p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={input}
          placeholder="Ask something..."
          onChange={handleInputChange}
          disabled={isLoading}
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          disabled={isLoading || !input} // Disable if loading or no input
        >
          Send
        </button>
      </form>
      {/* Display selected file info - Basic Example */}
      {/* {fileInput && <p className="text-sm p-2">Selected file: {fileInput.name}</p>} */}
    </div>
  );
}
