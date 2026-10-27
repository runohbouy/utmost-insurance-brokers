import React from "react";

interface LogoProps {
  className?: string;
  variant?: "full" | "icon" | "text-only" | "badge";
  height?: number | string;
}

export default function Logo({ className = "", variant = "full", height = "40" }: LogoProps) {
  // Brand color references:
  // - Lighter Blue (tspan/dot top): #316EC9
  // - Darker Blue (bottom gradient): #142C54
  // - Dark Grey/Black text: #111111

  // Icon only: "uib" monogram
  if (variant === "icon") {
    return (
      <svg
        viewBox="0 0 120 70"
        height={height}
        className={`inline-block ${className}`}
        id="uib-logo-icon"
      >
        <defs>
          <linearGradient id="uibIconGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#316EC9" />
            <stop offset="100%" stopColor="#142C54" />
          </linearGradient>
        </defs>
        <text
          x="10"
          y="52"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="900"
          fontSize="56"
          letterSpacing="-2"
          fill="#111111"
        >
          u
          <tspan fill="url(#uibIconGradient)">i</tspan>
          b
        </text>
      </svg>
    );
  }

  // Text-only stacked: "UTMOST iNSURANCE BROKERS LIMITED"
  if (variant === "text-only") {
    return (
      <svg
        viewBox="0 0 200 70"
        height={height}
        className={`inline-block ${className}`}
        id="uib-logo-text"
      >
        <g transform="translate(5, 5)" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800">
          <text x="0" y="14" fontSize="12" fill="#111111" letterSpacing="2.5">
            UTMOST
          </text>
          <text x="0" y="30" fontSize="12" letterSpacing="2">
            <tspan fill="#316EC9" fontWeight="900">i</tspan>
            <tspan fill="#111111">NSURANCE</tspan>
          </text>
          <text x="0" y="46" fontSize="12" fill="#111111" letterSpacing="2">
            BROKERS
          </text>
          <text x="0" y="62" fontSize="12" fill="#111111" letterSpacing="2">
            LIMITED
          </text>
        </g>
      </svg>
    );
  }

  // Badge/Stamp logo
  if (variant === "badge") {
    return (
      <div className={`flex flex-col items-center justify-center p-4 border border-[#316EC9]/25 bg-[#FAFBFD] uppercase text-center ${className}`}>
        <Logo variant="icon" height="32" className="mb-2" />
        <div className="text-[9px] font-bold tracking-[0.2em] text-[#111111]">Utmost Brokerage</div>
        <div className="text-[7px] text-[#316EC9] font-semibold tracking-wider">Certified Member</div>
      </div>
    );
  }

  // Primary variant: Full Horizontal Logo with "uib" monogram + Thin Vertical Divider Line + Stacked Text
  return (
    <svg
      viewBox="0 0 320 74"
      height={height}
      className={`inline-block ${className}`}
      id="uib-logo-full"
    >
      <defs>
        <linearGradient id="uibFullIGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#316EC9" />
          <stop offset="100%" stopColor="#142C54" />
        </linearGradient>
      </defs>
      
      {/* Monogram uib */}
      <g transform="translate(8, 2)">
        <text
          x="0"
          y="52"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="900"
          fontSize="56"
          letterSpacing="-2"
          fill="#111111"
        >
          u
          <tspan fill="url(#uibFullIGradient)">i</tspan>
          b
        </text>
      </g>

      {/* Thin elegant vertical brand divider line */}
      <line
        x1="114"
        y1="10"
        x2="114"
        y2="64"
        stroke="#316EC9"
        strokeWidth="1.5"
        strokeOpacity="0.8"
      />

      {/* Stacked Wordmark on the right */}
      <g transform="translate(126, 6)" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800">
        <text x="0" y="14" fontSize="12" fill="#111111" letterSpacing="2.6">
          UTMOST
        </text>
        <text x="0" y="30" fontSize="12" letterSpacing="2.1">
          <tspan fill="#316EC9" fontWeight="900">i</tspan>
          <tspan fill="#111111">NSURANCE</tspan>
        </text>
        <text x="0" y="46" fontSize="12" fill="#111111" letterSpacing="2.5">
          BROKERS
        </text>
        <text x="0" y="62" fontSize="12" fill="#111111" letterSpacing="2.5">
          LIMITED
        </text>
      </g>
    </svg>
  );
}
