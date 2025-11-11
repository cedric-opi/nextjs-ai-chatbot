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

    // ✅ Handle both content (from useChat) and parts (from database) formats
    const userMessageText = userMessage.content || 
      userMessage.parts?.filter(p => p.type === "text").map(p => p.text).join("\n") || 
      "";

    const imageAttachments = userMessage.parts
      ?.filter(part => part.type === "file" && part.mediaType?.startsWith("image/"))
      ?.map(part => ({ url: part.url, name: part.name })) || [];

    console.log("📝 Message text:", userMessageText);
    console.log("🖼️  Image attachments:", imageAttachments.length);
    console.log("🔍 Image details:", imageAttachments);

    // ✅ Convert to parts format for database
    const messageParts = [
      { type: "text" as const, text: userMessageText },
      ...(userMessage.parts?.filter(p => p.type === "file") || [])
    ];

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

    // ✅ Simple ticker extraction (just for hints, not requirements)
    const extractTickerFromMessage = (text: string): string | null => {
      const tickerPattern = /\b([A-Z]{2,5})\b/g;
      const matches = Array.from(text.matchAll(tickerPattern));
      
      const commonWords = ['I', 'A', 'AI', 'IT', 'US', 'VS', 'OR', 'AND', 'THE', 'FOR', 'BUT', 'NOT', 'CAN', 'HAS', 'WAS'];
      
      for (const match of matches) {
        const word = match[1];
        if (!commonWords.includes(word)) {
          return word;
        }
      }
      return null;
    };

    // ✅ Try to extract ticker (optional, just for context)
    let ticker = extractTickerFromMessage(userMessageText);
    let conversationContext = "";

    // Build conversation context from history
    if (messages.length > 1) {
      conversationContext = messages
        .slice(Math.max(0, messages.length - 6))
        .filter(m => m.role === "user") // Only user messages for context
        .map(m => m.content || m.parts?.[0]?.text || "")
        .join("\n");
      
      // If no ticker in current message, try to find from history
      if (!ticker) {
        for (let i = messages.length - 2; i >= Math.max(0, messages.length - 6); i--) {
          const prevMessage = messages[i];
          if (prevMessage.role === "user") {
            const prevText = prevMessage.content || prevMessage.parts?.[0]?.text || "";
            const prevTicker = extractTickerFromMessage(prevText);
            if (prevTicker) {
              ticker = prevTicker;
              console.log(`✅ Found context ticker "${ticker}" from history`);
              break;
            }
          }
        }
      }
    }

    console.log("💬 Processing message:", userMessageText);
    console.log("💡 Hint ticker:", ticker || "none");
    console.log("📝 Conversation context:", conversationContext ? "Yes" : "No");

    // ✅ ALWAYS send to FastAPI - let IT handle the question
    const FASTAPI_URL = process.env.FASTAPI_BACKEND_URL || "http://localhost:8000"
    const assistantMessageId = generateUUID()

    // ✅ Build enhanced system prompt with context
    const systemPrompt = conversationContext 
      ? `You are an expert Wall Street analyst known for actionable, specific insights.

    Previous conversation:
    ${conversationContext}

    CRITICAL RULES:
    - Give DIRECT, SPECIFIC answers - no generic textbook content
    - Use NATURAL numbering (1, 2, 3...) - NEVER restart numbering mid-response
    - NO placeholders like "[Recent development with date]" - use REAL examples or skip the section
    - Keep it CONVERSATIONAL and EXCITING - you're talking to a real person, not writing a textbook
    - When you don't have specific data, say "Based on general market trends..." instead of making up placeholders

    Current question: ${userMessageText}

    Answer naturally and specifically. Be the analyst they'd want to grab coffee with.`
      : `You are a sharp Wall Street analyst who gives specific, actionable insights.

    CRITICAL RULES:
    - DIRECT answers - no lengthy preambles or disclaimers
    - Use CONSISTENT numbering (1, 2, 3...) throughout your entire response
    - NO placeholders - if you don't have specific data, speak generally but naturally
    - Be CONVERSATIONAL and ENGAGING - like you're explaining to a friend over coffee
    - Focus on WHAT MATTERS - skip the textbook definitions unless specifically asked

    Question: ${userMessageText}

    Give a crisp, insightful answer that gets to the point.`;

    // ✅ Smart request body with improved parameters
    const fastAPIBody = {
      message: userMessageText,
      ticker: ticker || "",
      conversation_context: conversationContext,
      system_prompt: systemPrompt, 
      instructions: "Be specific and conversational. Use consistent numbering (1,2,3). No placeholders or generic advice. Get to the point.", 
      past_weeks: 4,
      include_financials: ticker ? true : false,
      temperature: 0.8,    // For varied responses    
      max_new_tokens: 1024,    
      stream: true,
      ...(imageAttachments.length > 0 && { image_urls: imageAttachments.map(img => img.url) }),
    };

    console.log("📤 Request body:", { 
      ticker: fastAPIBody.ticker, 
      temperature: fastAPIBody.temperature,
      max_tokens: fastAPIBody.max_new_tokens,
      has_context: !!conversationContext, 
      has_images: imageAttachments.length > 0
    });

    console.log("📡 Calling FastAPI:", `${FASTAPI_URL}/v1/chat/completions`);

    const fastAPIResponse = await fetch(`${FASTAPI_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fastAPIBody),
    });

    if (!fastAPIResponse.ok) {
      const errorText = await fastAPIResponse.text();
      console.error("FastAPI error response:", errorText);
      
      // ✅ Friendly error handling
      const errorAssistantId = generateUUID();
      const errorMessage = `I encountered an issue processing your question. Please try rephrasing or ask about a specific stock ticker.`;

      await saveMessages({
        messages: [
          {
            id: errorAssistantId,
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
            id: errorAssistantId,
            role: "assistant",
            content: errorMessage,
          }
        ]
      });
    }

    // ✅ Stream the response
    console.log("✅ FastAPI response received, collecting...");

    const reader = fastAPIResponse.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.trim() || !line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) fullText += content;
        } catch (e) {}
      }
    }

    console.log("✅ Complete, length:", fullText.length);

    await saveMessages({
      messages: [{
        id: assistantMessageId,
        role: "assistant",
        parts: [{ text: fullText, type: "text" }],
        createdAt: new Date(),
        attachments: [],
        chatId: id,
      }],
    });

    return Response.json({
      id: assistantMessageId,
      role: "assistant",
      parts: [{ type: "text", text: fullText }],
      content: fullText,
    });

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