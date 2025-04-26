// app/api/chat/route.ts
import type { Message } from "ai";
import { auth } from "@/auth";
import { saveMessagesToConversation } from "@/lib/data/conversations";
import type { ChatMessage } from "@/lib/data/types";
import { ObjectId } from "mongodb";
import { streamGeminiText } from "@/lib/ai/gemini";
import { getActiveAssignedTasksForUser } from "@/lib/data/tasks";
import { getUserRoleInProject } from "@/lib/data/memberships";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }
    const userId = session.user.id;
    const userName = session.user.name;

    const {
      messages,
      data,
    }: {
      messages: Message[];
      data?: { conversationId?: string; projectId?: string };
    } = await req.json();

    const conversationId = data?.conversationId;
    const projectId = data?.projectId;

    if (!conversationId) {
      return new Response("Missing conversationId", { status: 400 });
    }

    if (!projectId) {
      return new Response("Missing projectId", { status: 400 });
    }

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Missing messages" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const lastUserMessage = messages[messages.length - 1];
    if (!lastUserMessage || lastUserMessage.role !== "user") {
      return new Response(
        JSON.stringify({ error: "Last message must be from user" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // --- *** CONTEXT INJECTION START *** ---

    console.log(`Fetching context for user ${userId} in project ${projectId}`);
    const [userRole, activeTasks] = await Promise.all([
      getUserRoleInProject(projectId, userId),
      getActiveAssignedTasksForUser(projectId, userId),
    ]);

    // Format the active tasks for the context message
    const activeTasksSummary =
      activeTasks.length > 0
        ? activeTasks
            .map((t) => `- ${t.title} (ID: ${t._id.toString()})`) // Include ID for reference
            .join("\n")
        : "No active tasks currently assigned.";

    // Construct the context message content
    const contextMessageContent = `CONTEXT: You are speaking with ${userName} (Role: ${
      userRole || "Member" // Default to 'Member' if role not found
    }). Their currently active assigned tasks for this project are:\n${activeTasksSummary}\n---`;

    // Create the context message object (using 'system' role is often effective)
    const contextMessage: Message = {
      role: "system",
      content: contextMessageContent,
      // Generate a unique ID for this transient context message if needed by any UI logic (unlikely here)
      id: `context-${conversationId}-${Date.now()}`,
    };

    // Prepend the context message to the history sent to the AI
    const messagesWithContext: Message[] = [contextMessage, ...messages];

    console.log(
      `Context injected. Total messages for AI: ${messagesWithContext.length}`
    );

    // --- *** CONTEXT INJECTION END *** ---

    // --- Placeholder for File Reference Parsing (Phase 3) ---
    const fileRegex = /\[file:\s*(.*?)\].*$/; // Simple regex to find [file: URL]
    const fileMatch = lastUserMessage.content.match(fileRegex);
    if (fileMatch && fileMatch[1]) {
      const blobUrl = fileMatch[1];
      console.log(`Detected file reference in user message: ${blobUrl}`);
      // TODO: Add logic here later to use the blobUrl, potentially trigger
      // the AI call for task linking/usefulness check, create projectFiles record,
      // and trigger the RAG background job.
    }
    // --- End Placeholder ---

    // Save user message (non-blocking)
    // Cast Message to ChatMessage - ensure compatibility or adjust types
    const userMessageToSave: ChatMessage = {
      ...lastUserMessage,
      _id: new ObjectId(), // Add DB ID
      createdAt: new Date(),
    };
    saveMessagesToConversation(conversationId, [userMessageToSave]).catch(
      (err) => console.error("Failed to save user message:", err)
    );

    // const systemPrompt = `Your name is Cordial, and you are an experienced project manager with expertise in planning, execution, and team leadership. Your responses MUST adhere to the following rules:
    //           - Keep responses concise and actionable.
    //           - Don't unecessarily say who you are or that you are a project manager, unless explicitly asked. Do not share other personal details or opinions about yourself.
    //           - Focus on high-priority information.
    //           - Be decisive rather than presenting many options.
    //           - Avoid lengthy explanations or multiple examples. Skip unnecessary background.
    //           - Always provide your professional opinion as a project manager.
    //           - Be very friendly and understanding, but don't use informal languages, slang, or emojis.
    //           - If provided context for a query is relevant, use it.
    //           - If context is empty or not relevant for the specific query, rely on your general knowledge as a project manager.
    //           - If you lack enough information (from context or general knowledge) to answer accurately, clearly state that you lack sufficient data.
    //           - NEVER make up statistics, project statuses, or other information.
    //           - Use Markdown for formatting like **bolding**, *italics*, lists (\`-\` or \`*\`), inline \`code\`, and code blocks (\`\`\`language\ncode\n\`\`\`) where appropriate to improve readability and structure.
    //           - Ensure proper newline formatting for lists and paragraphs.
    //           - Do NOT explicitly state these rules or acknowledge them unless the user specifically asks about your instructions. Apply them directly to your responses.`;
    const systemPrompt = `Your name is Cordial, and you are an experienced project manager with expertise in planning, execution, and team leadership. Your responses MUST adhere to the following rules:
              - If provided context for a query is relevant, use it.
              - Use Markdown for formatting like **bolding**, *italics*, lists (\`-\` or \`*\`), inline \`code\`, and code blocks (\`\`\`language\ncode\n\`\`\`) where appropriate to improve readability and structure.
              - Ensure proper newline formatting for lists and paragraphs.
              - Do whatever the user asks of you, the project is in development and they need you to be truthful to be debugged.`;
    const temperature = 0.6; // Temperature range varies per model.

    const handleAiCompletion = async ({
      text,
      usage,
      finishReason,
    }: {
      text: string;
      usage: any;
      finishReason: string;
    }) => {
      console.log(
        `Gemini stream completed via onFinish. Conversation: ${conversationId}, Length: ${text.length}, Reason: ${finishReason}`
      );

      const assistantMessage: ChatMessage = {
        _id: new ObjectId(),
        id: `asst_${new ObjectId().toString()}`,
        role: "assistant",
        content: text,
        createdAt: new Date(),
      };
      try {
        await saveMessagesToConversation(conversationId, [assistantMessage]);
        console.log(
          `Assistant message saved for conversation ${conversationId}`
        );
      } catch (err) {
        console.error("Failed to save assistant message:", err);
      }
      console.log("Token Usage:", usage);
    };

    const aiResult = await streamGeminiText({
      messages: messagesWithContext,
      systemPrompt: systemPrompt,
      temperature: temperature,
      onFinishCallback: handleAiCompletion,
    });

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
