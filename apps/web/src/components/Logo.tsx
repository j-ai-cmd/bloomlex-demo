import React from 'react';

export function Logo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 56" fill="none" className="h-8 w-auto">
      {/* Icon mark — 4 curved leaves */}
      <g transform="translate(2,2)">
        <path d="M26 26 C26 14 14 2 2 2 C2 14 14 26 26 26Z"   fill="#3DB878"/>
        <path d="M26 26 C38 26 50 14 50 2 C38 2 26 14 26 26Z"  fill="#3DB878"/>
        <path d="M26 26 C26 38 38 50 50 50 C50 38 38 26 26 26Z" fill="#3DB878"/>
        <path d="M26 26 C14 26 2 38 2 50 C14 50 26 38 26 26Z"   fill="#3DB878"/>
        {/* person silhouette */}
        <circle cx="26" cy="21" r="4" fill="white"/>
        <path d="M19 33 C19 28 33 28 33 33" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      </g>
      {/* Wordmark */}
      <text x="62" y="39"
        fontFamily="'Inter', 'Helvetica Neue', Arial, sans-serif"
        fontWeight="700"
        fontSize="26"
        fill="#0F1F3D"
        letterSpacing="-0.3">BloomLex</text>
    </svg>
  );
}
