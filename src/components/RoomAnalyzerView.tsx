import React, { useState, useEffect, useRef } from "react";
import { RoomAnalysis, ActiveTab } from "../types";
import {
  Sparkles, UploadCloud, CheckCircle, AlertTriangle, Info, ShieldCheck,
  Trash2, Play, Eye, DollarSign, List, Award, Camera, HeartCrack, AlertCircle, MessageCircleQuestion
} from "lucide-react";
import InsuranceAdvisorChat from "./InsuranceAdvisorChat";

interface RoomAnalyzerViewProps {
  setActiveTab: (tab: ActiveTab) => void;
  onAnalysisSuccess: (analysis: RoomAnalysis, imageSrc: string) => void;
}

const compressImage = (
  dataUrl: string, 
  callback: (compressedDataUrl: string, compressedBlob: Blob) => void
) => {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    let width = img.width;
    let height = img.height;
    const maxWidth = 1200;
    
    if (width > maxWidth) {
      height = Math.round((height * maxWidth) / width);
      width = maxWidth;
    }
    
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(img, 0, 0, width, height);
      const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.8);
      canvas.toBlob((blob) => {
        if (blob) {
          callback(compressedDataUrl, blob);
        }
      }, "image/jpeg", 0.8);
    }
  };
  img.src = dataUrl;
};

