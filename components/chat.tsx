"use client";

import { useChat } from "@ai-sdk/react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { ChatHeader } from "@/components/chat-header";
import { useArtifactSelector } from "@/hooks/use-artifact";
import { useAutoResume } from "@/hooks/use-auto-resume";
import { useChatVisibility } from "@/hooks/use-chat-visibility";
import type { Vote } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import type { Attachment, ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { fetcher, generateUUID } from "@/lib/utils";
import { Artifact } from "./artifact";
import { useDataStream } from "./data-stream-provider";
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
  const { setDataStream } = useDataStream();

  const [input, setInput] = useState<string>("");
  const [usage, setUsage] = useState<AppUsage | undefined>(initialLastContext);
  const [currentModelId, setCurrentModelId] = useState(initialChatModel);
  const currentModelIdRef = useRef(currentModelId);
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(true);

  const popularTickers = ["AAPL", "TSLA", "GOOGL", "MSFT", "AMZN", "NVDA"];
  const suggestedQuestions = [
    "Compare AAPL vs MSFT",
    "What's the forecast for TSLA?",
    "Should I invest in tech stocks?",
    "Explain P/E ratio simply",
  ];

  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);

  const {
    messages,
    setMessages,
    sendMessage: originalSendMessage,
    status,
    stop,
    regenerate,
    resumeStream,
  } = useChat<ChatMessage>({
    id,
    api: "/api/chat",
    messages: initialMessages,
    experimental_throttle: 100,
    generateId: generateUUID,
    body: {
      selectedChatModel: currentModelIdRef.current,
      selectedVisibilityType: visibilityType,
    },
    onData: (dataPart) => {
      console.log('🔥 onData received:', dataPart);
      setDataStream((ds) => (ds ? [...ds, dataPart] : []));
      if (dataPart.type === "data-usage") {
        setUsage(dataPart.data);
      }
    },
    onResponse: async (response) => {
      console.log('🔥 onResponse status:', response.status);
      console.log('🔥 onResponse headers:', Object.fromEntries(response.headers.entries()));
      
      const clonedResponse = response.clone();
      const text = await clonedResponse.text();
      console.log('🔥 onResponse body:', text);
    },
    onFinish: (message) => {
      console.log('🔥 onFinish message:', message);
      mutate(unstable_serialize(getChatHistoryPaginationKey));
    },
    onError: (error) => {
      console.error('🔥 onError:', error);
      if (error instanceof ChatSDKError) {
        toast({
          type: "error",
          description: error.message,
        });
      } else {
        console.error("Chat error:", error);
        toast({
          type: "error",
          description: "An error occurred",
        });
      }
    },
  });

  // ✅ Custom send message function wrapped in useCallback
  const customSendMessage = useCallback(async (message: { role: "user"; parts: Array<{ type: string; text: string }> }) => {
    try {
      console.log('🚀 Sending message:', message);
      
      // Add user message to UI immediately
      const userMessage: ChatMessage = {
        id: generateUUID(),
        role: "user",
        content: message.parts[0].text,
        parts: message.parts,
      };
      
      setMessages((prev) => [...prev, userMessage]);

      // Make the API call
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          messages: [...messages, userMessage],
          selectedVisibilityType: visibilityType,
        }),
      });

      console.log('📡 Response received:', response.status);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('📦 Response data:', data);

      // ✅ Add assistant message to UI
      if (data.messages && data.messages.length > 0) {
        const assistantMessage = data.messages[0];
        setMessages((prev) => [...prev, {
          id: assistantMessage.id,
          role: assistantMessage.role,
          content: assistantMessage.content,
          parts: [{ type: "text", text: assistantMessage.content }],
        }]);
        console.log('✅ Assistant message added to UI');
      }

      mutate(unstable_serialize(getChatHistoryPaginationKey));
    } catch (error) {
      console.error('❌ Error sending message:', error);
      toast({
        type: "error",
        description: "Failed to send message",
      });
    }
  }, [id, messages, visibilityType, setMessages, mutate]);

  // ✅ Log messages changes
  useEffect(() => {
    console.log('🔥 MESSAGES STATE:', {
      count: messages.length,
      status,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content?.substring(0, 50) + '...'
      }))
    });
  }, [messages, status]);

  const searchParams = useSearchParams();
  const query = searchParams.get("query");
  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  // ✅ Updated to use customSendMessage
  useEffect(() => {
    if (query && !hasAppendedQuery) {
      customSendMessage({
        role: "user" as const,
        parts: [{ type: "text", text: query }],
      });
      setHasAppendedQuery(true);
      window.history.replaceState({}, "", `/chat/${id}`);
    }
  }, [query, hasAppendedQuery, id, customSendMessage]);

  useEffect(() => {
    if (messages.length > 0) {
      setShowWelcomeBanner(false);
    }
  }, [messages.length]);

  // ✅ Updated to use customSendMessage
  const quickSend = useCallback((text: string) => {
    setShowWelcomeBanner(false);
    customSendMessage({
      role: "user" as const,
      parts: [{ type: "text", text }],
    });
  }, [customSendMessage]);

  const { data: votes } = useSWR<Vote[]>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher
  );

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  useAutoResume({
    autoResume,
    initialMessages,
    resumeStream,
    setMessages,
  });

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
          <div className="rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-8 shadow-xl">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 shadow-lg">
                <span className="text-3xl">📈</span>
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                FinGPT Financial Assistant
              </h2>
              <p className="text-gray-600">
                Get expert stock analysis, forecasts, and insights
              </p>
            </div>

            <div className="mb-6">
              <p className="mb-3 text-sm font-semibold text-gray-700">
                📊 Popular Stocks:
              </p>
              <div className="flex flex-wrap gap-2">
                {popularTickers.map((ticker) => (
                  <button
                    key={ticker}
                    onClick={() => quickSend(`Analyze ${ticker}`)}
                    className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-blue-50 hover:text-blue-700 transition-all"
                  >
                    {ticker}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold text-gray-700">
                💡 Try asking:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {suggestedQuestions.map((question, idx) => (
                  <button
                    key={idx}
                    onClick={() => quickSend(question)}
                    className="rounded-lg bg-white p-3 text-left text-sm text-gray-700 shadow-sm hover:bg-blue-50 hover:shadow-md transition-all"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 text-center">
              <button
                onClick={() => setShowWelcomeBanner(false)}
                className="text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                Start chatting →
              </button> 
            </div>
          </div>
        </div>
      )}

      {/* Streaming indicator */}
      {status === "in_progress" && messages.length > 0 && (
        <div className="mx-auto w-full max-w-4xl px-2 md:px-4 mb-3">
          <div className="flex items-center gap-3 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
            <div className="flex gap-1">
              <div className="h-2 w-2 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.3s]"></div>
              <div className="h-2 w-2 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.15s]"></div>
              <div className="h-2 w-2 animate-bounce rounded-full bg-blue-500"></div>
            </div>
            <span className="text-sm font-medium text-blue-700">
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
        status={status}
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
            sendMessage={customSendMessage}
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
        sendMessage={customSendMessage}
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