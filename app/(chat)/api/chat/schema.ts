import { z } from "zod";

const textPartSchema = z.object({
  type: z.enum(["text"]),
  text: z.string().min(1).max(2000),
});

const filePartSchema = z.object({
  type: z.enum(["file"]),
  mediaType: z.enum(["image/jpeg", "image/png"]),
  name: z.string().min(1).max(100),
  url: z.string().url(),
});

const PartSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
})

const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(PartSchema).optional(),
  content: z.string().optional(),
})

export const postRequestBodySchema = z.object({
  id: z.string(),
  messages: z.array(MessageSchema),
  trigger: z.string().optional(),
  selectedChatModel: z.string().optional(),
  selectedVisibilityType: z.enum(["private", "public"]).optional(),
})

export type PostRequestBody = z.infer<typeof postRequestBodySchema>
  