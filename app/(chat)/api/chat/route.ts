import { auth, type UserType } from "@/app/(auth)/auth"
import { entitlementsByUserType } from "@/lib/ai/entitlements"
import { deleteChatById, getChatById, getMessageCountByUserId, saveChat, saveMessages } from "@/lib/db/queries"
import { ChatSDKError } from "@/lib/errors"
import { generateUUID } from "@/lib/utils"
import { type PostRequestBody, postRequestBodySchema } from "./schema"

export const maxDuration = 60

// ✅ Deduplication cache
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

  // ✅ Deduplicate requests
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

    const extractTickerFromMessage = (text: string): string | null => {
      const tickerMatch = text.match(/([A-Z]{1,5})\b/)
      return tickerMatch ? tickerMatch[1] : null
    }

    const ticker = extractTickerFromMessage(userMessageText)

    if (!ticker) {
      console.error("❌ Could not extract ticker from message:", userMessageText)
      const errorEvent = `data: ${JSON.stringify({
        type: "error",
        error: "Please specify a ticker symbol (e.g., 'Analysis AAPL')",
      })}\n\n`

      return new Response(errorEvent, {
        status: 400,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
        },
      })
    }

    console.log("💰 Routing to FinGPT backend for ticker:", ticker)

    const FASTAPI_URL = process.env.FASTAPI_BACKEND_URL || "http://localhost:8000"

    try {
      console.log("📡 Calling FastAPI:", `${FASTAPI_URL}/v1/chat/completions`)

      const fastAPIResponse = await fetch(`${FASTAPI_URL}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticker: ticker.toUpperCase(),
          past_weeks: 4,
          include_financials: true,
          temperature: 0.3,
          stream: true,
        }),
      })

      if (!fastAPIResponse.ok) {
        const errorText = await fastAPIResponse.text()
        console.error("FastAPI error response:", errorText)
        throw new Error(`FastAPI returned ${fastAPIResponse.status}: ${errorText}`)
      }

      console.log("✅ FastAPI streaming started")

      const assistantMessageId = generateUUID()
      let fullText = ""
      const encoder = new TextEncoder()
      const decoder = new TextDecoder()

      const transformStream = new TransformStream({
        async transform(chunk, controller) {
          const text = decoder.decode(chunk, { stream: true })
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
                const sseEvent = `data: ${JSON.stringify({
                  type: "text-delta",
                  delta: { type: "text", text: content },
                })}\n\n`
                controller.enqueue(encoder.encode(sseEvent))
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        },

        async flush(controller) {
          console.log("✅ Stream complete, saving message...")

          if (fullText) {
            const finishEvent = `data: ${JSON.stringify({
              type: "finish",
              delta: { type: "finish", finishReason: "stop" },
            })}\n\n`
            controller.enqueue(encoder.encode(finishEvent))

            await new Promise((resolve) => setTimeout(resolve, 100))

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
            console.log("✅ Message saved, length:", fullText.length)
          }
        },
      })

      const stream = fastAPIResponse.body!.pipeThrough(transformStream)

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Content-Type-Options": "nosniff",
          "Transfer-Encoding": "chunked",
        },
      })
    } catch (error) {
      console.error("❌ Error:", error)

      // Return error as SSE event
      const errorEvent = `data: ${JSON.stringify({
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      })}\n\n`

      return new Response(errorEvent, {
        status: 500,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
        },
      })
    }
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
