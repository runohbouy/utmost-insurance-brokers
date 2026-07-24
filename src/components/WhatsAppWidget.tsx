import React, { useState } from "react";

const WHATSAPP_NUMBER = "254707798701";
const PREFILLED_MESSAGE = "Hi Utmost Insurance Brokers, I'd like help with my insurance needs.";

export default function WhatsAppWidget() {
  const [showTooltip, setShowTooltip] = useState(false);

  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(PREFILLED_MESSAGE)}`;

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end" id="whatsapp-widget">
      {showTooltip && (
        <div className="mb-2 bg-[#142C54] text-white text-[11px] font-semibold px-3 py-2 rounded-lg shadow-lg max-w-[200px] leading-snug">
          Chat with an insurance advisor on WhatsApp
        </div>
      )}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title="Chat with us on WhatsApp"
        className="relative flex items-center justify-center h-14 w-14 rounded-full bg-[#25D366] hover:bg-[#20BD5A] shadow-lg hover:shadow-xl transition-all active:scale-95"
      >
        {/* "Active" pulse indicator, matching the app's existing 24/7 dispatch motif */}
        <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-400 border-2 border-white"></span>
        </span>

        <svg viewBox="0 0 32 32" className="h-7 w-7 fill-white" aria-hidden="true">
          <path d="M16.004 3C9.376 3 4 8.373 4 15c0 2.31.65 4.47 1.77 6.31L4 29l7.86-1.74A11.94 11.94 0 0 0 16.004 27C22.63 27 28 21.627 28 15S22.63 3 16.004 3Zm0 21.9c-2.02 0-3.9-.56-5.5-1.53l-.4-.24-4.66 1.03 1.06-4.55-.26-.42A9.9 9.9 0 0 1 6.1 15c0-5.47 4.45-9.9 9.9-9.9 5.46 0 9.9 4.43 9.9 9.9 0 5.46-4.44 9.9-9.9 9.9Zm5.42-7.42c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.6-.9-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.8.37-.27.3-1.05 1.02-1.05 2.48 0 1.46 1.07 2.87 1.22 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35Z" />
        </svg>
      </a>
    </div>
  );
}
