// frontend/app/basic-gemini-chat/page.tsx
"use client";

import React, { useState } from "react";

// Define a TypeScript interface for the shape of a chat message object
interface ChatMessage {
  text: string;
  sender: "user" | "bot";
}

function BasicGeminiChat() {
  const [inputMessage, setInputMessage] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: ChatMessage = { text: inputMessage, sender: "user" };
    setMessages((prevMessages) => [...prevMessages, userMessage]);

    setInputMessage("");
    setIsLoading(true);
    setError(null);

    try {
      const backendUrl = "http://localhost:8000/api/chat";

      const response = await fetch(backendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: userMessage.text }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.detail || `HTTP error! status: ${response.status}`
        );
      }

      const data: { response: string } = await response.json();
      const botMessage: ChatMessage = { text: data.response, sender: "bot" };
      setMessages((prevMessages) => [...prevMessages, botMessage]);
    } catch (err: any) {
      console.error("Error sending message:", err);
      setError(`Failed to get response: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      style={{
        maxWidth: "600px",
        margin: "auto",
        padding: "20px",
        // Make container borders visible against dark background
        border: "1px solid #777", // Use a slightly lighter gray border
        borderRadius: "8px",
        // Ensure content inside has a default text color if not overridden
        color: "#eee", // Light gray text for general elements
        backgroundColor: "#1a1a1a", // Optional: Give the chat container a slightly less black background
      }}
    >
      {/* Make the title visible */}
      <h1 style={{ color: "#eee" }}>Basic Gemini Chat</h1>

      {/* Chat Messages Display Area */}
      <div
        style={{
          height: "400px",
          overflowY: "scroll",
          // Make chat area borders visible
          border: "1px solid #777", // Use a slightly lighter gray border
          padding: "10px",
          marginBottom: "10px",
          display: "flex",
          flexDirection: "column",
          // Ensure background is not transparent allowing body background to show through
          backgroundColor: "#000", // Keep the chat area background black as per screenshot
        }}
      >
        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              marginBottom: "10px",
              alignSelf: msg.sender === "user" ? "flex-end" : "flex-start",
              // Background colors seem okay from screenshot, but ensure text color is visible
              backgroundColor: msg.sender === "user" ? "#dcf8c6" : "#f1f0f0", // Light backgrounds
              padding: "8px 12px",
              borderRadius: "10px",
              maxWidth: "70%",
              wordBreak: "break-word",
              // Explicitly set text color to be visible on the light backgrounds
              color: "#333", // Dark gray text for message bubbles
            }}
          >
            {/* Strong tag inside message bubble will inherit the color */}
            <strong>{msg.sender === "user" ? "You" : "Gemini"}:</strong>{" "}
            {msg.text}
          </div>
        ))}
        {/* Loading indicator */}
        {isLoading && (
          <div
            style={{
              alignSelf: "flex-start",
              fontStyle: "italic",
              color: "#aaa", // Make loading text visible
            }}
          >
            Gemini is typing...
          </div>
        )}
      </div>

      {/* Input Area */}
      <div style={{ display: "flex" }}>
        <textarea
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type your message..."
          rows={3}
          style={{
            flexGrow: 1,
            marginRight: "10px",
            padding: "8px",
            borderRadius: "4px",
            border: "1px solid #777", // Make border visible
            resize: "none",
            // Explicitly set text and background color for the textarea
            color: "#333", // Dark gray text for input
            backgroundColor: "white", // White background for input field
          }}
          disabled={isLoading}
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !inputMessage.trim()}
          style={{
            padding: "8px 15px",
            borderRadius: "4px",
            border: "none",
            backgroundColor: "#0070f3",
            color: "white", // Button text color should be white on blue background
            cursor: isLoading ? "not-allowed" : "pointer",
          }}
        >
          Send
        </button>
      </div>

      {/* Error Display */}
      {error && <div style={{ color: "red", marginTop: "10px" }}>{error}</div>}
    </div>
  );
}

export default BasicGeminiChat;
