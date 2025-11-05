import { auth, type UserType } from "@/app/(auth)/auth"
import { entitlementsByUserType } from "@/lib/ai/entitlements"
import { deleteChatById, getChatById, getMessageCountByUserId, saveChat, saveMessages } from "@/lib/db/queries"
import { ChatSDKError } from "@/lib/errors"
import { generateUUID } from "@/lib/utils"
import { type PostRequestBody, postRequestBodySchema } from "./schema"

export const maxDuration = 60

const activeRequests = new Map<string, Promise<Response>>()

export async function POST(request: Request) {
  let requestBody: PostRequestBody

  try {
    const json = await request.json()
    requestBody = postRequestBodySchema.parse(json)
  } catch (_) {
    return new ChatSDKError("bad_request:api").toResponse()
  }

  const { id, messages } = requestBody

  // Deduplicate requests
  const dedupeKey = `${id}-${messages[messages.length - 1].id}`

  if (activeRequests.has(dedupeKey)) {
    console.log("⏭️  Skipping duplicate request for:", dedupeKey)
    return activeRequests.get(dedupeKey)!
  }

  const responsePromise = handleChatRequest(requestBody)

  activeRequests.set(dedupeKey, responsePromise)

  responsePromise.finally(() => {
    activeRequests.delete(dedupeKey)
  })

  return responsePromise
}

