import React from 'react';

export function Logo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 60" fill="none" className="h-8 w-auto">
      {/* Icon mark — 4 curved leaf petals, pinwheel arrangement */}
      <g>
        {/* Top-left petal */}
        <path d="M28 28 C28 14 14 2 2 2 C2 14 14 28 28 28 Z" fill="#3DB878"/>
        {/* Top-right petal */}
        <path d="M28 28 C42 28 54 14 54 2 C42 2 28 14 28 28 Z" fill="#3DB878"/>
        {/* Bottom-right petal */}
        <path d="M28 28 C28 42 42 54 54 54 C54 42 42 28 28 28 Z" fill="#3DB878"/>
        {/* Bottom-left petal */}
        <path d="M28 28 C14 28 2 42 2 54 C14 54 28 42 28 28 Z" fill="#3DB878"/>
        {/* Person — head */}
        <circle cx="28" cy="21" r="4.5" fill="white"/>
        {/* Person — shoulder arc */}
        <path d="M20 35 C20 29 36 29 36 35" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      </g>
      {/* Wordmark */}
      <text x="66" y="41"
        fontFamily="'Plus Jakarta Sans', 'Inter', 'Helvetica Neue', Arial, sans-serif"
        fontWeight="800"
        fontSize="28"
        fill="#0F1F3D"
        letterSpacing="-0.5">BloomLex</text>
    </svg>
  );
}
