"use client";

import { useState } from "react";
import { parseForecastSections } from "@/lib/fingpt-clients";

interface StockForecastCardProps {
  ticker: string;
  forecast: string;
  onDismiss?: () => void;
}

export function StockForecastCard({
  ticker,
  forecast,
  onDismiss,
}: StockForecastCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const sections = parseForecastSections(forecast);

  if (!isExpanded) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">📊</span>
            <span className="font-medium text-gray-900">
              Financial Analysis: {ticker}
            </span>
          </div>
          <button
            onClick={() => setIsExpanded(true)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Expand
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 p-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📊</span>
          <div>
            <h3 className="font-semibold text-gray-900">
              Financial Analysis: {ticker}
            </h3>
            <p className="text-sm text-gray-500">
              Powered by FinGPT
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsExpanded(false)}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Collapse
          </button>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4 p-4">
        {/* Positive Developments */}
        {sections.positive.length > 0 && (
          <div className="rounded-lg bg-green-50 p-4">
            <h4 className="mb-2 flex items-center gap-2 font-semibold text-green-900">
              <span>✅</span>
              Positive Developments
            </h4>
            <ul className="space-y-2">
              {sections.positive.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 text-green-600">•</span>
                  <span className="text-green-900">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Potential Concerns */}
        {sections.concerns.length > 0 && (
          <div className="rounded-lg bg-yellow-50 p-4">
            <h4 className="mb-2 flex items-center gap-2 font-semibold text-yellow-900">
              <span>⚠️</span>
              Potential Concerns
            </h4>
            <ul className="space-y-2">
              {sections.concerns.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 text-yellow-600">•</span>
                  <span className="text-yellow-900">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Prediction & Analysis */}
        {sections.prediction && (
          <div className="rounded-lg bg-blue-50 p-4">
            <h4 className="mb-2 flex items-center gap-2 font-semibold text-blue-900">
              <span>📈</span>
              Prediction & Analysis
            </h4>
            <p className="whitespace-pre-wrap text-sm text-blue-900">
              {sections.prediction}
            </p>
          </div>
        )}

        {/* Raw forecast if parsing fails */}
        {!sections.positive.length && !sections.concerns.length && !sections.prediction && (
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="whitespace-pre-wrap text-sm text-gray-900">
              {forecast}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-xs text-gray-500">
          This analysis is based on recent news and market data. Not financial advice.
        </p>
      </div>
    </div>
  );
}