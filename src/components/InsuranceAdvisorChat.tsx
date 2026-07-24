import React, { useRef, useState } from "react";
import { Sparkles, Send, Image as ImageIcon, X, AlertCircle, ShieldAlert } from "lucide-react";

interface RecommendedPolicy {
  policyName: string;
  reason: string;
}

interface ChatTurn {
  question: string;
  imagePreview?: string;
  answer: string;
  riskFactors: string[];
  suggestedInsuranceLines: string[];
  recommendedPolicies: RecommendedPolicy[];
}

export default function InsuranceAdvisorChat() {
  const [question, setQuestion] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) {
      setError("Please type a question first.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/insurance-advisor-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim(), imageBase64: imagePreview || undefined, mimeType: imageFile?.type })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get a response.");

      setHistory((prev) => [
        ...prev,
        {
          question: question.trim(),
          imagePreview: imagePreview || undefined,
          answer: data.answer,
          riskFactors: data.riskFactors || [],
          suggestedInsuranceLines: data.suggestedInsuranceLines || [],
          recommendedPolicies: data.recommendedPolicies || []
        }
      ]);
      setDisclaimer(data.disclaimer);
      setQuestion("");
      setImageFile(null);
      setImagePreview(null);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6" id="insurance-advisor-chat">
      <div className="border border-amber-200 bg-amber-50 p-3.5 flex items-start space-x-2.5 text-[11px] text-amber-900 rounded-none">
        <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
        <p className="leading-relaxed">
          <strong>AI-generated guidance, not professional advice.</strong> This assistant helps you understand insurance concepts, spot general risk factors, and see which policies may be worth considering for an asset. It does not issue quotes, confirm coverage, or replace a licensed advisor - speak to an Utmost advisor before making any insurance decision.
        </p>
      </div>

      <div className="border border-[#D8E2F0] bg-[#FAF9F6] p-6 space-y-5 rounded-none">
        <h3 className="font-serif italic text-lg text-[#1A1A1A] flex items-center space-x-2 border-b border-[#D8E2F0] pb-2">
          <Sparkles className="h-4 w-4 text-[#316EC9]" />
          <span>Any Asset Photo & Policy Advisor</span>
        </h3>
        <p className="text-xs text-[#8C887D] leading-relaxed">
          Ask a general question about how insurance works in Kenya, or attach a photo of any asset or property - a vehicle, shop, equipment, home or its contents - to get risk factors and specific policy recommendations.
        </p>

        {history.length > 0 && (
          <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
            {history.map((turn, i) => (
              <div key={i} className="space-y-2">
                <div className="bg-[#142C54] text-white text-xs p-3 self-end max-w-[85%] ml-auto rounded-none">
                  {turn.imagePreview && <img src={turn.imagePreview} alt="Attached" className="max-h-32 mb-2 rounded-none" />}
                  {turn.question}
                </div>
                <div className="bg-white border border-[#D8E2F0] text-xs text-slate-800 p-3 max-w-[90%] rounded-none space-y-2">
                  <p className="leading-relaxed">{turn.answer}</p>
                  {turn.riskFactors.length > 0 && (
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[#8C887D]">Risk factors noted</p>
                      <ul className="mt-1 space-y-0.5">
                        {turn.riskFactors.map((r, j) => <li key={j} className="flex items-start"><span className="mr-1.5 text-[#316EC9] shrink-0">•</span><span>{r}</span></li>)}
                      </ul>
                    </div>
                  )}
                  {turn.suggestedInsuranceLines.length > 0 && (
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[#8C887D]">Relevant cover types</p>
                      <p className="mt-0.5">{turn.suggestedInsuranceLines.join(", ")}</p>
                    </div>
                  )}
                  {turn.recommendedPolicies.length > 0 && (
                    <div className="border border-[#316EC9]/30 bg-[#F0F5FC] p-2.5 space-y-1.5">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[#142C54] flex items-center">
                        <Sparkles className="h-3 w-3 text-[#316EC9] mr-1 shrink-0" />
                        Recommended Policies
                      </p>
                      <ul className="space-y-1.5">
                        {turn.recommendedPolicies.map((p, j) => (
                          <li key={j}>
                            <p className="font-bold text-[#142C54]">{p.policyName}</p>
                            <p className="text-slate-600 leading-relaxed">{p.reason}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="border border-red-200 bg-red-50 p-3 text-[11px] text-red-700 rounded-none flex items-start space-x-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {imagePreview && (
            <div className="relative inline-block">
              <img src={imagePreview} alt="Preview" className="h-20 border border-[#D8E2F0] rounded-none" />
              <button
                type="button"
                onClick={() => { setImageFile(null); setImagePreview(null); }}
                className="absolute -top-2 -right-2 bg-white border border-[#D8E2F0] rounded-full p-0.5 cursor-pointer"
              >
                <X className="h-3 w-3 text-slate-600" />
              </button>
            </div>
          )}
          <div className="flex items-end space-x-2">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. 'How does WIBA cover work?' or 'What risks should I consider insuring my rental apartment?'"
              rows={2}
              className="flex-grow bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none resize-none"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach a photo for risk analysis"
              className="p-2.5 border border-[#D8E2F0] bg-white hover:bg-[#F0F5FC] rounded-none cursor-pointer shrink-0"
            >
              <ImageIcon className="h-4 w-4 text-[#316EC9]" />
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
            <button
              type="submit"
              disabled={isLoading}
              className="p-2.5 bg-[#142C54] hover:bg-[#316EC9] text-white rounded-none cursor-pointer disabled:opacity-50 shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>

        {isLoading && <p className="text-[10px] text-[#316EC9] font-mono uppercase tracking-wider">Thinking...</p>}

        {disclaimer && (
          <p className="text-[9px] text-[#8C887D] italic border-t border-[#D8E2F0] pt-3">{disclaimer}</p>
        )}
      </div>
    </div>
  );
}
