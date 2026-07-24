import React, { useEffect, useState } from "react";

interface InsurerLogoProps {
  carrierId: string;
  className?: string;
  height?: number | string;
  style?: React.CSSProperties;
}

// Staff-uploaded logo overrides (Underwriter Logo Manager in Workspace Admin) take priority over
// everything below, for both built-in and admin-added custom insurers. Fetched once and shared
// across every InsurerLogo instance on the page via a module-level cache, rather than each of the
// (sometimes dozens of) logo instances on a comparison grid issuing its own request.
type UploadedLogoMap = Record<string, { src: string }>;
let uploadedLogosCache: UploadedLogoMap | null = null;
let uploadedLogosPromise: Promise<UploadedLogoMap> | null = null;

function useUploadedLogos(): UploadedLogoMap {
  const [logos, setLogos] = useState<UploadedLogoMap>(uploadedLogosCache || {});

  useEffect(() => {
    if (uploadedLogosCache) return;
    if (!uploadedLogosPromise) {
      uploadedLogosPromise = fetch("/api/insurer-logos")
        .then((r) => (r.ok ? r.json() : {}))
        .then((data) => {
          uploadedLogosCache = data;
          return data;
        })
        .catch(() => ({}));
    }
    uploadedLogosPromise.then(setLogos);
  }, []);

  return logos;
}

// Real brand logo assets, supplied as image files (in public/logos) rather than
// hand-drawn SVG recreations. Keyed by the normalized carrier ID.
const IMAGE_LOGOS: Record<string, { src: string; alt: string }> = {
  mua: { src: "/logos/mua.png", alt: "MUA Insurance" },
  cannon: { src: "/logos/cannon.png", alt: "Cannon General Insurance" },
  capex: { src: "/logos/capex.png", alt: "Capex Life Assurance" },
  pioneer: { src: "/logos/pioneer.png", alt: "Pioneer Insurance" },
  monarch: { src: "/logos/monarch.jpeg", alt: "The Monarch Insurance" },
  geminia: { src: "/logos/geminia.png", alt: "Geminia Insurance Company Limited" },
  stardiscover: { src: "/logos/stardiscover.png", alt: "Star Discover Insurance Limited" },
  oldmutual: { src: "/logos/oldmutual.png", alt: "Old Mutual General Insurance Kenya Limited" },
  icea: { src: "/logos/icea.png", alt: "ICEA LION General Insurance Company Limited" },
  icealion: { src: "/logos/icea.png", alt: "ICEA LION General Insurance Company Limited" },
  icealiongeneral: { src: "/logos/icea.png", alt: "ICEA LION General Insurance Company Limited" }
};

