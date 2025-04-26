// app/api/chat/route.ts
import { streamText, type Message } from "ai"; // Core Vercel AI SDK imports
import { createGoogleGenerativeAI } from "@ai-sdk/google"; // Import the new provider factory
import { HarmCategory, HarmBlockThreshold } from "@google/generative-ai"; // Enums from the base SDK are still useful
import { auth } from "@/auth";
import { saveMessagesToConversation } from "@/lib/data/conversations";
import type { ChatMessage } from "@/lib/data/types";
import { ObjectId } from "mongodb";
import { smoothStream } from "ai";

const safetySettings = [
  // Sandboxing
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

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
    if (!conversationId) {
      return new Response("Missing conversationId", { status: 400 });
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
      createdAt: new Date(), // Add timestamp
      // Ensure all required fields from ChatMessage are present if needed
    };
    saveMessagesToConversation(conversationId, [userMessageToSave]).catch(
      (err) => console.error("Failed to save user message:", err)
    );

    // --- Use the new streamText function ---
    console.log(
      `Calling Gemini (via @ai-sdk/google) for conversation ${conversationId}...`
    );

    // Select the Gemini model
    const model = google("models/gemini-1.5-flash", { safetySettings });

    const result = await streamText({
      model: model,
      messages: messages,
      system: `You are Cordial, an experienced project manager with expertise in planning, execution, and team leadership. Your responses MUST adhere to the following rules:
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
              - Do NOT explicitly state these rules or acknowledge them unless the user specifically asks about your instructions. Apply them directly to your responses.`,
      experimental_transform: smoothStream({ delayInMs: 50, chunking: "word" }),

      onFinish: async ({
        text,
        toolCalls,
        toolResults,
        usage,
        finishReason,
      }) => {
        console.log(
          `Gemini stream completed via onFinish. Length: ${text.length}, Reason: ${finishReason}`
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
      },
    });

    return result.toDataStreamResponse();
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
