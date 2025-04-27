// lib/data/types.ts
import { ObjectId } from "mongodb";
import type { Message as VercelAiMessage } from "ai";

export interface User {
  _id: ObjectId;
  email: string | null | undefined;
  password?: string | null | undefined;
  name?: string | null | undefined;
}

export interface Project {
  _id: ObjectId;
  name: string;
  description?: string | null;
  github: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum Role {
  // Leadership
  OWNER = "owner",
  ADMIN = "admin",

  // Technical
  TECHNICAL = "technical",
  QUALITY_ASSURANCE = "quality_assurance",

  // Process
  SCRUM_MASTER = "scrum_master",
  PRODUCT_OWNER = "product_owner",

  // Development
  DEVELOPER = "developer",
  DESIGNER = "designer",
  DATA = "data",
  DEVOPS = "devops",
  RESEARCHER = "researcher",

  // Support
  SUPPORT = "support",

  // Other
  MEMBER = "member",
  GUEST = "guest",
}

export interface Membership {
  _id: ObjectId;
  projectId: ObjectId;
  userId: ObjectId;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  _id: ObjectId;
  projectId: ObjectId;
  userId: ObjectId;
  title?: string | null;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage extends VercelAiMessage {
  // id is required by Vercel AI SDK (string)
  // role is 'user' | 'assistant' | 'system' | 'function' | 'data' | 'tool'
  // content is string
  _id?: ObjectId; // Optional MongoDB ID (assigned on save)
  createdAt?: Date; // Optional timestamp
}

export interface SerializedChatMessage
  extends Omit<ChatMessage, "_id" | "createdAt"> {
  _id?: string; // ObjectId becomes string
  createdAt?: string; // Date becomes string (ISO format)
}

export interface SidebarConversationInfo {
  _id: string; // ObjectId becomes string
  title: string | null | undefined;
  createdAt: string; // Date becomes string (e.g., ISO string)
}

// TASKS

export enum TaskStatus {
  BACKLOG = "backlog",
  TODO = "todo",
  IN_PROGRESS = "inProgress",
  BLOCKED = "blocked",
  IN_REVIEW = "inReview",
  DONE = "done",
  CANCELED = "canceled",
}

export enum TaskPriority {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export enum TaskType {
  FEATURE = "feature",
  BUG = "bug",
  CHORE = "chore",
  RESEARCH = "research",
}

export interface Task {
  _id: ObjectId;
  projectId: ObjectId; // Indexed: Link to the Project
  creatorId: ObjectId; // Link to the User who created the task

  title: string; // Short, descriptive title
  description?: string | null; // Longer description, potentially supports Markdown
  status: TaskStatus; // Current status (enum) - Indexed
  priority: TaskPriority; // Task priority (enum)
  type: TaskType; // Type of task (enum)

  assigneeIds: ObjectId[]; // Array of User IDs assigned. Indexed. Empty if unassigned.
  reporterId?: ObjectId | null; // Optional: User who reported (e.g., for bugs)

  dueDate?: Date | null; // Optional deadline

  // --- Dependency Tracking (Crucial for Proactive AI) ---
  // List of Task IDs that this task directly blocks
  blocksTaskIds: ObjectId[];
  // List of Task IDs that directly block this task
  blockedByTaskIds: ObjectId[]; // Indexed: Important for finding newly unblocked tasks

  // --- Optional Fields ---
  parentTaskId?: ObjectId | null; // For sub-tasks relationship
  tags?: string[]; // For categorization/filtering

  // --- Timestamps ---
  createdAt: Date;
  updatedAt: Date; // Indexed: Essential for finding recent changes

  // --- Activity Log (Highly Recommended for AI & Audit) ---
  activityLog?: TaskActivityEvent[];
}

export interface TaskActivityEvent {
  _id: ObjectId; // Unique ID for the log entry itself
  timestamp: Date;
  userId: ObjectId; // User who performed the action
  type: string; // e.g., "statusChange", "assigneeChange", "comment", "priorityChange", "dueDateSet", "dependencyAdded", "dependencyRemoved"
  // Store relevant details about the change
  details: {
    field?: string; // e.g., "status", "assigneeIds", "blockedByTaskIds"
    oldValue?: any; // Use 'any' for flexibility, or more specific types if feasible
    newValue?: any;
    comment?: string; // For comment-type events
    taskId?: string; // For dependency events (the other task involved)
  };
}

export interface ProjectFile {
  _id: ObjectId;
  projectId: ObjectId; // Link to project
  taskId?: ObjectId | null; // **Link to the specific task (inferred by AI)**
  conversationId?: ObjectId;
  uploaderId: ObjectId; // Link to user who uploaded

  storageProvider: "gcs";
  storagePath: string; // The path/name within the GCS bucket
  publicUrl: string; // Public URL if available (eventually want to make public, so yes)
  filename: string; // Original filename
  contentType: string; // MIME type
  size: number; // File size in bytes

