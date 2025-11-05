"use client";

export function StreamingIndicator() {
  return (
    <div className="flex items-center gap-2 text-gray-600">
      <div className="flex gap-1">
        <div className="h-2 w-2 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.3s]"></div>
        <div className="h-2 w-2 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.15s]"></div>
        <div className="h-2 w-2 animate-bounce rounded-full bg-blue-500"></div>
      </div>
      <span className="text-sm font-medium text-blue-700">
        📊 FinGPT is analyzing financial data...
      </span>
    </div>
  );
}