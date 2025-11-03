// FinGPT Client for Frontend
// Use this to interact with your FinGPT service

export interface ForecastRequest {
  ticker: string;
  end_date?: string; // YYYY-MM-DD format
  past_weeks?: number; // Default: 4
  include_financials?: boolean; // Default: true
  temperature?: number; // 0.0 - 2.0, default: 0.2
  stream?: boolean; // Default: false
}

export interface ForecastResponse {
  id: string;
  object: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
}

export interface SimpleForecastResponse {
  ticker: string;
  forecast: string;
  generated_at: string;
}

export class FinGPTClient {
  private baseUrl: string;

  constructor(baseUrl: string = "/api/fingpt") {
    this.baseUrl = baseUrl;
  }

  /**
   * Get stock forecast (non-streaming)
   */
  async getForecast(request: ForecastRequest): Promise<ForecastResponse> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...request,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to get forecast");
    }

    return response.json();
  }

  /**
   * Get stock forecast (streaming)
   */
  async *getForecastStream(
    request: ForecastRequest
  ): AsyncGenerator<string, void, unknown> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...request,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to get forecast");
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("No response body");
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") return;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  /**
   * Simplified forecast endpoint
   */
  async getSimpleForecast(
    ticker: string,
    days_back: number = 28,
    include_financials: boolean = true
  ): Promise<SimpleForecastResponse> {
    const response = await fetch(`${this.baseUrl}/forecast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker,
        days_back,
        include_financials,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to get forecast");
    }

    return response.json();
  }

  /**
   * Check if FinGPT service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/healthz`);
      const data = await response.json();
      return data.status === "ok" && data.model_loaded === true;
    } catch (error) {
      console.error("FinGPT health check failed:", error);
      return false;
    }
  }

  /**
   * Get available models
   */
  async getModels() {
    const response = await fetch(`${this.baseUrl}/v1/models`);
    return response.json();
  }
}

// Export singleton instance
export const fingptClient = new FinGPTClient();

// Utility functions
export function extractStockTicker(text: string): string | null {
  // Extract ticker symbols like AAPL, TSLA, GOOGL
  const match = text.match(/\b([A-Z]{1,5})\b/);
  return match ? match[1] : null;
}

export function parseForecastSections(forecast: string) {
  const sections = {
    positive: [] as string[],
    concerns: [] as string[],
    prediction: "",
  };

  // Extract positive developments
  const positiveMatch = forecast.match(
    /\[Positive Developments\]:?\n([\s\S]*?)(?=\[Potential Concerns\]|$)/i
  );
  if (positiveMatch) {
    sections.positive = positiveMatch[1]
      .split("\n")
      .filter((line) => line.match(/^\d+\./))
      .map((line) => line.replace(/^\d+\.\s*/, "").trim());
  }

  // Extract potential concerns
  const concernsMatch = forecast.match(
    /\[Potential Concerns\]:?\n([\s\S]*?)(?=\[Prediction|$)/i
  );
  if (concernsMatch) {
    sections.concerns = concernsMatch[1]
      .split("\n")
      .filter((line) => line.match(/^\d+\./))
      .map((line) => line.replace(/^\d+\.\s*/, "").trim());
  }

  // Extract prediction & analysis
  const predictionMatch = forecast.match(
    /\[Prediction & Analysis\]:?\n([\s\S]*?)$/i
  );
  if (predictionMatch) {
    sections.prediction = predictionMatch[1].trim();
  }

  return sections;
}