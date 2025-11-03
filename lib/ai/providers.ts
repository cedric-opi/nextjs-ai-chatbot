import { createOpenAI, openai } from "@ai-sdk/openai";

const gatewayOpenAI = createOpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY!,
  baseURL: process.env.AI_GATEWAY_URL, // "https://ai-gateway.vercel.sh/api/openai"
});

export const myProvider = {
  languageModel(name: string) {
    const map: Record<string, ReturnType<typeof gatewayOpenAI>> = {
      "title-model": gatewayOpenAI("gpt-4o-mini"),
      "chat-model": gatewayOpenAI("gpt-4o"),
    };
    return map[name] ?? gatewayOpenAI(name as any);
  },
};

