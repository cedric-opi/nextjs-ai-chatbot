import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { imageUrl, prompt } = await req.json(); // This endpoint DOES use JSON

    if (!imageUrl) {
      return NextResponse.json(
        { error: "No image URL provided" },
        { status: 400 }
      );
    }

    // Analyze image with GPT-4 Vision
    const { text } = await generateText({
      model: openai("gpt-4o"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt || "Analyze this financial chart or document. Provide detailed insights.",
            },
            {
              type: "image",
              image: imageUrl,
            },
          ],
        },
      ],
    });

    return NextResponse.json({ analysis: text });
  } catch (error) {
    console.error("Image analysis error:", error);
    return NextResponse.json(
      { error: "Failed to analyze image" },
      { status: 500 }
    );
  }
}