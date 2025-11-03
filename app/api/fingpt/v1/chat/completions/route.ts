import { auth } from "@/app/(auth)/auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const FINGPT_BASE_URL = process.env.FINGPT_BASE_URL || "http://localhost:8000";

const fingptRequestSchema = z.object({
  ticker: z.string(),
  past_weeks: z.number().optional().default(4),
  include_financials: z.boolean().optional().default(true),
  temperature: z.number().optional().default(0.2),
  stream: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validatedData = fingptRequestSchema.parse(body);

    const fingptRequest = {
      ticker: validatedData.ticker.toUpperCase(),
      end_date: new Date().toISOString().split("T")[0],
      past_weeks: validatedData.past_weeks,
      include_financials: validatedData.include_financials,
      temperature: validatedData.temperature,
      stream: validatedData.stream,
    };

    console.log("Sending to FinGPT:", fingptRequest);

    const response = await fetch(`${FINGPT_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fingptRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("FinGPT service error:", errorText);
      return NextResponse.json(
        { error: "FinGPT service error", details: errorText },
        { status: response.status }
      );
    }

    if (validatedData.stream) {
      return new NextResponse(response.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("FinGPT chat error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}