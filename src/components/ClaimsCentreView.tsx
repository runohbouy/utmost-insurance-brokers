import React, { useState, useRef } from "react";
import { ClaimSubmissionResponse, ActiveTab } from "../types";
import { 
  PhoneCall, AlertOctagon, CheckCircle, Clock, FileText, UploadCloud, 
  MapPin, HeartCrack, Hammer, Eye, ArrowRight, ShieldCheck, HelpCircle, Camera,
  AlertCircle
} from "lucide-react";

interface ClaimsCentreViewProps {
  setActiveTab: (tab: ActiveTab) => void;
  onClaimSuccess: (claim: ClaimSubmissionResponse) => void;
}

export default function ClaimsCentreView({ setActiveTab, onClaimSuccess }: ClaimsCentreViewProps) {
  const [claimType, setClaimType] = useState<string>("Motor Accident");
  const [claimantName, setClaimantName] = useState<string>("");
  const [policyNo, setPolicyNo] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [details, setDetails] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [claimResponse, setClaimResponse] = useState<ClaimSubmissionResponse | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  // AI Claims Reporting Assistant - guides the user on what to photograph/gather
  // BEFORE they submit, tailored to the selected claim type.
  const [aiGuidance, setAiGuidance] = useState<{ photosToTake: string[]; documentsToGather: string[]; nextSteps: string[]; disclaimer: string } | null>(null);
  const [isLoadingGuidance, setIsLoadingGuidance] = useState(false);
  const [guidanceError, setGuidanceError] = useState<string | null>(null);

  // AI Claims Photo Evidence Review - once a photo is attached, assesses whether
  // it is actually useful enough to help defend the claim.
  const [photoReview, setPhotoReview] = useState<{ evidenceQuality: string; strengths: string[]; gaps: string[]; recommendation: string; disclaimer: string } | null>(null);
  const [isLoadingPhotoReview, setIsLoadingPhotoReview] = useState(false);
  const [photoReviewError, setPhotoReviewError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const triggerNotification = (type: "success" | "error" | "info", message: string) => {
    setNotification({ type, message });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const claimCategories = [
    "Motor Accident", "Medical Emergency / IP", "Home Burglary / Fire", "Contractor Plant Damages", "Marine Cargo Loss"
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFile(file);
      setPhotoReview(null);
      setPhotoReviewError(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) setPhotoPreview(event.target.result as string);
         };
      reader.readAsDataURL(file);
    }
  };

  // AI Claims Photo Evidence Review - checks whether the attached photo is
  // useful enough, on its own, to help defend the claim before submission.
  const handleReviewPhoto = async () => {
    if (!photoPreview || !selectedFile?.type.startsWith("image/")) {
      setPhotoReviewError("Please attach an image (not a PDF) to run the evidence review.");
      return;
    }
    setIsLoadingPhotoReview(true);
    setPhotoReviewError(null);
    setPhotoReview(null);
    try {
      const res = await fetch("/api/claims-photo-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimType, description: details, photoBase64: photoPreview, mimeType: selectedFile.type })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to review the photo.");
      setPhotoReview(data);
    } catch (err: any) {
      setPhotoReviewError(err.message || "Could not reach the AI assistant. Please try again.");
    } finally {
      setIsLoadingPhotoReview(false);
    }
  };

  // AI Claims Reporting Assistant - fetches a tailored checklist for the currently selected
  // claim type, so the customer knows what to photograph and gather before they submit.
  const handleGetAiGuidance = async () => {
    setIsLoadingGuidance(true);
    setGuidanceError(null);
    setAiGuidance(null);
    try {
      const res = await fetch("/api/claims-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimType, description: details })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate guidance.");
      setAiGuidance(data);
    } catch (err: any) {
      setGuidanceError(err.message || "Could not reach the AI assistant. Please try again.");
    } finally {
      setIsLoadingGuidance(false);
    }
  };

  // Submit Claim Incident Notification
  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policyNo || !phone || !details) {
      triggerNotification("error", "Please enter your policy reference number, phone, and incident details.");
      return;
    }

    setIsSubmitting(true);
    setClaimResponse(null);
    setNotification(null);

    try {
      const res = await fetch("/api/submit-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyNumber: policyNo.toUpperCase(),
          claimType,
          phoneNumber: phone,
          description: details,
          claimantName: claimantName || undefined,
          photoBase64: photoPreview || undefined,
          photoName: selectedFile?.name,
          photoMimeType: selectedFile?.type
        })
      });

      if (!res.ok) {
        throw new Error("Claims registry endpoint refused connection.");
      }

      const report: ClaimSubmissionResponse = await res.json();
      setClaimResponse(report);
      onClaimSuccess(report);
    } catch (err) {
      console.error(err);
      triggerNotification("error", "Failed to submit claim notice. Please contact administrative helplines directly.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseSuccess = () => {
    // Reset and take them to dash
    setActiveTab("portal");
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 font-sans text-left space-y-12" id="claims-centre-workspace">
      
      {/* HEADER INDEX */}
      <div className="border-b border-[#D8E2F0] pb-6">
        <p className="text-[10px] uppercase font-bold text-[#316EC9] tracking-[0.25em] mb-1">Direct Liaison Network</p>
        <h1 className="text-3xl font-serif italic tracking-tight text-[#1A1A1A]">
          Emergency Claims Settlement & Online Notification Centre
        </h1>
        <p className="mt-1.5 text-xs text-[#8C887D] max-w-4xl leading-relaxed">
          At Utmost Insurance Brokers, we represent you in front of the underwriters. Report collisions, medical admissions, or domestic burglaries online. Initial audits processed in 24 hours.
        </p>
      </div>

      {notification && (
        <div className={`p-4 border text-xs font-semibold flex items-center justify-between transition-all rounded-none animate-fade-in ${
          notification.type === "error" 
            ? "bg-red-50 border-red-200 text-red-800" 
            : "bg-emerald-50 border-emerald-200 text-emerald-800"
        }`} id="claims-inline-toast">
          <div className="flex items-center space-x-2.5">
            <AlertCircle className={`h-4.5 w-4.5 shrink-0 ${notification.type === "error" ? "text-red-600" : "text-emerald-600"}`} />
            <span>{notification.message}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setNotification(null)}
            className="text-[10px] uppercase tracking-widest font-bold text-gray-550 hover:text-black hover:underline cursor-pointer ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: CRITICAL EMERGENCY DISPATCH ROLES */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* TOLL FREE DIRECT HELPLINES CARD */}
          <div className="border border-red-300 bg-red-50/70 p-5 space-y-4 text-red-950 rounded-none">
            <h4 className="font-sans text-[10px] font-bold text-red-700 uppercase tracking-widest flex items-center space-x-2 border-b border-red-200 pb-2">
              <span className="h-2 w-2 rounded-full bg-red-600 animate-ping"></span>
              <span>24/7 Nairobi claims representative dispatch</span>
            </h4>
            
            <div className="space-y-4">
              <div className="border-b border-red-200/60 pb-2 text-xs">
                <p className="font-bold text-red-950 font-sans uppercase tracking-wider text-[9px]">Main Claims Desk (Stanley Waruru):</p>
                <p className="text-lg font-mono font-bold text-red-700">0707 798 701</p>
                <p className="text-[10px] text-red-600/80 font-serif italic">Hours: 8:00 AM - 5:00 PM (Monday-Friday)</p>
              </div>
              <div className="border-b border-red-200/60 pb-2 text-xs">
                <p className="font-bold text-red-950 font-sans uppercase tracking-wider text-[9px]">After-Hours & Weekend Claims Support:</p>
                <p className="text-lg font-mono font-bold text-red-700">0707 798 701</p>
                <p className="text-[10px] text-red-600/80 font-serif italic">Utmost Mobile Response Advisor</p>
              </div>
              <div className="text-xs">
                <p className="font-bold text-red-950 font-sans uppercase tracking-wider text-[9px]">WhatsApp Rescue Line:</p>
                <a href="https://wa.me/254707798701" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-emerald-800 hover:underline block pt-0.5">
                  +254 707 798 701
                </a>
              </div>
            </div>
          </div>

          {/* CRITICAL MOTOR COLLISION ADVISORY RULES */}
          <div className="border border-[#D8E2F0] bg-[#FAF9F6] p-5 space-y-3 text-[#5E5A51] rounded-none">
            <h4 className="font-bold text-[#1A1A1A] text-[10px] uppercase tracking-wider border-b border-[#D8E2F0] pb-1.5 font-sans">Collision Guidelines (IRA standard Rules)</h4>
            <ul className="space-y-2 text-xs leading-relaxed font-sans text-slate-700">
              <li className="flex items-start">
                <span className="mr-1.5 text-red-600 leading-none font-bold shrink-0">•</span>
                <span><strong>DO NOT admit liability</strong> to other motorists or third-parties. This can invalidate standard insurance policies.</span>
              </li>
              <li className="flex items-start">
                <span className="mr-1.5 text-[#316EC9] leading-none font-bold shrink-0">•</span>
                <span>Take clear photographs of all vehicle damages, license plates of other vehicles, and general road conditions.</span>
              </li>
              <li className="flex items-start">
                <span className="mr-1.5 text-[#316EC9] leading-none font-bold shrink-0">•</span>
                <span>Obtain contact names and numbers of any eyewitnesses present on scene.</span>
              </li>
              <li className="flex items-start">
                <span className="mr-1.5 text-[#316EC9] leading-none font-bold shrink-0">•</span>
                <span>Report the matter immediately to the nearest Police Station and obtain a certified copy of the Police Abstract.</span>
              </li>
            </ul>
          </div>

        </div>

        {/* RIGHT COLUMN: REGISTRATION WIDGET OR REALTIME TRACKER */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* THE NOTIFICATION FORM CARD */}
          {!claimResponse && (
            <form onSubmit={handleSubmitClaim} id="claims-submission-form" className="border border-[#D8E2F0] bg-[#FAF9F6] p-5 sm:p-6 space-y-5 shadow-none text-xs font-semibold rounded-none">
              <div className="flex items-center space-x-2 border-b border-[#D8E2F0] pb-3">
                <AlertOctagon className="h-4.5 w-4.5 text-red-600 animate-pulse" />
                <h3 className="font-serif italic text-lg text-[#1A1A1A]">Submit Claim Notification</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-[#8C887D]">Claim Category Class *</label>
                  <select
                    value={claimType}
                    onChange={(e) => { setClaimType(e.target.value); setAiGuidance(null); }}
                    className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 font-sans font-bold uppercase tracking-wider text-xs focus:border-[#316EC9] focus:outline-none"
                  >
                    {claimCategories.map((c, i) => (
                      <option key={i} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-[#8C887D]">Policy Number / Quote Reference *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. UTM-POL-9824 / KCA 123X"
                    value={policyNo}
                    onChange={(e) => setPolicyNo(e.target.value)}
                    className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 font-mono text-xs text-slate-800 uppercase focus:border-[#316EC9] focus:outline-none"
                  />
                </div>
              </div>

              {/* AI Claims Reporting Assistant */}
              <div className="border border-[#316EC9]/30 bg-[#F0F5FC] p-4 space-y-3 rounded-none">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center space-x-1.5">
                    <Eye className="h-3.5 w-3.5 text-[#316EC9]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#142C54]">AI Claims Reporting Assistant</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleGetAiGuidance}
                    disabled={isLoadingGuidance}
                    className="text-[9px] font-bold uppercase tracking-wider text-white bg-[#316EC9] hover:bg-[#2059ab] px-3 py-1.5 rounded-none cursor-pointer disabled:opacity-50"
                  >
                    {isLoadingGuidance ? "Thinking..." : `What should I photograph for a ${claimType}?`}
                  </button>
                </div>

                {guidanceError && <p className="text-[11px] text-red-700">{guidanceError}</p>}

                {aiGuidance && (
                  <div className="space-y-3 text-[11px] text-slate-700 border-t border-[#316EC9]/20 pt-3">
                    <div>
                      <p className="font-bold text-[#142C54] uppercase text-[9px] tracking-wider mb-1">Photos to take</p>
                      <ul className="space-y-1">
                        {aiGuidance.photosToTake.map((p, i) => <li key={i} className="flex items-start"><span className="mr-1.5 text-[#316EC9] shrink-0">•</span><span>{p}</span></li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="font-bold text-[#142C54] uppercase text-[9px] tracking-wider mb-1">Documents to gather</p>
                      <ul className="space-y-1">
                        {aiGuidance.documentsToGather.map((d, i) => <li key={i} className="flex items-start"><span className="mr-1.5 text-[#316EC9] shrink-0">•</span><span>{d}</span></li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="font-bold text-[#142C54] uppercase text-[9px] tracking-wider mb-1">Next steps</p>
                      <ul className="space-y-1">
                        {aiGuidance.nextSteps.map((n, i) => <li key={i} className="flex items-start"><span className="mr-1.5 text-[#316EC9] shrink-0">•</span><span>{n}</span></li>)}
                      </ul>
                    </div>
                    <p className="text-[9px] text-[#8C887D] italic border-t border-[#316EC9]/20 pt-2">{aiGuidance.disclaimer}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-[#8C887D]">Your Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. David Kiprop"
                    value={claimantName}
                    onChange={(e) => setClaimantName(e.target.value)}
                    className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-[#8C887D]">Active Contact Phone *</label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 0712 345678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-[#8C887D]">Provide Brief Description of the Incident *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Detail exactly what happened. (e.g. 'I was driving along Ngong road when a stationary minibus rolled backwards crashing into my composite bumper...')"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 font-medium focus:border-[#316EC9] focus:outline-none"
                />
              </div>

              {/* Secure Media uploads (Police abstract or vehicle photos) */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-[#8C887D] block mb-1">Upload police abstract or damage photographs</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border border-dashed border-[#D8E2F0] bg-white p-4 text-center hover:bg-[#F0F5FC] cursor-pointer transition-colors flex flex-col items-center justify-center space-y-1 rounded-none"
                >
                  <UploadCloud className="h-6 w-6 text-slate-400" />
                  <p className="text-xs uppercase tracking-wider font-bold text-[#1A1A1A]">Click to Select or Drag Files</p>
                  <p className="text-[10px] text-[#8C887D]">PDF, JPG, PNG up to 20MB per upload.</p>
                </div>

                <div className="flex gap-2 items-center justify-end pt-1.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center space-x-1.5 border border-[#D8E2F0] bg-white hover:bg-[#F0F5FC] px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold text-[#1A1A1A] rounded-none transition-colors cursor-pointer"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>Native Camera triggers</span>
                  </button>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*,application/pdf"
                  className="hidden"
                />

                {selectedFile && (
                  <p className="text-[10px] text-emerald-700 font-bold font-mono">
                    ✔️ Selected upload: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
                {photoPreview && (
                  <p className="text-[10px] text-emerald-700 font-bold">Preview attached.</p>
                )}

                {/* AI Claims Photo Evidence Review */}
                {photoPreview && selectedFile?.type.startsWith("image/") && (
                  <div className="border border-[#316EC9]/30 bg-[#F0F5FC] p-4 space-y-3 rounded-none mt-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center space-x-1.5">
                        <Eye className="h-3.5 w-3.5 text-[#316EC9]" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#142C54]">AI Claims Photo Evidence Review</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleReviewPhoto}
                        disabled={isLoadingPhotoReview}
                        className="text-[9px] font-bold uppercase tracking-wider text-white bg-[#316EC9] hover:bg-[#2059ab] px-3 py-1.5 rounded-none cursor-pointer disabled:opacity-50"
                      >
                        {isLoadingPhotoReview ? "Analyzing..." : "Is this photo enough to defend my claim?"}
                      </button>
                    </div>

                    {photoReviewError && <p className="text-[11px] text-red-700">{photoReviewError}</p>}

                    {photoReview && (
                      <div className="space-y-3 text-[11px] text-slate-700 border-t border-[#316EC9]/20 pt-3">
                        <div>
                          <p className="font-bold text-[#142C54] uppercase text-[9px] tracking-wider mb-1">Evidence quality: <span className="text-[#316EC9]">{photoReview.evidenceQuality}</span></p>
                        </div>
                        {photoReview.strengths.length > 0 && (
                          <div>
                            <p className="font-bold text-[#142C54] uppercase text-[9px] tracking-wider mb-1">What this photo shows well</p>
                            <ul className="space-y-1">
                              {photoReview.strengths.map((s, i) => <li key={i} className="flex items-start"><span className="mr-1.5 text-emerald-600 shrink-0">•</span><span>{s}</span></li>)}
                            </ul>
                          </div>
                        )}
                        {photoReview.gaps.length > 0 && (
                          <div>
                            <p className="font-bold text-[#142C54] uppercase text-[9px] tracking-wider mb-1">What's missing or unclear</p>
                            <ul className="space-y-1">
                              {photoReview.gaps.map((g, i) => <li key={i} className="flex items-start"><span className="mr-1.5 text-red-600 shrink-0">•</span><span>{g}</span></li>)}
                            </ul>
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-[#142C54] uppercase text-[9px] tracking-wider mb-1">Recommendation</p>
                          <p className="leading-relaxed">{photoReview.recommendation}</p>
                        </div>
                        <p className="text-[9px] text-[#8C887D] italic border-t border-[#316EC9]/20 pt-2">{photoReview.disclaimer}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#142C54] hover:bg-[#316EC9] text-white border border-[#142C54] hover:border-[#316EC9] font-bold uppercase tracking-widest py-3.5 text-xs transition-all rounded-none cursor-pointer disabled:opacity-50"
                id="claim-claim-action-btn"
              >
                {isSubmitting ? "Registering on ERP registry..." : "Submit Emergency Claim Notification"}
              </button>

            </form>
          )}

          {/* INTERACTIVE TRACKER TIMELINE ONCE REGISTERED */}
          {claimResponse && (
            <div className="border border-[#D8E2F0] bg-[#FAF9F6] p-5 sm:p-6 text-left space-y-6 shadow-none rounded-none animate-fade-in" id="claim-verification-log-sheet">
              
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-[#D8E2F0] pb-4 gap-4">
                <div className="flex items-center space-x-3 text-emerald-800">
                  <CheckCircle className="h-6 w-6" />
                  <div>
                    <h3 className="font-serif italic text-lg text-[#1A1A1A]">Claim Notice Dispatched</h3>
                    <p className="text-[10px] text-[#8C887D]">Unique Ref: <strong className="text-slate-800 font-mono text-[11px]">{claimResponse.claimId}</strong></p>
                  </div>
                </div>
                <button
                  onClick={handleCloseSuccess}
                  className="bg-[#142C54] hover:bg-[#316EC9] text-white border border-[#142C54] hover:border-[#316EC9] px-4 py-2 text-[10px] uppercase tracking-widest font-bold transition-all rounded-none cursor-pointer"
                >
                  Go to Dashboard
                </button>
              </div>

              {/* Case Representative details */}
              <div className="bg-white border border-[#D8E2F0] p-4 space-y-2 text-xs text-left rounded-none" id="officer-assignment-box">
                <p className="font-bold text-[#316EC9] uppercase tracking-wider text-[9px]">CASE OFFICER ASSIGNED:</p>
                <div className="flex justify-between items-center text-[#1A1A1A]">
                  <div>
                    <h5 className="font-serif italic text-sm">{claimResponse.assignedOfficer}</h5>
                    <p className="text-[#8C887D] font-mono text-[10px]">Senior Claims Dispute Representative</p>
                  </div>
                  <span className="border border-[#316EC9] text-[#316EC9] bg-[#F0F5FC] px-2 py-0.5 text-[9px] uppercase tracking-wider font-bold animate-pulse">Direct Case Assigned</span>
                </div>
                <p className="text-[10px] text-slate-700 border-t border-[#D8E2F0] pt-2 italic leading-relaxed">{claimResponse.officerDetails}</p>
              </div>

              {/* Timeline Track updates */}
              <div className="space-y-4">
                <h4 className="text-[9px] font-bold text-[#8C887D] uppercase tracking-widest pl-2 font-mono">Platform Progress Pipeline</h4>
                <div className="relative border-l border-[#D8E2F0] ml-4 space-y-6">
                  {claimResponse.timeline.map((step, idx) => (
                    <div key={idx} className="relative pl-6">
                      {/* circle */}
                      <span className={`absolute -left-[8px] top-0.5 h-3.5 w-3.5 rounded-none border bg-white flex items-center justify-center ${
                        step.completed ? "border-[#316EC9] text-[#316EC9]" : "border-[#D8E2F0] text-[#8C887D]"
                      }`}>
                        {step.completed && <CheckCircle className="h-2 w-2" />}
                      </span>
                      <div className="text-xs">
                        <div className="flex items-center space-x-2 font-bold text-[#1A1A1A]">
                          <span>{step.status}</span>
                          {step.date && <span className="font-mono text-[9px] text-[#316EC9] font-semibold">({new Date(step.date).toLocaleTimeString("en-KE")})</span>}
                        </div>
                        <p className="text-slate-700 font-medium leading-relaxed">{step.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Immediate action requirements */}
              <div className="border border-red-300 bg-red-50/40 p-4 space-y-2 text-xs rounded-none">
                <p className="font-sans text-red-950 font-bold uppercase tracking-wider text-[9px]">⚠️ IMMEDIATE ACTION REQUIRED:</p>
                <div className="space-y-1 text-red-900 leading-relaxed font-sans">
                  {claimResponse.actionGuidance.map((guid, i) => (
                    <p key={i} className="flex items-start">
                      <span className="mr-1.5 leading-none font-bold shrink-0">•</span>
                      <span>{guid}</span>
                    </p>
                  ))}
                </div>
              </div>

            </div>
          )}

        </div>

      </div>

    </div>
  );
}