  createdAt: Date;
  updatedAt: Date;
}

/*
User submits file to agent
App sends file to GCS, creates MongoDB index pointing to file's location, along with metadata
Event listener is alerted of new MongoDB entry, which triggers a function to encode that entry's file based on its pointer

User prompts for relevant info from agent
App will RAG relevant information from Pinecone, who has attached the GCS file location through its metadata
Agent will use context to answer the prompt, and can cite the original file location in the glob for retrieval.

*/

import type {
  Content,
  FunctionCall,
  GenerationConfig,
  GenerativeContentBlob,
  Part,
  Tool,
} from "@google/generative-ai";
import { MultimodalLiveClient } from "../hooks/client";

export type LiveConfig = {
  model: string;
  systemInstruction?: { parts: Part[] };
  generationConfig?: Partial<LiveGenerationConfig>;
  tools?: Array<Tool | { googleSearch: {} } | { codeExecution: {} }>;
};

export type LiveGenerationConfig = GenerationConfig & {
  responseModalities: "text" | "audio" | "image";
  speechConfig?: {
    voiceConfig?: {
      prebuiltVoiceConfig?: {
        voiceName: "Puck" | "Charon" | "Kore" | "Fenrir" | "Aoede" | string;
      };
    };
  };
};

export type LiveOutgoingMessage =
  | SetupMessage
  | ClientContentMessage
  | RealtimeInputMessage
  | ToolResponseMessage;

export type SetupMessage = {
  setup: LiveConfig;
};

export type ClientContentMessage = {
  clientContent: {
    turns: Content[];
    turnComplete: boolean;
  };
};

export type RealtimeInputMessage = {
  realtimeInput: {
    mediaChunks: GenerativeContentBlob[];
  };
};

export type ToolResponseMessage = {
  toolResponse: {
    functionResponses: LiveFunctionResponse[];
  };
};

export type ToolResponse = ToolResponseMessage["toolResponse"];

export type LiveFunctionResponse = {
  response: object;
  id: string;
};

export type LiveIncomingMessage =
  | ToolCallCancellationMessage
  | ToolCallMessage
  | ServerContentMessage
  | SetupCompleteMessage;

export type SetupCompleteMessage = { setupComplete: {} };

export type ServerContentMessage = {
  serverContent: ServerContent;
};

export type ServerContent = ModelTurn | TurnComplete | Interrupted;

export type ModelTurn = {
  modelTurn: {
    parts: Part[];
  };
};

export type TurnComplete = { turnComplete: boolean };

export type Interrupted = { interrupted: true };

export type ToolCallCancellationMessage = {
  toolCallCancellation: {
    ids: string[];
  };
};

export type ToolCallCancellation =
  ToolCallCancellationMessage["toolCallCancellation"];

export type ToolCallMessage = {
  toolCall: ToolCall;
};

export type LiveFunctionCall = FunctionCall & {
  id: string;
};

/**
 * A `toolCall` message
 */
export type ToolCall = {
  functionCalls: LiveFunctionCall[];
};

/** log types */
export type StreamingLog = {
  date: Date;
  type: string;
  count?: number;
  message: string | LiveOutgoingMessage | LiveIncomingMessage;
};

// Type-Guards

const prop = (a: any, prop: string, kind: string = "object") =>
  typeof a === "object" && typeof a[prop] === "object";

// outgoing messages
export const isSetupMessage = (a: unknown): a is SetupMessage =>
  prop(a, "setup");

export const isClientContentMessage = (a: unknown): a is ClientContentMessage =>
  prop(a, "clientContent");

export const isRealtimeInputMessage = (a: unknown): a is RealtimeInputMessage =>
  prop(a, "realtimeInput");

export const isToolResponseMessage = (a: unknown): a is ToolResponseMessage =>
  prop(a, "toolResponse");

// incoming messages
export const isSetupCompleteMessage = (a: unknown): a is SetupCompleteMessage =>
  prop(a, "setupComplete");

export const isServerContentMessage = (a: any): a is ServerContentMessage =>
  prop(a, "serverContent");

export const isToolCallMessage = (a: any): a is ToolCallMessage =>
  prop(a, "toolCall");

export const isToolCallCancellationMessage = (
  a: unknown
): a is ToolCallCancellationMessage =>
  prop(a, "toolCallCancellation") &&
  isToolCallCancellation((a as any).toolCallCancellation);

export const isModelTurn = (a: any): a is ModelTurn =>
  typeof (a as ModelTurn).modelTurn === "object";

export const isTurnComplete = (a: any): a is TurnComplete =>
  typeof (a as TurnComplete).turnComplete === "boolean";

export const isInterrupted = (a: any): a is Interrupted =>
  (a as Interrupted).interrupted;

export function isToolCall(value: unknown): value is ToolCall {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;

  return (
    Array.isArray(candidate.functionCalls) &&
    candidate.functionCalls.every((call) => isLiveFunctionCall(call))
  );
}

export function isToolResponse(value: unknown): value is ToolResponse {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;

  return (
    Array.isArray(candidate.functionResponses) &&
    candidate.functionResponses.every((resp) => isLiveFunctionResponse(resp))
  );
}

export function isLiveFunctionCall(value: unknown): value is LiveFunctionCall {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.name === "string" &&
    typeof candidate.id === "string" &&
    typeof candidate.args === "object" &&
    candidate.args !== null
  );
}

export function isLiveFunctionResponse(
  value: unknown
): value is LiveFunctionResponse {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.response === "object" && typeof candidate.id === "string"
  );
}

export const isToolCallCancellation = (
  a: unknown
): a is ToolCallCancellationMessage["toolCallCancellation"] =>
  typeof a === "object" && Array.isArray((a as any).ids);

export type UseLiveAPIResults = {
  client: MultimodalLiveClient;
  setConfig: (config: LiveConfig) => void;
  config: LiveConfig;
  connected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  volume: number;
};
