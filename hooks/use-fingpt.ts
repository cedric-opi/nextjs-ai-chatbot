import { useState, useCallback } from "react";
import { fingptClient, ForecastRequest } from "@/lib/fingpt-clients";

export function useFingpt() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forecast, setForecast] = useState<string>("");

  /**
   * Get forecast (non-streaming)
   */
  const getForecast = useCallback(async (request: ForecastRequest) => {
    setLoading(true);
    setError(null);
    setForecast("");

    try {
      const response = await fingptClient.getForecast(request);
      const content = response.choices[0]?.message?.content || "";
      setForecast(content);
      return content;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get forecast (streaming)
   */
  const getForecastStream = useCallback(
    async (request: ForecastRequest, onChunk?: (chunk: string) => void) => {
      setLoading(true);
      setError(null);
      setForecast("");

      try {
        let fullText = "";
        const stream = fingptClient.getForecastStream(request);

        for await (const chunk of stream) {
          fullText += chunk;
          setForecast(fullText);
          onChunk?.(chunk);
        }

        return fullText;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Get simple forecast
   */
  const getSimpleForecast = useCallback(
    async (
      ticker: string,
      days_back: number = 28,
      include_financials: boolean = true
    ) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fingptClient.getSimpleForecast(
          ticker,
          days_back,
          include_financials
        );
        setForecast(response.forecast);
        return response;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Check service health
   */
  const checkHealth = useCallback(async () => {
    try {
      return await fingptClient.healthCheck();
    } catch (err) {
      return false;
    }
  }, []);

  return {
    loading,
    error,
    forecast,
    getForecast,
    getForecastStream,
    getSimpleForecast,
    checkHealth,
  };
}

// Hook for streaming with auto-update
export function useFingptStream() {
  const [streaming, setStreaming] = useState(false);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const startStream = useCallback(async (request: ForecastRequest) => {
    setStreaming(true);
    setError(null);
    setContent("");

    try {
      const stream = fingptClient.getForecastStream(request);

      for await (const chunk of stream) {
        setContent((prev) => prev + chunk);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setStreaming(false);
    }
  }, []);

  const reset = useCallback(() => {
    setContent("");
    setError(null);
    setStreaming(false);
  }, []);

  return {
    streaming,
    content,
    error,
    startStream,
    reset,
  };
}