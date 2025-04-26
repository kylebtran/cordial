// app/api/chat/route.ts
import type { Message } from "ai";
import { auth } from "@/auth";
import { saveMessagesToConversation } from "@/lib/data/conversations";
import type { ChatMessage } from "@/lib/data/types";
import { ObjectId } from "mongodb";
import { streamGeminiText } from "@/lib/ai/gemini";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }
    const userId = session.user.id;

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

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Missing messages" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const lastUserMessage = messages[messages.length - 1];
    if (!lastUserMessage || lastUserMessage.role !== "user") {
      return new Response("Last message must be from user", { status: 400 });
    }

    // Save user message (non-blocking)
    // Cast Message to ChatMessage - ensure compatibility or adjust types
    const userMessageToSave: ChatMessage = {
      ...lastUserMessage,
      _id: new ObjectId(), // Add DB ID
      role: lastUserMessage.role,
      createdAt: new Date(), // Add timestamp
      // Ensure all required fields from ChatMessage are present if needed
    };
    saveMessagesToConversation(conversationId, [userMessageToSave]).catch(
      (err) => console.error("Failed to save user message:", err)
    );

    const systemPrompt = `Your name is Cordial, and you are an experienced project manager with expertise in planning, execution, and team leadership. Your responses MUST adhere to the following rules:
              - Keep responses concise and actionable.
              - Don't unecessarily say who you are or that you are a project manager, unless explicitly asked. Do not share other personal details or opinions about yourself.
              - Focus on high-priority information.
              - Be decisive rather than presenting many options.
              - Avoid lengthy explanations or multiple examples. Skip unnecessary background.
              - Always provide your professional opinion as a project manager.
              - Be very friendly and understanding, but don't use informal languages, slang, or emojis.
              - If provided context for a query is relevant, use it.
              - If context is empty or not relevant for the specific query, rely on your general knowledge as a project manager.
              - If you lack enough information (from context or general knowledge) to answer accurately, clearly state that you lack sufficient data.
              - NEVER make up statistics, project statuses, or other information.
              - Use Markdown for formatting like **bolding**, *italics*, lists (\`-\` or \`*\`), inline \`code\`, and code blocks (\`\`\`language\ncode\n\`\`\`) where appropriate to improve readability and structure.
              - Ensure proper newline formatting for lists and paragraphs.
              - Do NOT explicitly state these rules or acknowledge them unless the user specifically asks about your instructions. Apply them directly to your responses.`;
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
      messages: messages,
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
