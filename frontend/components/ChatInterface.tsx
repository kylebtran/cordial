// components/ChatInterface.tsx
"use client";

import { useChat, type Message as VercelAiMessage } from "ai/react";
import React, {
  useState,
  useRef,
  ChangeEvent,
  FormEvent,
  useEffect,
} from "react"; // Import FormEvent and other hooks
import { useMemo } from "react"; // Properly import useMemo
import type { SerializedChatMessage } from "@/lib/data/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { dark, oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ArrowUpIcon, PlusIcon, XIcon } from "lucide-react";

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
  initialMessages: initialMessagesProp,
}: ChatInterfaceProps) {
  // --- Memoize the mapped initial messages ---
  const memoizedInitialMessages = useMemo(() => {
    // This code only runs if initialMessagesProp actually changes reference
    return mapInitialMessages(initialMessagesProp);
  }, [initialMessagesProp]); // Dependency is the prop from the parent
  // -------------------------------------------

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit: originalHandleSubmit,
    isLoading: isAiLoading,
    error: aiError,
    setInput,
  } = useChat({
    api: "/api/chat",
    // --- Use the MEMOIZED value here ---
    initialMessages: memoizedInitialMessages,
    // ---------------------------------
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
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

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
    <div className="flex flex-col h-full max-h-screen overflow-hidden items-center min-w-full">
      {/* Message display area */}
      <div className="absolute w-[60%] h-12 bg-gradient-to-b from-background to-transparent" />
      <div
        ref={messagesContainerRef}
        className="flex-grow overflow-y-auto space-y-4 w-[60%] scrollbar-hide"
      >
        {/* ... message mapping ... */}
        <div className="h-4" />
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex w-full ${
              m.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`inline-block text-foreground ${
                m.role === "user" ? "bg-outline px-4 py-2 rounded" : ""
              } prose-invert prose break-words`}
            >
              <ReactMarkdown
                children={m.content}
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ node, ...props }) => (
                    <a {...props} target="_blank" rel="noopener noreferrer" />
                  ),
                  code({ node, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    return match ? (
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                      >
                        {String(children).replace(/\n$/, "")}
                      </SyntaxHighlighter>
                    ) : (
                      <code
                        className="bg-outline/40 outline outline-outline text-accent px-1 py-0.5 rounded text-sm font-mono"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                }}
              />
            </div>
          </div>
        ))}
        <div className="h-8" />
        {/* Status Indicators */}
        {uploadError && (
          <div className="text-center text-sm text-red-500 p-2 border border-red-300 bg-red-50 rounded">
            Upload Error: {uploadError}{" "}
          </div>
        )}
        {aiError && (
          <div className="text-center text-sm text-red-500 p-2 border border-red-300 bg-red-50 rounded">
            {" "}
            AI Error: {aiError.message || "Could not get response."}{" "}
          </div>
        )}
      </div>

      {/* Input form area */}
      <form
        onSubmit={handleFormSubmit} // Use the custom handler
        className="flex gap-2 mb-2 w-[62%]"
      >
        <div className="flex flex-col w-full gap-2 p-2 bg-outline/40 border border-outline rounded">
          {/* Text Input Area */}
          {stagedFiles.length > 0 && (
            <div className="w-full px-2">
              <div className="flex flex-wrap gap-2">
                {stagedFiles.map((file) => (
                  <div
                    key={file.path}
                    className="flex items-center gap-1 bg-outline rounded-full px-4 py-1"
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
                      className="text-foreground/50 hover:text-red-600 dark:hover:text-red-400 focus:outline-none disabled:opacity-50"
                      title="Remove file"
                      disabled={isUploading || isAiLoading}
                    >
                      {/* Simple X icon */}
                      <XIcon width={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              className="flex-grow px-3 py-2 min-h-20 focus:outline-none resize-none"
              value={input}
              placeholder="Ask anything"
              onChange={handleInputChange}
              disabled={isUploading || isAiLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() || stagedFiles.length > 0) {
                    handleFormSubmit(
                      e as unknown as FormEvent<HTMLFormElement>
                    );
                  }
                }
              }}
            />

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
              className="p-2 hover:bg-outline/50 text-foreground/50 rounded-md focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              title="Attach file"
            >
              <PlusIcon strokeWidth={1.5} />
            </button>

            <button
              type="submit"
              className="flex p-2 rounded-lg bg-accent hover:bg-accent/70 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 justify-center items-center"
              // Disable if busy OR if there's no text AND no files staged
              disabled={
                isUploading ||
                isAiLoading ||
                (!input.trim() && stagedFiles.length === 0)
              }
            >
              <ArrowUpIcon />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
