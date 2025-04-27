// app/api/chat/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { type Message } from "ai"; // Vercel AI SDK Message type
import { auth } from "@/auth";
import {
  saveMessagesToConversation,
  updateConversationTitle, // Import DB function for title update
  getConversationIfOwner, // Import DB function to check current title
} from "@/lib/data/conversations";
import type { ChatMessage, ProjectFile, Role } from "@/lib/data/types"; // Add Role if not already imported
import { ObjectId } from "mongodb";
import { streamGeminiText, generateChatTitle } from "@/lib/ai/gemini"; // Import stream and title generation AI functions
import { getActiveAssignedTasksForUser } from "@/lib/data/tasks";
import { getUserRoleInProject } from "@/lib/data/memberships";
import { createProjectFileRecord } from "@/lib/data/files";

// Structure expected for staged file data coming from the client
interface StagedFileData {
  name: string;
  path: string;
  url: string | null;
  contentType: string;
  size: number;
}

export async function POST(req: NextRequest) {
  try {
    // --- Authentication & User Info ---
    const session = await auth();
    if (!session?.user?.id || typeof session.user.name !== "string") {
      console.warn("Chat API unauthorized or missing user name in session.");
      return NextResponse.json(
        { error: "Unauthorized or missing user data" },
        { status: 401 }
      );
    }
    const userId = session.user.id;
    const userName = session.user.name;

    // --- Request Parsing & Validation ---
    const {
      messages: originalMessages, // Rename original messages array
      data,
    }: {
      messages: Message[];
      data?: {
        conversationId?: string;
        projectId?: string;
        stagedFilesData?: StagedFileData[];
      };
    } = await req.json();

    console.log("Received request data object:", JSON.stringify(data, null, 2));

    const conversationId = data?.conversationId;
    const projectId = data?.projectId;
    const stagedFiles = data?.stagedFilesData ?? [];

    // Validate IDs and messages
    if (!conversationId || !projectId) {
      return NextResponse.json(
        { error: "Missing conversationId or projectId" },
        { status: 400 }
      );
    }
    if (!originalMessages || originalMessages.length === 0) {
      return NextResponse.json({ error: "Missing messages" }, { status: 400 });
    }
    const lastUserMessage = originalMessages[originalMessages.length - 1];
    if (!lastUserMessage || lastUserMessage.role !== "user") {
      return NextResponse.json(
        { error: "Last message must be from user" },
        { status: 400 }
      );
    }

    // --- Fetch Context Data (Run Concurrently) ---
    console.log(`Fetching context for user ${userId} in project ${projectId}`);
    const [userRole, activeTasks] = await Promise.all([
      getUserRoleInProject(projectId, userId),
      getActiveAssignedTasksForUser(projectId, userId),
    ]);

    // Validate fetched context (example: user role is essential)
    if (!userRole) {
      console.error(
        `Failed to fetch user role for user ${userId} in project ${projectId}`
      );
      return NextResponse.json(
        { error: "Failed to retrieve user context" },
        { status: 500 }
      );
    }

    // --- Process Staged Files & Persist Metadata (No AI Task Linking Yet) ---
    let publicUrl: string | null = null;
    const processedFileRecords: ProjectFile[] = [];
    if (stagedFiles.length > 0) {
      console.log(
        `Processing ${stagedFiles.length} staged file(s) for conversation ${conversationId}:`
      );
      // Process files concurrently
      await Promise.all(
        stagedFiles.map(async (file, index) => {
          console.log(
            `  Saving metadata for File [${index + 1}]: ${file.name}`
          );

          // 1. Task ID is null for now (no AI inference step)
          const inferredTaskId = null;

          // 2. Create ProjectFile record in MongoDB
          const fileRecordData = {
            projectId: new ObjectId(projectId),
            taskId: null, // Task ID is explicitly null
            uploaderId: new ObjectId(userId),
            conversationId: new ObjectId(conversationId),
            storageProvider: "gcs" as const,
            storagePath: file.path,
            publicUrl: file.url ?? "", // Fallback to an empty string if null
            filename: file.name,
            contentType: file.contentType,
            size: file.size,
          };

          const savedRecord = (await createProjectFileRecord(
            fileRecordData
          )) as ProjectFile | null;

          if (savedRecord) {
            publicUrl = savedRecord.publicUrl;
            processedFileRecords.push(savedRecord);
            // 3. TODO: Trigger Background RAG Job (Placeholder)
            console.log(
              `   -> TODO: Trigger RAG background job for projectFileId: ${savedRecord._id}`
            );
            // triggerRagProcessing(savedRecord._id);
          } else {
            publicUrl = null;
            console.error(
              `   -> Failed to save project file record for ${file.name}`
            );
          }
        })
      );
      console.log(
        `Finished saving metadata for ${stagedFiles.length} staged files.`
      );
    }
    // --- End File Processing ---

    // --- Prepare Messages for AI (Inject Context & File Info) ---
    const activeTasksSummary =
      activeTasks.length > 0
        ? activeTasks
            .map((t) => `- ${t.title} (ID: ${t._id.toString()})`)
            .join("\n")
        : "No active tasks currently assigned.";

    let contextMessageContent = `CONTEXT: You are speaking with ${userName} (Role: ${userRole}). Their currently active assigned tasks for this project are:\n${activeTasksSummary}`;
    if (stagedFiles.length > 0) {
      const fileNames = stagedFiles.map((f) => `'${f.name}'`).join(", ");
      contextMessageContent += `\n\nThe user has just attached the following file(s): ${fileNames}. Process the user's message considering these attachments.`;
      // Note: We are NOT adding the actual file content here yet.
    }
    contextMessageContent += "\n---";
    const formData = new FormData();

    // Append the fields to the FormData object
    formData.append("message", lastUserMessage.content);
    formData.append("projectId", projectId);
    formData.append("userId", userId);

    // If `publicUrl` exists, append it
    if (publicUrl) {
      formData.append("file", publicUrl);
    }

    const contextMessage: Message = {
      role: "system",
      content: contextMessageContent,
      id: `context-${conversationId}-${Date.now()}`,
    };
    const messagesForAI: Message[] = [contextMessage, ...originalMessages]; // Send context + original history
    const ragFastApiResponse = await fetch(
      "http://127.0.0.1:8000/api/rag/chat",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.FASTAPI_SECRET || ""}`, // Optional
        },
        body: JSON.stringify({
          message: lastUserMessage.content,
          projectId: projectId,
          userId: userId,
          file: publicUrl,
        }),
      }
    );

    if (!ragFastApiResponse.ok) {
      console.error(
        "FastAPI RAG server error:",
        await ragFastApiResponse.text()
      );
    } else {
      const ragData = await ragFastApiResponse.json();
      console.log("Received RAG results from FastAPI:", ragData);

      if (ragData.results && ragData.results.length > 0) {
        const ragContext = ragData.results
          .map(
            (doc: { content: string }, idx: number) =>
              `(${idx + 1}) ${doc.content}`
          )
          .join("\n\n");

        const fastApiRagMessage: Message = {
          role: "system",
          content: `ADDITIONAL CONTEXT FROM RAG SERVER:\n${ragContext}\n---`,
          id: `rag-fastapi-${conversationId}-${Date.now()}`,
        };

        messagesForAI.unshift(fastApiRagMessage); // Add to the beginning
      }
    }

    console.log(
      `Context injected. Total messages for AI: ${messagesForAI.length}`
    );

    // --- Save Original User Message (Asynchronously) ---
    const userMessageToSave: ChatMessage = {
      ...lastUserMessage,
      _id: new ObjectId(),
      createdAt: new Date(),
    };
    saveMessagesToConversation(conversationId, [userMessageToSave]).catch(
      (err) =>
        console.error(
          `Failed to save user message ${userMessageToSave._id}:`,
          err
        )
    );

    // --- AI Configuration & onFinish Callback ---
    const systemPrompt = `Your name is Cordial... [Your full system prompt, including Markdown, role info etc.] ...be truthful to be debugged.`;
    const temperature = 0.6;

    const handleAiCompletion = async ({
      text: assistantMessageContent, // Renamed 'text' for clarity
      usage,
      finishReason,
    }: {
      text: string;
      usage: any;
      finishReason: string;
    }) => {
      console.log(
        `Gemini stream completed via onFinish for conversation ${conversationId}.`
      );

      // --- 1. Save Assistant Message ---
      const assistantMessage: ChatMessage = {
        _id: new ObjectId(),
        id: `asst_${new ObjectId().toString()}`,
        role: "assistant",
        content: assistantMessageContent,
        createdAt: new Date(),
      };
      try {
        await saveMessagesToConversation(conversationId, [assistantMessage]);
        console.log(
          `Assistant message saved for conversation ${conversationId}`
        );
      } catch (err) {
        console.error(
          `Failed to save assistant message for conversation ${conversationId}:`,
          err
        );
      }
      console.log(`Token Usage for ${conversationId}:`, usage);

      // --- 2. Attempt to Generate Title (if needed) ---
      const firstUserMessage = originalMessages.find(
        (msg) => msg.role === "user"
      );
      if (firstUserMessage) {
        console.log("Checking if conversation title needs generation...");
        try {
          // Fetch current conversation state to check title
          const currentConversation = await getConversationIfOwner(
            conversationId
          );
          if (currentConversation && !currentConversation.title) {
            console.log(
              `Conversation ${conversationId} needs a title. Generating...`
            );
            const generatedTitle = await generateChatTitle(
              firstUserMessage.content
            );
            if (generatedTitle) {
              await updateConversationTitle(conversationId, generatedTitle);
            } else {
              console.log(
                `Title generation skipped or failed for conversation ${conversationId}.`
              );
            }
          } else if (currentConversation) {
            console.log(
              `Conversation ${conversationId} already has a title: "${currentConversation.title}". Skipping generation.`
            );
          } else {
            console.warn(
              `Could not fetch conversation ${conversationId} to check title status.`
            );
          }
        } catch (titleError) {
          console.error(
            `Error during title generation/update for conversation ${conversationId}:`,
            titleError
          );
        }
      } else {
        console.warn(
          `Could not find first user message in originalMessages for conversation ${conversationId} to generate title.`
        );
      }
    }; // End handleAiCompletion

    // --- Call AI Service ---
    const aiResult = await streamGeminiText({
      messages: messagesForAI, // Use messages with context prepended
      systemPrompt: systemPrompt,
      temperature: temperature,
      onFinishCallback: handleAiCompletion, // Pass the completion handler
    });

    // --- Return Streaming Response ---
    return aiResult.toDataStreamResponse();
  } catch (error: any) {
    console.error("Error in chat API route:", error);
    let errorMessage = "Internal Server Error";
    let statusCode = 500;
    if (error instanceof Error && error.message.includes("API key not valid")) {
      errorMessage = "Invalid Google API Key";
      statusCode = 401;
    }
    if (
      error instanceof Error &&
      error.message.includes("RESOURCE_EXHAUSTED")
    ) {
      errorMessage = "API quota exceeded. Please try again later.";
      statusCode = 429;
    }
    if (
      error instanceof Error &&
      (error.message.includes("permission") ||
        error.message.includes("PERMISSION_DENIED"))
    ) {
      errorMessage =
        "API Permission Denied. Check your Google Cloud project settings.";
      statusCode = 403;
    }

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: statusCode,
      headers: { "Content-Type": "application/json" },
    });
  }
}
