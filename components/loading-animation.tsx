"use client";

import { motion } from "framer-motion";

export function LoadingAnimation() {
  return (
    <div className="flex items-center gap-3">
      {/* Animated dots */}
      <div className="flex gap-1">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 1, 0.5],
          }}
          className="h-2 w-2 rounded-full bg-blue-500"
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 1, 0.5],
          }}
          className="h-2 w-2 rounded-full bg-blue-500"
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.2,
          }}
        />
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 1, 0.5],
          }}
          className="h-2 w-2 rounded-full bg-blue-500"
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.4,
          }}
        />
      </div>

      {/* Spinning circle */}
      <motion.div
        animate={{ rotate: 360 }}
        className="h-4 w-4 rounded-full border-2 border-blue-500 border-t-transparent"
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: "linear",
        }}
      />

      {/* Text */}
      <motion.span
        animate={{
          opacity: [0.5, 1, 0.5],
        }}
        className="text-sm text-muted-foreground"
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        FinGPT is analyzing...
      </motion.span>
    </div>
  );
}

// Alternative: Pulse circle version
export function LoadingPulse() {
  return (
    <div className="flex items-center gap-3">
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 1, 0.3],
        }}
        className="relative h-8 w-8"
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <div className="absolute inset-0 rounded-full bg-blue-500/20" />
        <div className="absolute inset-2 rounded-full bg-blue-500" />
      </motion.div>
      
      <span className="text-sm text-muted-foreground">
        Analyzing market data...
      </span>
    </div>
  );
}   