export default function InsurerLogo({ carrierId, className = "", height = "32", style = {} }: InsurerLogoProps) {
  const normId = carrierId.toLowerCase().replace(/[^a-z0-9]/g, "");
  const uploadedLogos = useUploadedLogos();

  if (uploadedLogos[normId]) {
    return (
      <img
        src={uploadedLogos[normId].src}
        alt={carrierId}
        height={height}
        className={`inline-block select-none object-contain ${className}`}
        style={{ maxWidth: "100%", height, ...style }}
      />
    );
  }

  if (IMAGE_LOGOS[normId]) {
    const { src, alt } = IMAGE_LOGOS[normId];
    return (
      <img
        src={src}
        alt={alt}
        height={height}
        className={`inline-block select-none object-contain ${className}`}
        style={{ maxWidth: "100%", height, ...style }}
      />
    );
  }

  // Liberty Life's supplied artwork is a white/light knockout mark on a transparent
  // background - invisible on this app's light cards, so it gets a dark backing chip
  // rather than being rendered directly like the other image logos above.
  if (normId === "liberty" || normId === "libertylife") {
    return (
      <span
        className={`inline-flex items-center justify-center bg-[#142C54] px-2 py-1 rounded ${className}`}
        style={{ ...style }}
      >
        <img
          src="/logos/liberty.webp"
          alt="Liberty Life Assurance"
          height={height}
          className="object-contain"
          style={{ maxWidth: "100%", height }}
        />
      </span>
    );
  }

  // Britam logo representation
  if (normId === "britam") {
    return (
      <svg
        viewBox="0 0 200 65"
        height={height}
        className={`inline-block select-none ${className}`}
        style={{ maxWidth: "100%", ...style }}
        id="logo-carrier-britam"
      >
        <g transform="translate(10, 5)">
          {/* "Britam" Text */}
          <text
            x="0"
            y="32"
            fontFamily="'Inter', 'Space Grotesk', system-ui, sans-serif"
            fontWeight="900"
            fontSize="32"
            letterSpacing="-1.2"
            fill="#0073C4"
          >
            Br
            <tspan fill="#0073C4">i</tspan>
            tam
          </text>
          {/* Red dot above the "i" - explicitly colored and aligned */}
          <circle cx="28.5" cy="8" r="4.2" fill="#E31B23" />
          
          {/* Tagline "With you every step of the way" */}
          <text
            x="1"
            y="48"
            fontFamily="'Inter', system-ui, sans-serif"
            fontWeight="800"
            fontSize="10"
            letterSpacing="0.2"
            fill="#E31B23"
          >
            With you every step of the way
          </text>
        </g>
      </svg>
    );
  }

  // CIC Group logo representation
  if (normId === "cic" || normId === "cicgroup" || normId === "cicgeneral") {
    return (
      <svg
        viewBox="0 0 160 55"
        height={height}
        className={`inline-block select-none ${className}`}
        style={{ maxWidth: "100%", ...style }}
        id="logo-carrier-cic"
      >
        <g transform="translate(8, 6)">
          {/* Capsule Icon */}
          <rect
            x="2"
            y="6"
            width="28"
            height="18"
            rx="9"
            fill="none"
            stroke="#B11B21"
            strokeWidth="4.5"
          />
          {/* Vertical dividing line */}
          <line
            x1="16"
            y1="2"
            x2="16"
            y2="28"
            stroke="#B11B21"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          {/* Yellow square dot at top */}
          <rect x="13.5" y="-3" width="5" height="5" fill="#FBB040" />

          {/* Text "CIC GROUP" */}
          <text
            x="38"
            y="23"
            fontFamily="'Inter', 'Space Grotesk', system-ui, sans-serif"
            fontWeight="900"
            fontSize="18"
            letterSpacing="1"
            fill="#B11B21"
          >
            CIC GROUP
          </text>
        </g>
      </svg>
    );
  }

  // Heritage Insurance logo representation
  if (normId === "heritage" || normId === "heritageinsurance") {
    return (
      <svg
        viewBox="0 0 210 65"
        height={height}
        className={`inline-block select-none ${className}`}
        style={{ maxWidth: "100%", ...style }}
        id="logo-carrier-heritage"
      >
        <g transform="translate(5, 5)">
          {/* Circular shield & flame badge */}
          <circle cx="22" cy="24" r="16" stroke="#003366" strokeWidth="2.5" fill="none" />
          <path
            d="M22,12 C24,15 25.5,18 25.5,21.5 C25.5,25.5 22,28.5 19,27 C17,25 17,22 19,18 C19.8,16 21,14 22,12 Z"
            fill="#003366"
          />
          <path
            d="M20,16 C21.5,18.5 22.5,20.5 22.5,22.5 C22.5,25 20.5,26.5 18.5,25.5 C17.5,24.5 17.5,22.5 18.5,20 C19,18.5 19.5,17.2 20,16 Z"
            fill="#FBB040"
            opacity="0.9"
          />

          {/* Text "Heritage" */}
          <text
            x="46"
            y="21"
            fontFamily="'Inter', 'Playfair Display', system-ui, sans-serif"
            fontWeight="800"
            fontSize="21"
            letterSpacing="-0.5"
            fill="#003366"
          >
            Heritage
          </text>
          
          {/* Subtitle "Insurance Company" */}
          <text
            x="47"
            y="32"
            fontFamily="'Inter', system-ui, sans-serif"
            fontWeight="600"
            fontSize="9"
            letterSpacing="0.6"
            fill="#003366"
          >
            Insurance Company
          </text>

          {/* Group note "A member of the LIBERTY Group" */}
          <text
            x="47"
            y="43"
            fontFamily="'Inter', system-ui, sans-serif"
            fontWeight="500"
            fontSize="7"
            letterSpacing="0.4"
            fill="#5C6F84"
          >
            A member of the LIBERTY Group
          </text>
        </g>
      </svg>
    );
  }

  // Jubilee Insurance logo representation
  if (normId === "jubilee" || normId === "jubileegeneral" || normId === "jubileeallianz") {
    return (
      <svg
        viewBox="0 0 170 55"
        height={height}
        className={`inline-block select-none ${className}`}
        style={{ maxWidth: "100%", ...style }}
        id="logo-carrier-jubilee"
      >
        <g transform="translate(10, 5)">
          {/* Jubilee text logo */}
          <text
            x="0"
            y="28"
            fontFamily="'Georgia', 'Playfair Display', 'Inter', serif"
            fontWeight="900"
            fontStyle="italic"
            fontSize="26"
            letterSpacing="-0.5"
            fill="#C10E23"
          >
            Jubilee
          </text>
          
          {/* Below text "INSURANCE" */}
          <text
            x="2"
            y="41"
            fontFamily="'Inter', system-ui, sans-serif"
            fontWeight="700"
            fontSize="10"
            letterSpacing="2.8"
            fill="#C10E23"
          >
            INSURANCE
          </text>
        </g>
      </svg>
    );
  }

  // Madison Life Assurance logo representation
  if (normId === "madison" || normId === "madisonlife" || normId === "madisonassurance") {
    return (
      <svg
        viewBox="0 0 200 60"
        height={height}
        className={`inline-block select-none ${className}`}
        style={{ maxWidth: "100%", ...style }}
        id="logo-carrier-madison"
      >
        <g transform="translate(5, 5)">
          {/* Overlapping double-arch shield form of M on the left */}
          <path
            d="M6,10 C6,10 14,4 22,10 C30,4 38,10 38,10 L38,32 L22,42 L6,32 Z"
            fill="#009B9E"
          />
          <path
            d="M22,10 L38,10 L38,32 L22,42 Z"
            fill="#0F2C59"
            opacity="0.85"
          />
          {/* Interlocking "M" lines inside shield */}
          <path
            d="M12,18 L22,28 L32,18"
            stroke="#FFFFFF"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          {/* Text MADISON */}
          <text
            x="46"
            y="24"
            fontFamily="'Inter', 'Space Grotesk', system-ui, sans-serif"
            fontWeight="900"
            fontSize="19"
            letterSpacing="0.8"
            fill="#0F2C59"
          >
            MADISON
          </text>

          {/* Text "Life Assurance" */}
          <text
            x="47"
            y="37"
            fontFamily="'Inter', system-ui, sans-serif"
            fontWeight="700"
            fontSize="10"
            letterSpacing="0.4"
            fill="#F37021"
          >
            Life Assurance
          </text>
        </g>
      </svg>
    );
  }

  // Kenindia Assurance logo representation
  if (normId === "kenindia" || normId === "kenindiaassurance") {
    return (
      <svg
        viewBox="0 0 190 55"
        height={height}
        className={`inline-block select-none ${className}`}
        style={{ maxWidth: "100%", ...style }}
        id="logo-carrier-kenindia"
      >
        <g transform="translate(5, 5)">
          {/* Elephant outline on the left */}
          <path
            d="M6,22 C6,16 10,12 16,12 C22,12 24,14 26,11 C28,8 30,8 32,10 C34,12 33,16 31,18 L34,22 L31,24 L29,21 C27,24 23,26 18,26 Z"
            fill="#A61F24"
          />
          <circle cx="14" cy="17" r="1.5" fill="#FFFFFF" />

          {/* Bold red text Kenindia */}
          <text
            x="42"
            y="22"
            fontFamily="'Inter', 'Space Grotesk', system-ui, sans-serif"
            fontWeight="900"
            fontSize="18"
            letterSpacing="0.4"
            fill="#A61F24"
          >
            Kenindia
          </text>
          {/* "Assurance" */}
          <text
            x="43"
            y="34"
            fontFamily="'Inter', system-ui, sans-serif"
            fontWeight="700"
            fontSize="9"
            letterSpacing="1.2"
            fill="#5C6F84"
          >
            Assurance
          </text>
        </g>
      </svg>
    );
  }

  // Fallback carrier badge
  return (
    <div
      className={`inline-flex items-center space-x-1.5 px-2 py-1 bg-slate-50 border border-slate-200 uppercase font-mono text-[9px] font-bold tracking-wide text-slate-700 ${className}`}
      style={{ height, display: "inline-flex", alignItems: "center", ...style }}
    >
      <span className="text-xs">🏢</span>
      <span>{carrierId}</span>
    </div>
  );
}