async function handleChatRequest(requestBody: PostRequestBody) {
  try {
    const { id, messages, selectedVisibilityType } = requestBody

    const userMessage = messages[messages.length - 1]

    if (!userMessage || userMessage.role !== "user") {
      return new ChatSDKError("bad_request:api").toResponse()
    }

    const message = {
      id: userMessage.id,
      role: "user" as const,
      parts: userMessage.parts || [{ type: "text", text: userMessage.content || "" }],
    }

    const session = await auth()

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse()
    }

    const userType: UserType = session.user.type

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    })

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError("rate_limit:chat").toResponse()
    }

    // Get or create chat
    const chat = await getChatById({ id })

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError("forbidden:chat").toResponse()
      }
    } else {
      const userMessageText = message.parts?.[0]?.text || ""

      const title =
        userMessageText.substring(0, 50).trim() + (userMessageText.length > 50 ? "..." : "") || "Financial Chat"

      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType || "private",
      })
    }

    // Save user message
    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: "user",
          parts: message.parts,
          attachments: [],
          createdAt: new Date(),
        },
      ],
    })

    const userMessageText = message.parts?.[0]?.text || ""

    // ✅ Improved ticker extraction - only match valid stock tickers
    const extractTickerFromMessage = (text: string): string | null => {
      // Match common patterns like "AAPL", "analyze TSLA", "what about MSFT"
      // But exclude single letters like "I", "A" unless they're clearly tickers
      const patterns = [
        /\b([A-Z]{2,5})\b/g, // 2-5 uppercase letters (avoids single letters like "I")
        /(?:ticker|stock|analyze|analysis|about|for)\s+([A-Z]{1,5})\b/gi, // Ticker after keywords
      ];

      for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches) {
          // Filter out common words
          const commonWords = ['I', 'A', 'IT', 'US', 'TO', 'IN', 'ON', 'AT', 'BY', 'OR', 'AN', 'AS', 'BE', 'DO', 'GO', 'HE', 'IF', 'IS', 'ME', 'MY', 'NO', 'OF', 'OK', 'SO', 'UP', 'WE'];
          const ticker = matches[matches.length - 1].toUpperCase();
          if (!commonWords.includes(ticker)) {
            return ticker;
          }
        }
      }
      return null;
    };

    // ✅ Check if there's a ticker in the current message OR conversation history
    let ticker = extractTickerFromMessage(userMessageText);
    let conversationContext = "";

    // If no ticker found in current message, check previous messages for context
    if (!ticker && messages.length > 1) {
      console.log("🔍 No ticker in current message, checking conversation history...");
      
      // Look back through the last 5 messages to find a ticker
      for (let i = messages.length - 2; i >= Math.max(0, messages.length - 6); i--) {
        const prevMessage = messages[i];
        const prevText = prevMessage.content || prevMessage.parts?.[0]?.text || "";
        const prevTicker = extractTickerFromMessage(prevText);
        
        if (prevTicker) {
          ticker = prevTicker;
          console.log(`✅ Found ticker "${ticker}" from previous message`);
          break;
        }
      }

      // Build conversation context for the AI
      conversationContext = messages
        .slice(Math.max(0, messages.length - 6)) // Last 5 messages + current
        .map(m => `${m.role}: ${m.content || m.parts?.[0]?.text || ""}`)
        .join("\n");
    }

    // ✅ If still no ticker, check if it's a general financial question
    const isGeneralFinancialQuestion = /\b(invest|stock|market|portfolio|trading|finance|dividend|earnings|P\/E|ratio|forecast|analysis|bull|bear|recession|economy)\b/i.test(userMessageText);

    if (!ticker && !isGeneralFinancialQuestion) {
      console.log("❌ No ticker found and not a financial question");
      
      const assistantMessageId = generateUUID();
      const fallbackResponse = "I'm a financial assistant specialized in stock analysis. Please specify a stock ticker (e.g., 'Analyze AAPL') or ask a question about a specific company.";

      await saveMessages({
        messages: [
          {
            id: assistantMessageId,
            role: "assistant",
            parts: [{ text: fallbackResponse, type: "text" }],
            createdAt: new Date(),
            attachments: [],
            chatId: id,
          },
        ],
      });

      return Response.json({
        messages: [
          {
            id: assistantMessageId,
            role: "assistant",
            content: fallbackResponse,
          }
        ]
      });
    }

    console.log("💰 Routing to FinGPT backend for ticker:", ticker || "general financial query");

    const FASTAPI_URL = process.env.FASTAPI_BACKEND_URL || "http://localhost:8000"
    const assistantMessageId = generateUUID()

    console.log("📡 Calling FastAPI:", `${FASTAPI_URL}/v1/chat/completions`)

    // ✅ Send conversation context to FastAPI
    const fastAPIBody = ticker ? {
    ticker: ticker.toUpperCase(),
    query: userMessageText, // Send the actual question
    conversation_context: conversationContext, // Send previous messages for context
    past_weeks: 4,
    include_financials: true,
    temperature: 0.3,
    stream: true,
  } : {
    query: userMessageText,
    conversation_context: conversationContext,
    temperature: 0.5,
    stream: true,
  };

  const fastAPIResponse = await fetch(`${FASTAPI_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(fastAPIBody), 
  })

    if (!fastAPIResponse.ok) {
      const errorText = await fastAPIResponse.text()
      console.error("FastAPI error response:", errorText)
      
      // ✅ Better error handling
      const assistantMessageId = generateUUID();
      const errorMessage = `I encountered an issue: ${errorText}. Please try asking about a different stock or rephrase your question.`;

      await saveMessages({
        messages: [
          {
            id: assistantMessageId,
            role: "assistant",
            parts: [{ text: errorMessage, type: "text" }],
            createdAt: new Date(),
            attachments: [],
            chatId: id,
          },
        ],
      });

      return Response.json({
        messages: [
          {
            id: assistantMessageId,
            role: "assistant",
            content: errorMessage,
          }
        ]
      });
    }

    console.log("✅ FastAPI response received")

    // Collect all the text
    const reader = fastAPIResponse.body!.getReader()
    const decoder = new TextDecoder()
    let fullText = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value, { stream: true })
      const lines = text.split("\n")

      for (const line of lines) {
        if (!line.trim() || !line.startsWith("data: ")) continue

        const data = line.slice(6).trim()
        if (data === "[DONE]") continue

        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content

          if (content) {
            fullText += content
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }

    console.log("✅ Complete text received, length:", fullText.length)

    console.log("✅ Complete text received, length:", fullText.length)
    console.log("📝 First 100 chars:", fullText.substring(0, 100))
    console.log("📝 Last 100 chars:", fullText.substring(fullText.length - 100))

    // Save to database
    await saveMessages({
      messages: [
        {
          id: assistantMessageId,
          role: "assistant",
          parts: [{ text: fullText, type: "text" }],
          createdAt: new Date(),
          attachments: [],
          chatId: id,
        },
      ],
    })

    console.log("✅ Message saved to database")

    // ✅ Store in a const to ensure it's not modified
    const responseContent = fullText;
    const responsePayload = {
      messages: [
        {
          id: assistantMessageId,
          role: "assistant",
          content: responseContent,
        }
      ]
    };

    console.log("📤 Sending response with length:", responseContent.length);
    console.log("📤 Response payload:", JSON.stringify(responsePayload).substring(0, 200));

    return Response.json(responsePayload)

  } catch (error) {
    console.error("Unhandled error in chat API:", error)
    return new ChatSDKError("offline:chat").toResponse()
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")

  if (!id) {
    return new ChatSDKError("bad_request:api").toResponse()
  }

  const session = await auth()

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse()
  }

  const chat = await getChatById({ id })

  if (chat?.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse()
  }

  const deletedChat = await deleteChatById({ id })

  return Response.json(deletedChat, { status: 200 })
}