import { NextResponse } from "next/server";

const FINGPT_BASE_URL = process.env.FINGPT_BASE_URL || "http://localhost:8000";

export async function GET() {
  try {
    const response = await fetch(`${FINGPT_BASE_URL}/healthz`, {
      method: "GET",
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("FinGPT health check error:", error);
    return NextResponse.json(
      { error: "Failed to connect to FinGPT service", details: String(error) },
      { status: 503 }
    );
  }
}