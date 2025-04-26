// components/ChatInterface.tsx
"use client";

import { useChat, type Message as VercelAiMessage } from "ai/react";
import React, { useState, useRef, ChangeEvent, FormEvent } from "react"; // Import FormEvent
import type { SerializedChatMessage } from "@/lib/data/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Type for the metadata of a successfully uploaded and staged file
interface StagedFileInfo {
  name: string; // Original filename
  path: string; // Path/name in GCS bucket
  url: string | null; // Public URL (might be null)
  contentType: string;
  size: number;
}

// Map initial messages (remains the same)
const mapInitialMessages = (
  messages: SerializedChatMessage[]
): VercelAiMessage[] => {
  return messages.map((msg) => ({
    id: msg.id || msg._id || `db-${msg.role}-${Date.now()}-${Math.random()}`,
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
  const {
    messages,
    input,
    handleInputChange,
    // We need 'append' or the original handleSubmit to send the message
    handleSubmit: originalHandleSubmit, // Keep the original submit handler
    isLoading: isAiLoading,
    error: aiError,
    setInput, // Still needed
  } = useChat({
    api: "/api/chat",
    initialMessages: mapInitialMessages(initialMessages),
    onError: (err) => {
      console.error("AI Chat error:", err);
    },
  });

  // --- State for Staged Files ---
  const [stagedFiles, setStagedFiles] = useState<StagedFileInfo[]>([]); // Array to hold staged file info

  // --- State for Upload UI ---
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- File Upload Handler ---
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error || `Upload failed (Status: ${response.status})`
        );
      }
      console.log("Upload successful:", result);

      // --- Add file metadata to stagedFiles state ---
      setStagedFiles((prevFiles) => [
        ...prevFiles,
        {
          name: file.name, // Use original name for display
          path: result.file.path,
          url: result.file.url, // Store URL/path from response
          contentType: result.file.contentType,
          size: result.file.size,
        },
      ]);
      // --- Do NOT modify the text input here ---
    } catch (error: any) {
      console.error("Upload process failed:", error);
      setUploadError(error.message || "File upload failed.");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setIsUploading(false);
    }
  };

  // --- Remove a Staged File ---
  const handleRemoveStagedFile = (filePathToRemove: string) => {
    setStagedFiles((prevFiles) =>
      prevFiles.filter((file) => file.path !== filePathToRemove)
    );
  };

  // --- Trigger Hidden File Input ---
  const handleUploadClick = () => {
    // Clear previous upload errors when triggering a new upload
    setUploadError(null);
    fileInputRef.current?.click();
  };

  // --- Custom Form Submission Handler ---
  const handleFormSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // Prevent default page reload

    // Don't submit if busy or nothing to send
    if (
      isAiLoading ||
      isUploading ||
      (!input.trim() && stagedFiles.length === 0)
    ) {
      return;
    }

    // Prepare the data payload, ensuring it's seen as JSON-compatible
    // Map the files to ensure we only send serializable fields explicitly
    const filesPayload = stagedFiles.map((file) => ({
      name: file.name,
      path: file.path,
      url: file.url, // string or null is serializable
      contentType: file.contentType,
      size: file.size, // number is serializable
    }));

    // Data specific to this message, including staged files
    const messageData = {
      conversationId: conversationId,
      projectId: projectId,
      stagedFilesData: filesPayload,
    };

    console.log("ChatInterface: handleFormSubmit triggered.");
    console.log("ChatInterface: Current input value:", input);
    console.log(
      "ChatInterface: Current stagedFiles state:",
      JSON.stringify(stagedFiles, null, 2)
    );
    console.log(
      "ChatInterface: Prepared messageData for handleSubmit:",
      JSON.stringify(messageData, null, 2)
    );

    try {
      originalHandleSubmit(e, { data: messageData as any });
      console.log("ChatInterface: originalHandleSubmit called successfully.");
    } catch (submitError) {
      console.error(
        "ChatInterface: Error calling originalHandleSubmit:",
        submitError
      );
    }

    // Clear the text input and staged files *after* submitting
    setInput("");
    setStagedFiles([]);
    console.log("ChatInterface: Input and stagedFiles cleared.");
  };

  return (
    <div className="flex flex-col h-full max-h-screen overflow-hidden">
      {/* Message display area */}
      <div className="flex-grow overflow-y-auto mb-4 p-4 space-y-4">
        {/* ... message mapping ... */}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex w-full ${
              m.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`inline-block p-3 rounded-lg max-w-xl md:max-w-2xl lg:max-w-3xl ${
                m.role === "user"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 text-gray-800"
              } prose break-words`}
            >
              <ReactMarkdown
                children={m.content}
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ node, ...props }) => (
                    <a {...props} target="_blank" rel="noopener noreferrer" />
                  ),
                }}
              />
            </div>
          </div>
        ))}
        {/* Status Indicators */}
        {isUploading && (
          <div className="text-center text-sm text-gray-500 py-2">
            {" "}
            Uploading file...{" "}
          </div>
        )}
        {uploadError && (
          <div className="text-center text-sm text-red-500 p-2 border border-red-300 bg-red-50 rounded">
            {" "}
            Upload Error: {uploadError}{" "}
          </div>
        )}
        {isAiLoading && (
          <div className="text-center text-sm text-gray-500 py-2">
            {" "}
            Cordial is thinking...{" "}
          </div>
        )}
        {aiError && (
          <div className="text-center text-sm text-red-500 p-2 border border-red-300 bg-red-50 rounded">
            {" "}
            AI Error: {aiError.message || "Could not get response."}{" "}
          </div>
        )}
      </div>

      {/* Staged Files Display Area */}
      {stagedFiles.length > 0 && (
        <div className="px-4 pb-2 border-t border-b border-gray-200 dark:border-gray-700">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 pt-2 pb-1">
            Attached files:
          </div>
          <div className="flex flex-wrap gap-2">
            {stagedFiles.map((file) => (
              <div
                key={file.path}
                className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-full px-2 py-1 text-sm"
              >
                <span
                  className="text-gray-700 dark:text-gray-200 truncate max-w-[150px]"
                  title={file.name}
                >
                  {file.name}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveStagedFile(file.path)}
                  className="text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 focus:outline-none disabled:opacity-50"
                  title="Remove file"
                  disabled={isUploading || isAiLoading}
                >
                  {/* Simple X icon */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input form area */}
      <form
        onSubmit={handleFormSubmit} // Use the custom handler
        className="flex items-center gap-2 p-4 border-t bg-white dark:bg-gray-800"
      >
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          disabled={isUploading || isAiLoading}
        />

        {/* Visible Upload Button */}
        <button
          type="button"
          onClick={handleUploadClick}
          disabled={isUploading || isAiLoading}
          className="p-2 text-gray-500 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          title="Attach file"
        >
          {/* Paperclip Icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* Text Input Area */}
        <input
          className="flex-grow px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-50"
          value={input}
          placeholder="Ask something..."
          onChange={handleInputChange}
          disabled={isUploading || isAiLoading}
        />

        {/* Send Button */}
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          // Disable if busy OR if there's no text AND no files staged
          disabled={
            isUploading ||
            isAiLoading ||
            (!input.trim() && stagedFiles.length === 0)
          }
        >
          Send
        </button>
      </form>
    </div>
  );
}