export default function RoomAnalyzerView({ setActiveTab, onAnalysisSuccess }: RoomAnalyzerViewProps) {
  const [mode, setMode] = useState<"scan" | "advisor">("scan");
  const [roomType, setRoomType] = useState<string>("Living Room");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<number>(0);
  const [analysisResult, setAnalysisResult] = useState<RoomAnalysis | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showWebcam, setShowWebcam] = useState<boolean>(false);
  const [savedAnalyses, setSavedAnalyses] = useState<{ id: string; date: string; analysis: RoomAnalysis; img: string }[]>([]);
  const [activeResultTab, setActiveResultTab] = useState<"organize" | "safety" | "inventory" | "premium">("organize");
  const [privacyConsent, setPrivacyConsent] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);

  // Cleanup camera stream when showWebcam turns false, or when unmounting
  useEffect(() => {
    return () => {
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((track) => track.stop());
        activeStreamRef.current = null;
      }
    };
  }, [showWebcam]);

  const roomTypesList = [
    "Living Room", "Kitchen", "Bedroom", "Home Office", "Dining Room", "Kids Playroom", "Basement / Garage"
  ];

  const reassuringMessages = [
    "Scanning image layout and geometry surface space...",
    "Filing objects and categorizing furniture items...",
    "Evaluating surface clutter density levels...",
    "Detecting fire, electrical, and physical trip hazards...",
    "Estimating replacement contents costs in Shillings (KES)...",
    "Calculating Domestic Package property insurance premiums...",
    "Generating ultimate declutter tips and organizing checklists..."
  ];

  // Rotate reassuring loader messages
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isAnalyzing) {
      timer = setInterval(() => {
        setLoadingStep((prev) => (prev + 1) % reassuringMessages.length);
      }, 2500);
    } else {
      setLoadingStep(0);
    }
    return () => clearInterval(timer);
  }, [isAnalyzing]);

  // Load saved analysis history from localStorage
  useEffect(() => {
    try {
      const existing = localStorage.getItem("utmost_analyzed_rooms");
      if (existing) {
        setSavedAnalyses(JSON.parse(existing));
      }
    } catch (e) {
      console.error("Local storage read error:", e);
    }
  }, []);

  // Handle Drag / Drop files
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Please select an image file (PNG, JPG, or JPEG).");
      return;
    }
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const rawDataUrl = e.target.result as string;
        compressImage(rawDataUrl, (compressedDataUrl, compressedBlob) => {
          setPreviewUrl(compressedDataUrl);
          const compressedFile = new File([compressedBlob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: "image/jpeg" });
          setSelectedFile(compressedFile);
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  // Webcam actions (captures live client image)
  const startCamera = async () => {
    setShowWebcam(true);
    setPreviewUrl(null);
    setSelectedFile(null);
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      activeStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.error("Camera access failed:", err);
      setErrorMsg("Failed to open camera. Please grant permissions or select a pre-captured photo.");
      setShowWebcam(false);
    }
  };

  const stopCamera = () => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setShowWebcam(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      const context = canvas.getContext("2d");
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg");
        
        compressImage(dataUrl, (compressedDataUrl, compressedBlob) => {
          setPreviewUrl(compressedDataUrl);
          const file = new File([compressedBlob], `room-camera-${Date.now()}.jpg`, { type: "image/jpeg" });
          setSelectedFile(file);
          stopCamera();
        });
      }
    }
  };

  // Submit base64 to server API
  const handleAnalyzeSubmit = async () => {
    if (!previewUrl) {
      setErrorMsg("Please upload, drag, or capture a room photo first.");
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg(null);
    setAnalysisResult(null);

    try {
      const response = await fetch("/api/analyze-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: previewUrl,
          mimeType: selectedFile?.type || "image/jpeg",
          roomType: roomType
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned code ${response.status}: Failed analysis.`);
      }

      const rawResult = await response.json();
      if (rawResult.error) {
        throw new Error(rawResult.error);
      }

      setAnalysisResult(rawResult);
      onAnalysisSuccess(rawResult, previewUrl);

      // Save to localStorage history
      const newSavedItem = {
        id: `scan-${Date.now()}`,
        date: new Date().toLocaleDateString("en-KE", { hour: "2-digit", minute: "2-digit" }),
        analysis: rawResult,
        img: previewUrl
      };

      const updatedHistory = [newSavedItem, ...savedAnalyses].slice(0, 10); // Keep last 10 scans
      setSavedAnalyses(updatedHistory);
      localStorage.setItem("utmost_analyzed_rooms", JSON.stringify(updatedHistory));

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to make contact with AI servers. Please verify active networks.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDiscard = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setAnalysisResult(null);
    setErrorMsg(null);
  };

  const loadSavedAnalysis = (saved: any) => {
    setPreviewUrl(saved.img);
    setRoomType(saved.analysis.roomType);
    setAnalysisResult(saved.analysis);
    setErrorMsg(null);
  };

  const handleDeleteSaved = (idObj: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = savedAnalyses.filter(item => item.id !== idObj);
    setSavedAnalyses(filtered);
    localStorage.setItem("utmost_analyzed_rooms", JSON.stringify(filtered));
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 font-sans text-left space-y-12" id="room-analyzer-view">
      
      {/* HEADER INTRODUCTION */}
      <div className="border-b border-[#D8E2F0] pb-6">
        <p className="text-[10px] uppercase font-bold text-[#316EC9] tracking-[0.25em] mb-1">Interactive Risk Surveyor</p>
        <h1 className="text-3xl font-serif italic tracking-tight text-[#1A1A1A]">
          Home Decluttering & Property Risk AI Surveyor
        </h1>
        <p className="mt-1.5 text-xs text-[#8C887D] max-w-4xl leading-relaxed">
          Get real-time space organization advice, identify fire, electrical and physical hazards, estimate contents replacement valuations, and comparative package quotes - or ask our AI assistant any general insurance or risk question. Fully authorized and powered by Google Gemini.
        </p>
      </div>

      {/* MODE SWITCHER: room-photo property scan vs general insurance/risk Q&A */}
      <div className="flex border-b border-[#D8E2F0] bg-[#FAF9F6] p-1 max-w-lg shrink-0" id="ai-tool-mode-switcher">
        <button
          onClick={() => setMode("scan")}
          className={`flex-grow flex items-center justify-center space-x-2 py-3 text-[10px] uppercase tracking-wider font-bold transition-all cursor-pointer ${
            mode === "scan" ? "bg-[#142C54] text-white" : "text-[#8C887D] hover:text-[#316EC9]"
          }`}
        >
          <Camera className="h-3.5 w-3.5" />
          <span>Property Risk Scan</span>
        </button>
        <button
          onClick={() => setMode("advisor")}
          className={`flex-grow flex items-center justify-center space-x-2 py-3 text-[10px] uppercase tracking-wider font-bold transition-all cursor-pointer ${
            mode === "advisor" ? "bg-[#142C54] text-white" : "text-[#8C887D] hover:text-[#316EC9]"
          }`}
        >
          <MessageCircleQuestion className="h-3.5 w-3.5" />
          <span>Ask About Insurance</span>
        </button>
      </div>

      {mode === "advisor" && <InsuranceAdvisorChat />}

      {mode === "scan" && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: CONTROLS, UPLOADER, & HISTORY LIST */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* CONTROL MODULE CARD */}
          <div className="border border-[#D8E2F0] bg-[#FAF9F6] p-6 space-y-5 rounded-none shadow-xs">
            <h3 className="font-serif italic text-lg text-[#1A1A1A] flex items-center space-x-2 border-b border-[#D8E2F0] pb-2">
              <Sparkles className="h-4 w-4 text-[#316EC9]" />
              <span>1. Choose Specifications</span>
            </h3>

            {/* Room Type Selector */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Target Space Classification</label>
              <select
                value={roomType}
                onChange={(e) => setRoomType(e.target.value)}
                className="w-full bg-white rounded-none border border-[#D8E2F0] px-3 py-2 text-xs font-semibold uppercase tracking-wider focus:border-[#316EC9] focus:outline-none"
                id="analyzer-room-type-picker"
              >
                {roomTypesList.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Data Privacy & Consent (TODO: finalize official legal copy) */}
            <div className="bg-blue-50/40 border border-blue-200/60 p-4 space-y-2.5 rounded-none">
              <div className="flex items-start space-x-2.5">
                <input
                  type="checkbox"
                  id="privacy-consent-checkbox"
                  checked={privacyConsent}
                  onChange={(e) => setPrivacyConsent(e.target.checked)}
                  className="h-4 w-4 text-[#316EC9] border-[#D8E2F0] focus:ring-[#316EC9] mt-0.5 cursor-pointer"
                />
                <label htmlFor="privacy-consent-checkbox" className="text-xs text-[#142C54] leading-relaxed cursor-pointer font-medium select-none">
                  <strong>Data Privacy & Image Consent (TODO)</strong>
                  <span className="block mt-1 text-[10px] text-[#8C887D]">
                    By checking this box, I authorize Utmost Insurance Brokers Kenya to process this photograph via secure Google Gemini AI. I understand images are analyzed transiently in real-time to generate risk surveys and property contents valuations, and are not permanently retained or used for AI training.
                  </span>
                </label>
              </div>
            </div>

            {/* Uploader / Webcam Workspace */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Upload or Capture Space Photo</label>
              
              {/* Webcam Live Frame */}
              {showWebcam && (
                <div className="relative overflow-hidden bg-[#1A1A1A] border border-[#D8E2F0] rounded-none" id="webcam-viewer-frame">
                  <video ref={videoRef} className="w-full h-48 object-cover" autoPlay playsInline />
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center space-x-2">
                    <button
                      onClick={capturePhoto}
                      className="bg-[#316EC9] text-white hover:bg-[#142C54] border border-[#316EC9] px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-none shadow-sm transition-all cursor-pointer"
                    >
                      Capture Frame
                    </button>
                    <button
                      onClick={stopCamera}
                      className="bg-[#1A1A1A] px-3 py-1.5 text-[10px] font-bold text-[#8C887D] hover:text-white rounded-none uppercase tracking-wider cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Normal Box */}
              {!showWebcam && !previewUrl && (
                <div
                  onDragOver={privacyConsent ? handleDragOver : (e) => e.preventDefault()}
                  onDrop={privacyConsent ? handleDrop : (e) => e.preventDefault()}
                  onClick={() => {
                    if (!privacyConsent) {
                      setErrorMsg("Please accept the Data Privacy & Image Consent terms above before uploading.");
                      return;
                    }
                    fileInputRef.current?.click();
                  }}
                  className={`group border border-dashed p-6 text-center transition-all flex flex-col items-center justify-center space-y-2 h-44 rounded-none ${
                    privacyConsent 
                      ? "cursor-pointer border-[#D8E2F0] bg-white hover:border-[#316EC9]" 
                      : "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-450"
                  }`}
                  id="drag-drop-zone-workspace"
                >
                  <UploadCloud className={`h-6 w-6 ${privacyConsent ? "text-[#8C887D] group-hover:text-[#316EC9]" : "text-gray-300"}`} />
                  <p className={`text-xs uppercase tracking-wider font-bold ${privacyConsent ? "text-[#1A1A1A]" : "text-gray-400"}`}>Drag & Drop Space Photo here</p>
                  <p className="text-[10px] text-[#8C887D]">or click to browse local catalog (JPEG, PNG up to 20MB)</p>
                </div>
              )}

              {/* Preview Box */}
              {previewUrl && !showWebcam && (
                <div className="relative overflow-hidden border border-[#D8E2F0] bg-white h-44 group rounded-none" id="preview-image-workspace">
                  <img src={previewUrl} alt="Room preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-[#1A1A1A]/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2 pointer-events-auto">
                    <button
                      onClick={() => {
                        if (!privacyConsent) {
                          setErrorMsg("Please accept the Data Privacy & Image Consent terms above.");
                          return;
                        }
                        fileInputRef.current?.click();
                      }}
                      className="bg-white text-[#1A1A1A] border border-[#FAF9F6] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider hover:bg-[#FAF9F6] transition-colors rounded-none cursor-pointer"
                    >
                      Replace
                    </button>
                    <button
                      onClick={handleDiscard}
                      className="bg-red-700 text-white border border-red-700 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider hover:bg-red-800 transition-colors rounded-none cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}

              {/* Hidden file input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
                id="analyzer-file-input-raw"
              />

              {/* Trigger WebCam Capture option */}
              {!showWebcam && !previewUrl && (
                <button
                  type="button"
                  disabled={!privacyConsent}
                  onClick={startCamera}
                  className={`w-full inline-flex items-center justify-center space-x-1.5 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors rounded-none ${
                    privacyConsent 
                      ? "bg-white hover:bg-[#F0F5FC] border border-[#D8E2F0] text-[#1A1A1A] cursor-pointer" 
                      : "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  <Camera className={`h-3.5 w-3.5 ${privacyConsent ? "text-[#1A1A1A]" : "text-gray-300"}`} />
                  <span>Use Device Camera</span>
                </button>
              )}
            </div>

            {/* ERROR DISPLAY */}
            {errorMsg && (
              <div className="bg-red-50 p-3 text-xs font-medium text-red-700 border border-red-100 flex items-start space-x-2 rounded-none">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* ACTION TRIGGERS */}
            {previewUrl && (
              <div className="flex space-x-3 pt-2">
                <button
                  onClick={handleAnalyzeSubmit}
                  disabled={isAnalyzing}
                  id="analyzer-run-btn"
                  className="flex-1 bg-[#142C54] hover:bg-[#316EC9] text-white font-semibold uppercase tracking-wider py-3 text-xs border border-[#142C54] hover:border-[#316EC9] text-center transition-all duration-300 disabled:opacity-50 rounded-none cursor-pointer"
                >
                  <span>Analyze Room Spaces Now</span>
                </button>
                <button
                  onClick={handleDiscard}
                  disabled={isAnalyzing}
                  className="border border-[#D8E2F0] bg-white hover:bg-[#FAF9F6] px-4 py-3 text-xs font-semibold text-[#8C887D] uppercase tracking-wider rounded-none cursor-pointer"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* BACKGROUND LOADER OVERLAY */}
          {isAnalyzing && (
            <div className="border border-[#316EC9]/30 bg-[#FAF9F6] p-6 text-center space-y-4 animate-pulse relative rounded-none" id="room-analyzer-pulse-loader">
              <div className="mx-auto h-12 w-12 border border-[#316EC9] bg-white p-2 text-[#316EC9] flex items-center justify-center rounded-none">
                <Sparkles className="h-5 w-5 animate-spin" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-[#316EC9] uppercase tracking-widest font-mono">Server-Side Analyzer Running...</p>
                <div className="h-1.5 w-32 bg-[#D8E2F0] mx-auto overflow-hidden rounded-none">
                  <div className="bg-[#316EC9] h-full" style={{ width: "60%" }}></div>
                </div>
              </div>
              <p className="text-xs font-serif italic text-[#1A1A1A] max-w-sm mx-auto leading-relaxed">
                "{reassuringMessages[loadingStep]}"
              </p>
            </div>
          )}

          {/* LOCAL SCANS HISTORY */}
          {savedAnalyses.length > 0 && (
            <div className="border border-[#D8E2F0] bg-[#FAF9F6] p-5 space-y-3 rounded-none" id="local-history-dashboard">
              <h4 className="text-[9px] font-bold text-[#8C887D] uppercase tracking-widest">Scans History Cache ({savedAnalyses.length})</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {savedAnalyses.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => loadSavedAnalysis(item)}
                    id={`history-item-btn-${item.id}`}
                    className="flex items-center justify-between p-2 border border-[#D8E2F0] bg-white hover:bg-slate-100 cursor-pointer transition-colors rounded-none"
                  >
                    <div className="flex items-center space-x-2 text-left">
                      <img src={item.img} alt="mini" className="w-10 h-10 object-cover rounded-none border border-[#D8E2F0]" />
                      <div>
                        <p className="text-xs font-bold text-[#1A1A1A]">{item.analysis.roomType}</p>
                        <p className="font-mono text-[9px] text-[#8C887D]">{item.date} • Clutter: {item.analysis.clutterScore}/10</p>
                      </div>
                    </div>
                    <div className="flex space-x-1.5 items-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); loadSavedAnalysis(item); }}
                        className="p-1 text-[#8C887D] hover:text-[#1A1A1A] cursor-pointer"
                        title="Display Analysis"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteSaved(item.id, e)}
                        className="p-1 text-[#8C887D] hover:text-red-700 cursor-pointer"
                        title="Delete cached item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* RIGHT COLUMN: DETAILED REPORT SHOWCASE */}
        <div className="lg:col-span-7">
          
          {/* PLACEHOLDER WHEN EMPTY */}
          {!analysisResult && !isAnalyzing && (
            <div className="border border-[#D8E2F0] bg-[#FAF9F6] border-dashed p-12 text-center flex flex-col items-center justify-center space-y-4 h-[500px] rounded-none" id="empty-report-placeholder">
              <div className="border border-[#D8E2F0] p-4 text-[#8C887D] bg-white rounded-none">
                <List className="h-8 w-8 text-neutral-300" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-serif italic text-[#1A1A1A]">Audit Report Workspace</h3>
                <p className="text-xs text-[#8C887D] max-w-sm mx-auto leading-relaxed">
                  Select a room type classification above and submit/capture a floor photograph. Google Gemini AI will inspect layout geometries, flag hazard coordinates, catalog belongings and extract local policy quotes.
                </p>
              </div>
            </div>
          )}

          {/* DYNAMIC ANALYSIS COMPLETED ACTIONS CONTAINER */}
          {analysisResult && !isAnalyzing && (
            <div className="space-y-6" id="completed-actions-report-container">
              
              {/* PRIMARY KPI GAUGE SCORE CARD */}
              <div className="border border-[#D8E2F0] bg-[#FAF9F6] p-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-center rounded-none shadow-xs">
                
                {/* SVG Radial Speedometer Gauge */}
                <div className="md:col-span-4 flex flex-col items-center border-r md:border-r-[#D8E2F0] md:pr-4">
                  <div className="relative h-24 w-24">
                    <svg className="h-full w-full" viewBox="0 0 36 36">
                      <path
                        className="text-[#D8E2F0]"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-[#316EC9]"
                        strokeDasharray={`${(10 - analysisResult.clutterScore) * 10}, 100`}
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="square"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-serif italic text-[#1A1A1A]">{100 - (analysisResult.clutterScore * 10)}%</span>
                      <span className="text-[8px] uppercase font-bold tracking-wider text-[#8C887D]">Harmony Score</span>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-8 text-left space-y-2">
                  <div className="inline-flex border border-[#316EC9] text-[#316EC9] px-2.5 py-0.5 text-[10px] uppercase font-mono tracking-wider font-bold">
                    Room status: {analysisResult.status}
                  </div>
                  <h3 className="text-xl font-serif italic text-[#1A1A1A]">{analysisResult.roomType} Assessment Complete</h3>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    Based on visual clutter density elements, this space registers a <span className="font-bold text-[#1A1A1A]">{100 - (analysisResult.clutterScore * 10)}% spatial harmony index</span>. Fixing the safety risks detailed below reduces structural fire liabilities and yields premium advantages.
                  </p>
                </div>

              </div>

              {/* TABS NAVIGATION BAR */}
              <div className="flex border-b border-[#D8E2F0] bg-[#FAF9F6] p-1 shrink-0 rounded-none font-mono text-[10px]" id="report-tabs-menubar">
                {[
                  { id: "organize" as const, label: "AI Suggestions", icon: Sparkles },
                  { id: "safety" as const, label: "Safety Risks", icon: AlertTriangle },
                  { id: "inventory" as const, label: "Belongings List", icon: List },
                  { id: "premium" as const, label: "Quotes", icon: DollarSign }
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      id={`result-tab-btn-${tab.id}`}
                      onClick={() => setActiveResultTab(tab.id)}
                      className={`flex-1 flex items-center justify-center space-x-1.5 py-2.5 text-[9px] uppercase tracking-wider font-bold rounded-none transition-all cursor-pointer ${
                        activeResultTab === tab.id
                          ? "bg-[#142C54] text-[#FAF9F6]"
                          : "text-[#8C887D] hover:text-[#142C54]"
                      }`}
                    >
                      <Icon className="h-3 w-3 shrink-0" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* TABS CONTENT SHEETS */}
              <div className="border border-[#D8E2F0] bg-white p-6 space-y-4 rounded-none shadow-xs text-left" id="report-tabs-content">
                
                {/* 1. ORGANIZATION SUGGESTIONS SHEET */}
                {activeResultTab === "organize" && (
                  <div className="space-y-4 text-left" id="tab-content-organize">
                    <h4 className="text-xs uppercase tracking-widest font-bold text-[#316EC9] flex items-center space-x-1 border-b border-[#D8E2F0] pb-2">
                      <Sparkles className="h-4.5 w-4.5" />
                      <span>Actionable Organizing Checklist</span>
                    </h4>
                    <p className="text-xs text-[#8C887D] leading-relaxed italic border-l-2 border-[#316EC9] pl-2 font-serif">
                       "Structured spaces decrease home safety risk and speed up contents cataloging."
                    </p>
                    <div className="space-y-2.5">
                      {analysisResult.organizationSuggestions.map((s, idx) => (
                        <div key={idx} className="flex items-start space-x-3 text-xs leading-relaxed text-slate-700 bg-[#FAF9F6] border border-[#D8E2F0] p-3 rounded-none">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-[#142C54] text-[#FAF9F6] font-mono font-bold text-[9px] rounded-none">
                            {idx + 1}
                          </span>
                          <span>{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. SAFETY RISK AND HAZARDS AUDIT */}
                {activeResultTab === "safety" && (
                  <div className="space-y-4 text-left" id="tab-content-safety">
                    <h4 className="text-xs uppercase tracking-widest font-bold text-red-700 flex items-center space-x-1 border-b border-[#D8E2F0] pb-2">
                      <AlertTriangle className="h-4.5 w-4.5 text-red-600" />
                      <span>Property Hazards Assessment</span>
                    </h4>
                    <div className="space-y-3">
                      {analysisResult.safetyHazards.map((h, idx) => (
                        <div key={idx} className="border border-red-200 bg-red-50/40 p-4 space-y-2 text-xs rounded-none">
                          <div className="flex items-center space-x-2 text-red-950 font-bold font-sans">
                            <span className="h-1.5 w-1.5 bg-red-600"></span>
                            <span>{h.hazardName}</span>
                          </div>
                          <p className="text-slate-705 leading-relaxed pl-4 font-sans">{h.description}</p>
                          <div className="bg-white border border-red-100 p-2.5 pl-4 text-[11px] text-emerald-800 leading-relaxed space-y-1 rounded-none font-sans">
                            <strong className="text-slate-800 block">✔️ PROPOSED RESOLUTION:</strong>
                            {h.fixAction}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. BELONGINGS INVENTORY ESTIMATE */}
                {activeResultTab === "inventory" && (
                  <div className="space-y-4 text-left" id="tab-content-inventory">
                    <div className="flex justify-between items-center pb-2 border-b border-[#D8E2F0]">
                      <h4 className="text-xs uppercase tracking-widest font-bold text-[#1A1A1A]">Detected Contents Logs</h4>
                      <span className="border border-[#D8E2F0] bg-[#FAF9F6] px-2.5 py-0.5 font-mono text-[9px] font-bold text-[#8C887D]">
                        {analysisResult.estimatedItems.length} OBJECT COLLECTIVES
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {analysisResult.estimatedItems.map((item, idx) => (
                        <div key={idx} className="flex items-start justify-between border border-[#D8E2F0] bg-[#FAF9F6] p-3 text-xs gap-4 rounded-none">
                          <div className="space-y-0.5 flex-1">
                            <h5 className="font-bold text-[#1A1A1A] font-sans">{item.itemName}</h5>
                            <p className="text-[11px] text-[#8C887D] leading-relaxed font-serif italic">{item.insuranceTip}</p>
                          </div>
                          <span className="text-xs font-mono font-bold text-[#316EC9] shrink-0">
                            KES {item.estimatedValueKES.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Total valuation summaries */}
                    <div className="bg-[#142C54] text-[#FAF9F6] p-4 flex justify-between items-center rounded-none border border-[#142C54]">
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-slate-350 font-mono">Total Replacement Inventory Valuation</p>
                        <p className="text-[11px] text-[#FAF9F6]/80 font-serif italic">Approved estimation guidelines for Kenyan underwriting</p>
                      </div>
                      <span className="text-lg font-serif italic text-white font-semibold">
                        KES {analysisResult.totalContentsValueKES.toLocaleString()}
                      </span>
                    </div>

                  </div>
                )}

                {/* 4. DOMESTIC PACKAGE COMPLEMENTARY POLICY QUOTES */}
                {activeResultTab === "premium" && (
                  <div className="space-y-4 text-left" id="tab-content-premium">
                    <h4 className="text-xs uppercase tracking-widest font-bold text-[#316EC9] flex items-center space-x-1 border-b border-[#D8E2F0] pb-2 font-serif italic">
                      <ShieldCheck className="h-4.5 w-4.5 text-emerald-600 animate-pulse" />
                      <span>Domestic Package Premium Estimate</span>
                    </h4>

                    <div className="bg-[#F0F5FC] border border-[#D8E2F0] p-4 text-xs font-medium text-[#1A1A1A] leading-relaxed space-y-1 rounded-none">
                      <p className="font-bold text-[#142C54] text-xs">🏡 Standard Home Contents Cover Inclusions:</p>
                      <p className="font-serif italic text-sm text-[#5E5A51]">• Protects against fire, burglary, structural earthquake, storms and household theft.</p>
                      <p className="font-serif italic text-sm text-[#5E5A51]">• Subject to KES 5,000 minimal annual premium under IRA policy rulings in Kenya.</p>
                    </div>

                    {/* Indicative pricing disclaimer */}
                    <div className="border border-[#FFE8B5] bg-[#FFF8E7] p-3 flex items-start space-x-2 text-xs text-[#8A6D3B] rounded-none">
                      <AlertCircle className="h-4 w-4 text-[#C19A4D] shrink-0 mt-0.5" />
                      <p className="font-sans leading-relaxed">
                        <strong className="font-bold">Indicative Cover Disclaimer:</strong> These prices are indicative only and not final. Final confirmation from an Utmost staff representative is required to issue or finalize any quote.
                      </p>
                    </div>

                    {/* Show side by side carrier estimations */}
                    <div className="space-y-3">
                      {[
                        { insurer: "ICEA LION General Insurance Company Limited", id: "icea", rate: 0.012, tag: "Highly Recommended for Contents" },
                        { insurer: "The Heritage Insurance Company Limited", id: "heritage", rate: 0.0135, tag: "Best Claim Response" },
                        { insurer: "CIC General Insurance Limited", id: "cic", rate: 0.014, tag: "Broadest limits" }
                      ].map((carrier, idx) => {
                        // calculate annual rate
                        const base = Math.max(5000, Math.round(analysisResult.totalContentsValueKES * carrier.rate));
                        const pcf = Math.round(base * 0.0025);
                        const itl = Math.round(base * 0.002);
                        const stamp = 40;
                        const total = base + pcf + itl + stamp;

                        return (
                          <div key={idx} className="border border-[#D8E2F0] p-4 space-y-3 hover:border-[#316EC9] transition-all rounded-none bg-white">
                            <div className="flex justify-between items-start">
                              <div className="space-y-1">
                                <h5 className="font-serif italic text-base text-[#1A1A1A]">{carrier.insurer}</h5>
                                <span className="border border-[#316EC9]/30 bg-[#F0F5FC] text-[#316EC9] px-2 py-0.5 text-[9px] uppercase tracking-wider font-semibold">{carrier.tag}</span>
                              </div>
                              <div className="text-right">
                                <span className="font-mono text-[9px] text-[#8C887D] uppercase">Annual Premium</span>
                                <p className="text-base font-bold text-[#142C54]">KES {total.toLocaleString()}</p>
                              </div>
                            </div>
                            
                            <div className="flex flex-wrap justify-between items-center text-[10px] text-[#8C887D] border-t border-[#D8E2F0] pt-2 gap-2">
                              <span>• Base: KES {base.toLocaleString()} | levies: KES {(pcf + itl + stamp).toLocaleString()}</span>
                              <button
                                onClick={() => setActiveTab("portal")}
                                className="bg-[#142C54] hover:bg-[#316EC9] text-white px-3.5 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-all rounded-none border border-[#142C54] hover:border-[#316EC9] cursor-pointer"
                              >
                                Request Cover
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                  </div>
                )}

              </div>

            </div>
          )}

        </div>

      </div>
      )}

    </div>
  );
}
