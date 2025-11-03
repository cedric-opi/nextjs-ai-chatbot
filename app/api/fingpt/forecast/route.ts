import { NextRequest, NextResponse } from "next/server";

const FINGPT_BASE_URL = process.env.FINGPT_BASE_URL || "http://localhost:8000";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("📊 Forecast request received:", body);

    const {
      ticker,
      days_back = 28,
      include_financials = true,
    } = body;

    if (!ticker) {
      return NextResponse.json(
        { error: "Missing required field: ticker" },
        { status: 400 }
      );
    }

    const fingptRequest = {
      ticker: ticker.toUpperCase(),
      end_date: new Date().toISOString().split("T")[0],
      past_weeks: Math.floor(days_back / 7),
      include_financials,
      temperature: 0.2,
      stream: true, // Changed to false for simpler response
    };

    console.log("📤 Calling FinGPT service with:", fingptRequest);

    const response = await fetch(`${FINGPT_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fingptRequest),
    });

    console.log("📥 FinGPT response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ FinGPT error:", errorText);
      return NextResponse.json(
        { error: "FinGPT service error", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("✅ FinGPT response received");

    // Return simplified response
    return NextResponse.json({
      ticker: ticker.toUpperCase(),
      forecast: data.choices?.[0]?.message?.content || "",
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Forecast route error:", error);
    return NextResponse.json(
      { error: "Failed to generate forecast", details: String(error) },
      { status: 500 }
    );
  }
}