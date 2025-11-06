import { createOpenAI, openai } from "@ai-sdk/openai";

const gatewayOpenAI = createOpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY!,
  baseURL: process.env.AI_GATEWAY_URL, // "https://ai-gateway.vercel.sh/api/openai"
});

export const myProvider = {
  languageModel(name: string) {
    const map = {
      "title-model": gatewayOpenAI("gpt-4o-mini"),
      "chat-model": gatewayOpenAI("gpt-4o"),
      "chat-model-reasoning": gatewayOpenAI("o1-preview"),
    };
    
    return map[name as keyof typeof map] ?? gatewayOpenAI(name as any);
  },
};