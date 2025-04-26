// lib/ai/gemini.ts
import { streamText, type Message, type CoreTool, StreamTextResult } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { smoothStream } from "ai";

if (!process.env.GOOGLE_API_KEY) {
  throw new Error("Missing environment variable: GOOGLE_API_KEY");
}

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

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

// Define the type for the arguments passed to the onFinish callback
// Based on Vercel AI SDK's streamText onFinish parameters
interface GeminiOnFinishResult {
  text: string;
  toolCalls?: any; // Replace 'any' with specific types if using tools
  toolResults?: any; // Replace 'any' with specific types if using tools
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason:
    | "stop"
    | "length"
    | "content-filter"
    | "tool-calls"
    | "other"
    | "error"
    | "unknown";
}

// Define the options for our streaming function
interface StreamGeminiTextOptions {
  messages: Message[];
  systemPrompt: string;
  modelName?: string;
  temperature?: number;
  onFinishCallback?: (result: GeminiOnFinishResult) => Promise<void> | void;
}

/**
 * Streams text generation from a Google Gemini model using the Vercel AI SDK.
 *
 * @param options - Configuration options for the generation stream.
 * @returns A Promise resolving to the StreamTextResult object, ready for response creation.
 * @throws Re-throws errors encountered during the API call.
 */
export async function streamGeminiText({
  messages,
  systemPrompt,
  modelName = "models/gemini-1.5-flash",
  temperature,
  onFinishCallback,
}: StreamGeminiTextOptions): Promise<StreamTextResult<{}, unknown>> {
  console.log(`Initiating Gemini stream with model: ${modelName}`);

  try {
    const model = google(modelName, { safetySettings });

    const result = await streamText({
      model: model,
      messages: messages,
      system: systemPrompt,
      temperature: temperature,
      experimental_transform: smoothStream({ delayInMs: 50, chunking: "word" }),

      onFinish: onFinishCallback,
    });

    return result;
  } catch (error) {
    console.error(`Error during Gemini streamText call:`, error);

    throw error;
  }
}

// For future reference, when potentially using Gemini 2.5 Pro for analytics, and 2.0 Flash for real-time conversations
/*
let model;
if (someCondition) {
    model = google('models/gemini-2.5-pro', { safetySettings });
} else {
    model = google('models/gemini-2.0-flash', { safetySettings });
}
*/
