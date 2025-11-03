"use client"

import Link from "next/link"

interface StonkAILogoProps {
  href?: string
  onClick?: () => void
  className?: string
}

export function StonkAILogo({ href = "/", onClick, className = "" }: StonkAILogoProps) {
  const content = (
    <div className={`flex items-center gap-3 cursor-pointer group ${className}`}>
      <div className="relative w-9 h-9">
        {/* Glow background */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-blue-500 rounded-lg blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

        {/* Main icon box */}
        <div className="relative w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/30 group-hover:shadow-blue-600/60 transition-all duration-300 group-hover:scale-110">
          <span className="text-white font-bold text-xl drop-shadow-lg">₿</span>
        </div>
      </div>

      <span className="font-bold text-xl bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent group-hover:from-blue-500 group-hover:to-blue-600 transition-all duration-300">
        StonkAI
      </span>
    </div>
  )

  if (href) {
    return (
      <Link href={href} onClick={onClick}>
        {content}
      </Link>
    )
  }

  return content
}
