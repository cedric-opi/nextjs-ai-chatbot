"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { ChatHeader } from "@/components/chat-header";
import { useArtifactSelector } from "@/hooks/use-artifact";
import { useChatVisibility } from "@/hooks/use-chat-visibility";
import type { Vote } from "@/lib/db/schema";
import type { Attachment, ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { fetcher, generateUUID } from "@/lib/utils";
import { Artifact } from "./artifact";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input";
import { getChatHistoryPaginationKey } from "./sidebar-history";
import { toast } from "./toast";
import type { VisibilityType } from "./visibility-selector";

export function Chat({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  autoResume,
  initialLastContext,
}: {
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  autoResume: boolean;
  initialLastContext?: AppUsage;
}) {
  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const { mutate } = useSWRConfig();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const messagesRef = useRef<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState<string>("");
  const [usage, setUsage] = useState<AppUsage | undefined>(initialLastContext);
  const [currentModelId, setCurrentModelId] = useState(initialChatModel);
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(true);
  const [status, setStatus] = useState<"ready" | "submitted">("ready");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const isProcessingRef = useRef(false);
  const [isLoadingResponse, setIsLoadingResponse] = useState(false);


  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const popularTickers = ["AAPL", "TSLA", "GOOGL", "MSFT", "AMZN", "NVDA"];
  const suggestedQuestions = [
    "Compare AAPL vs MSFT",
    "What's the forecast for TSLA?",
    "Should I invest in tech stocks?",
    "Explain P/E ratio simply",
  ];

  useEffect(() => {
    if (messages.length > 0) {
      setShowWelcomeBanner(false);
    }
  }, [messages.length]);

  const sendMessage = useCallback(
    async (message: { role: "user"; parts: any[] }) => {
      if (isProcessingRef.current) {
        console.log("⏸️ Already processing, skipping");
        return;
      }

      setInput("");
      setAttachments([]);

      isProcessingRef.current = true;
      console.log("🚀 Sending message with parts:", message.parts);

      const userMessageId = generateUUID();
      const userMessage: ChatMessage = {
        id: userMessageId,
        role: "user",
        parts: message.parts,
      };

      const updatedMessages = [...messagesRef.current, userMessage];
      setMessages(updatedMessages);
      setStatus("submitted");

      console.log("📤 Status set to submitted");

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            messages: updatedMessages,
            selectedVisibilityType: visibilityType,
            selectedChatModel: currentModelId,
          }),
        });

        console.log("📡 Response status:", response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error("API Error:", errorText);
          throw new Error("Failed to send message");
        }

        const data = await response.json();
        console.log("✅ Response data:", data);

        if (data.id && data.role === "assistant") {
          const assistantMessage: ChatMessage = {
            id: data.id,
            role: "assistant",
            parts: data.parts || [{ type: "text", text: data.content || "" }],
          };

          console.log("✅ Adding assistant message");
          setMessages((prev) => [...prev, assistantMessage]);
        }

        mutate(unstable_serialize(getChatHistoryPaginationKey));
      } catch (error) {
        console.error("❌ Send error:", error);
        toast({ type: "error", description: "Failed to send message" });
      } finally {
        console.log("✅ Resetting status to ready");
        isProcessingRef.current = false;
        setStatus("ready");
      }
    },
    [id, visibilityType, currentModelId, mutate]
  );

  const regenerate = useCallback(async () => {
    console.log("Regenerate not implemented");
  }, []);

  const stop = useCallback(async () => {
    console.log("Stop not implemented");
    isProcessingRef.current = false;
    setStatus("ready");
  }, []);

  const quickSend = useCallback(
    (text: string) => {
      setShowWelcomeBanner(false);
      sendMessage({
        role: "user",
        parts: [{ type: "text", text }],
      });
    },
    [sendMessage]
  );

  const { data: votes } = useSWR<Vote[]>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher
  );

  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  console.log("🔍 Current status:", status);

  return (
      <div className="overscroll-behavior-contain flex h-dvh min-w-0 touch-pan-y flex-col bg-background">
        <ChatHeader
          chatId={id}
          isReadonly={isReadonly}
          selectedVisibilityType={initialVisibilityType}
        />

        {/* Welcome Banner */}
        {showWelcomeBanner && messages.length === 0 && !isReadonly && (
          <div className="mx-auto w-full max-w-4xl px-2 md:px-4 py-6">
            <div className="rounded-2xl border-2 border-primary/20 bg-card p-8 shadow-xl">
              <div className="mb-6 text-center">
                <h2 className="text-3xl font-bold text-blue-600  mb-2">
                  StonkAI Financial Assistant
                </h2>
                <p className="text-muted-foreground">
                  Get expert stock analysis, forecasts, and insights
                </p>
              </div>

              <div className="mb-6">
                <p className="mb-3 text-sm font-semibold text-card-foreground">
                  📊 Popular Stocks:
                </p>
                <div className="flex flex-wrap gap-2">
                  {popularTickers.map((ticker) => (
                    <button
                      key={ticker}
                      onClick={() => quickSend(`Analyze ${ticker}`)}
                      className="rounded-lg bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground transition-all border border-border"
                    >
                      {ticker}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-3 text-sm font-semibold text-card-foreground">
                  💡 Try asking:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {suggestedQuestions.map((question, idx) => (
                    <button
                      key={idx}
                      onClick={() => quickSend(question)}
                      className="rounded-lg bg-background p-3 text-left text-sm text-foreground shadow-sm hover:bg-accent hover:shadow-md transition-all border border-border"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 text-center">
                <button
                  onClick={() => setShowWelcomeBanner(false)}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  Start chatting →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Streaming indicator */}
        {status === "submitted" && messages.length > 0 && (
          <div className="mx-auto w-full max-w-4xl px-2 md:px-4 mb-3">
            <div className="flex items-center gap-3 rounded-lg bg-accent/20 border border-accent/30 px-4 py-3">
              <div className="flex gap-1">
                <div className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]"></div>
                <div className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]"></div>
                <div className="h-2 w-2 animate-bounce rounded-full bg-primary"></div>
              </div>
              <span className="text-sm font-medium text-primary">
                📊 FinGPT is analyzing...
              </span>
            </div>
          </div>
        )}

        <Messages
          chatId={id}
          isArtifactVisible={isArtifactVisible}
          isReadonly={isReadonly}
          messages={messages}
          regenerate={regenerate}
          selectedModelId={initialChatModel}
          setMessages={setMessages}
          status={isLoadingResponse ? "submitted" : status}
          votes={votes}
        />

        <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-4xl gap-2 border-t-0 bg-background px-2 pb-3 md:px-4 md:pb-4">
          {!isReadonly && (
            <MultimodalInput
              attachments={attachments}
              chatId={id}
              input={input}
              messages={messages}
              onModelChange={setCurrentModelId}
              selectedModelId={currentModelId}
              selectedVisibilityType={visibilityType}
              sendMessage={sendMessage as any}
              setAttachments={setAttachments}
              setInput={setInput}
              setMessages={setMessages}
              status={status}
              stop={stop}
              usage={usage}
            />
          )}
        </div>

        <Artifact
          attachments={attachments}
          chatId={id}
          input={input}
          isReadonly={isReadonly}
          messages={messages}
          regenerate={regenerate}
          selectedModelId={currentModelId}
          selectedVisibilityType={visibilityType}
          sendMessage={sendMessage as any}
          setAttachments={setAttachments}
          setInput={setInput}
          setMessages={setMessages}
          status={status}
          stop={stop}
          votes={votes}
        />
      </div>
    );
  }