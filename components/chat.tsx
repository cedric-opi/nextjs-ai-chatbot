"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { ChatHeader } from "@/components/chat-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useArtifactSelector } from "@/hooks/use-artifact";
import { useAutoResume } from "@/hooks/use-auto-resume";
import { useChatVisibility } from "@/hooks/use-chat-visibility";
import type { Vote } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import type { Attachment, ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { fetcher, fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { Artifact } from "./artifact";
import { useDataStream } from "./data-stream-provider";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input";
import { getChatHistoryPaginationKey } from "./sidebar-history";
import { toast } from "./toast";
import type { VisibilityType } from "./visibility-selector";
import { extractStockTicker } from "@/lib/fingpt-clients";

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
  const [showCreditCardAlert, setShowCreditCardAlert] = useState(false);
  const [currentModelId, setCurrentModelId] = useState(initialChatModel);
  const currentModelIdRef = useRef(currentModelId);

  // FinGPT State - Shows banner immediately
  const [showPredictionBanner, setShowPredictionBanner] = useState(true);
  const [selectedTicker, setSelectedTicker] = useState<string>("");
  const [loadingForecast, setLoadingForecast] = useState(false);

  // Popular tickers for quick selection
  const popularTickers = ["AAPL", "TSLA", "GOOGL", "MSFT", "AMZN", "NVDA"];

  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    resumeStream,
  } = useChat<ChatMessage>({
    id,
    messages: initialMessages,
    experimental_throttle: 100,
    generateId: generateUUID,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      fetch: fetchWithErrorHandlers,
      prepareSendMessagesRequest(request) {
        return {
          body: {
            id: request.id,
            message: request.messages.at(-1),
            selectedChatModel: currentModelIdRef.current,
            selectedVisibilityType: visibilityType,
            ...request.body,
          },
        };
      },
    }),
    onData: (dataPart) => {
      setDataStream((ds) => (ds ? [...ds, dataPart] : []));
      if (dataPart.type === "data-usage") {
        setUsage(dataPart.data);
      }
    },
    onFinish: () => {
      mutate(unstable_serialize(getChatHistoryPaginationKey));
    },
    onError: (error) => {
      if (error instanceof ChatSDKError) {
        if (
          error.message?.includes("AI Gateway requires a valid credit card")
        ) {
          setShowCreditCardAlert(true);
        } else {
          toast({
            type: "error",
            description: error.message,
          });
        }
      }
    },
  });

  const searchParams = useSearchParams();
  const query = searchParams.get("query");

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      sendMessage({
        role: "user" as const,
        parts: [{ type: "text", text: query }],
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, "", `/chat/${id}`);
    }
  }, [query, sendMessage, hasAppendedQuery, id]);

  // Hide prediction banner after user starts chatting
  useEffect(() => {
    if (messages.length > 0) {
      setShowPredictionBanner(false);
    }
  }, [messages.length]);

  // Fetch Financial Forecast with detailed logging
  const fetchFinancialForecast = async (ticker: string) => {
    console.log("🔍 Starting forecast fetch for:", ticker);
    
    setLoadingForecast(true);
    setShowPredictionBanner(false);

    const messageId = generateUUID();

    // Add placeholder message
    const placeholderMessage: ChatMessage = {
      id: messageId,
      role: "assistant",
      parts: [
        {
          type: "text",
          text: `📊 Analyzing ${ticker}...\n\nFetching market data and generating forecast...`,
        },
      ],
    };
    setMessages((prev) => [...prev, placeholderMessage]);

    try {
      console.log("📡 Calling /api/fingpt/v1/chat/completions with streaming");
      
      const requestBody = {
        ticker: ticker.toUpperCase(),
        end_date: new Date().toISOString().split("T")[0],
        past_weeks: 4,
        include_financials: true,
        temperature: 0.2,
        stream: false, // Stream for real-time updates
      };
      
      console.log("📤 Request body:", requestBody);

      const response = await fetch("/api/fingpt/v1/chat/completions", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      console.log("📥 Response status:", response.status);
      console.log("📥 Response headers:", Object.fromEntries(response.headers));

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Error response:", errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Stream the response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let fullText = `📊 **Financial Analysis for ${ticker}**\n\n`;
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log("✅ Stream complete, chunks received:", chunkCount);
          break;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                chunkCount++;
                fullText += content;

                // Update message in real-time
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === messageId
                      ? {
                          ...msg,
                          parts: [{ type: "text", text: fullText }],
                        }
                      : msg
                  )
                );
              }
            } catch (e) {
              console.warn("⚠️  Failed to parse SSE data");
            }
          }
        }
      }

      console.log("✅ Forecast completed successfully");
      toast({
        type: "success",
        description: `Financial analysis for ${ticker} completed`,
      });
    } catch (error) {
      console.error("❌ Forecast error:", error);

      // Remove placeholder message
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));

      // Add error message
      setMessages((prev) => [
        ...prev,
        {
          id: generateUUID(),
          role: "assistant",
          parts: [
            {
              type: "text",
              text: `❌ **Error fetching analysis for ${ticker}**\n\n${
                error instanceof Error ? error.message : String(error)
              }\n\n**Troubleshooting:**\n1. Check FinGPT service: http://localhost:8000/healthz\n2. Check API route exists: /api/fingpt/[...path]/route.ts\n3. Check console for errors`,
            },
          ],
          createdAt: new Date(),
        },
      ]);

      toast({
        type: "error",
        description: error instanceof Error ? error.message : "Failed to fetch forecast",
      });
    } finally {
      setLoadingForecast(false);
    }
  };

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
    <>
      <div className="overscroll-behavior-contain flex h-dvh min-w-0 touch-pan-y flex-col bg-background">
        <ChatHeader
          chatId={id}
          isReadonly={isReadonly}
          selectedVisibilityType={initialVisibilityType}
        />

        {/* Prediction Banner - Shows Immediately */}
        {showPredictionBanner && messages.length === 0 && !isReadonly && (
          <div className="mx-auto w-full max-w-4xl px-2 md:px-4 py-4">
            <div className="rounded-xl border-2 border-blue-300 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6 shadow-lg">
              <div className="mb-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 shadow-md">
                    <span className="text-2xl">📈</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      Stock Market Prediction
                    </h3>
                    <p className="text-sm text-gray-600">
                      Get AI-powered financial analysis powered by FinGPT
                    </p>
                  </div>
                </div>
              </div>

              {/* Ticker Input */}
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={selectedTicker}
                    onChange={(e) => setSelectedTicker(e.target.value.toUpperCase())}
                    placeholder="Enter ticker (e.g., AAPL)"
                    className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    maxLength={5}
                    disabled={loadingForecast}
                    onKeyPress={(e) => {
                      if (e.key === "Enter" && selectedTicker.trim()) {
                        fetchFinancialForecast(selectedTicker);
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (selectedTicker.trim()) {
                        fetchFinancialForecast(selectedTicker);
                      } else {
                        toast({
                          type: "error",
                          description: "Please enter a stock ticker",
                        });
                      }
                    }}
                    disabled={loadingForecast || !selectedTicker.trim()}
                    className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {loadingForecast ? "Analyzing..." : "Analyze"}
                  </button>
                </div>

                {/* Popular Tickers */}
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-600">
                    Popular stocks:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {popularTickers.map((ticker) => (
                      <button
                        key={ticker}
                        onClick={() => fetchFinancialForecast(ticker)}
                        disabled={loadingForecast}
                        className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {ticker}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Dismiss Button */}
              <button
                onClick={() => setShowPredictionBanner(false)}
                className="mt-4 text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                Or continue with regular chat →
              </button>
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
              sendMessage={sendMessage}
              setAttachments={setAttachments}
              setInput={setInput}
              setMessages={setMessages}
              status={status}
              stop={stop}
              usage={usage}
            />
          )}
        </div>
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
        sendMessage={sendMessage}
        setAttachments={setAttachments}
        setInput={setInput}
        setMessages={setMessages}
        status={status}
        stop={stop}
        votes={votes}
      />

      <AlertDialog
        onOpenChange={setShowCreditCardAlert}
        open={showCreditCardAlert}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate AI Gateway</AlertDialogTitle>
            <AlertDialogDescription>
              This application requires{" "}
              {process.env.NODE_ENV === "production" ? "the owner" : "you"} to
              activate Vercel AI Gateway.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                window.open(
                  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card",
                  "_blank"
                );
                window.location.href = "/";
              }}
            >
              Activate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}