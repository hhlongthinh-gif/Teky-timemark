import React, { useState, useRef, useCallback, useEffect } from 'react';
import { CameraIcon, LocationIcon, DownloadIcon, SparklesIcon, RefreshIcon } from './components/Icon';
import { GeoLocation, CapturedImage, AppState } from './types';
import PhotoWatermarker from './components/PhotoWatermarker';
import { analyzeImage } from './services/geminiService';
import { sendToGoogleSheet } from './services/sheetService';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [location, setLocation] = useState<GeoLocation | undefined>(undefined);
  const [locationError, setLocationError] = useState<string>("");
  const [currentImage, setCurrentImage] = useState<CapturedImage | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  
  // User Input State
  const [personnelName, setPersonnelName] = useState("");
  
  const videoRef = useRef<HTMLVideoElement>(null);

  // Helper to get detailed device name
  const getDeviceName = () => {
    const ua = navigator.userAgent;
    
    // Desktop / Laptop detection
    if (/Windows NT/i.test(ua)) return "Laptop/PC (Windows)";
    if (/Macintosh/i.test(ua)) return "Macbook/iMac";
    if (/X11; CrOS/i.test(ua)) return "ChromeBook";
    if (/X11; Linux/i.test(ua)) return "Laptop/PC (Linux)";
    
    // iOS
    if (/iPhone/i.test(ua)) return "iPhone";
    if (/iPad/i.test(ua)) return "iPad";
    
    // Android
    if (/Android/i.test(ua)) {
      // Try to extract specific model from User Agent
      // Format usually: ...; Model Build/... or ...; Model)
      // Regex captures the part before 'Build/' which is typically the model
      const match = ua.match(/;\s*([^;]+)\s+Build\//);
      if (match && match[1]) {
        let model = match[1].trim();
        // Make it friendlier for common brands
        if (model.startsWith("SM-")) return `Samsung ${model}`;
        if (model.includes("Pixel")) return `Google ${model}`;
        return model;
      }
      
      // Fallback for Samsung if regex fails but keyword exists
      if (/Samsung/i.test(ua)) return "Samsung Device";
      return "Android Device";
    }
    
    return "Laptop/PC";
  };

  // --- 1. Camera Handling ---
  const startCamera = async () => {
    if (!personnelName.trim()) {
      alert("Vui lòng nhập tên nhân sự trước khi bắt đầu!");
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      setStream(mediaStream);
      setAppState(AppState.CAMERA);
      setAutoSaved(false);
      setUploadStatus("");
      
      startGeolocation();
    } catch (err) {
      console.error("Camera access denied", err);
      alert("Không thể truy cập camera. Vui lòng cấp quyền.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // --- 2. Geolocation Handling ---
  const startGeolocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Trình duyệt không hỗ trợ định vị.");
      return;
    }
    setLocationError("Đang lấy định vị...");
    navigator.geolocation.watchPosition(
      (pos) => {
        setLocation(prev => ({
          ...prev,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
          address: prev?.address
        }));
        setLocationError("");
      },
      (err) => {
        console.error("Geolocation error", err);
        setLocationError("Không thể lấy vị trí.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const fetchAddress = async (lat: number, lng: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=vi`
      );
      const data = await response.json();
      if (data && data.address) {
        const parts = [];
        if (data.address.house_number) parts.push(data.address.house_number);
        if (data.address.road) parts.push(data.address.road);
        if (data.address.suburb) parts.push(data.address.suburb);
        else if (data.address.neighbourhood) parts.push(data.address.neighbourhood);
        if (data.address.city || data.address.town) parts.push(data.address.city || data.address.town);
        
        return parts.join(", ") || data.display_name;
      }
      return "";
    } catch (e) {
      console.error("Error fetching address", e);
      return "";
    }
  };

  // --- 3. Capture & Process ---
  const capturePhoto = async () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg');

    const capturedLocation = location ? { ...location } : undefined;
    
    setCurrentImage({
      originalDataUrl: dataUrl,
      processedDataUrl: null, 
      location: capturedLocation,
      timestamp: new Date(),
      personnelName: personnelName,
      deviceName: getDeviceName()
    });

    stopCamera();
    setAppState(AppState.PREVIEW);

    if (capturedLocation) {
      const address = await fetchAddress(capturedLocation.lat, capturedLocation.lng);
      if (address) {
        setCurrentImage(prev => prev ? {
          ...prev,
          location: { ...prev.location!, address }
        } : null);
      }
    }
  };

  const handleProcessedImage = useCallback((processedDataUrl: string) => {
    setCurrentImage(prev => prev ? { ...prev, processedDataUrl } : null);
  }, []);

  // --- 4. Auto Save & Send Data ---
  const downloadImage = useCallback(() => {
    if (!currentImage?.processedDataUrl) return;
    const link = document.createElement('a');
    link.href = currentImage.processedDataUrl;
    link.download = `geosnap_${currentImage.personnelName.replace(/\s+/g, '_')}_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [currentImage]);

  const sendData = useCallback(async () => {
    if (!currentImage?.processedDataUrl) return;
    
    setUploadStatus("Đang gửi dữ liệu...");
    const success = await sendToGoogleSheet(currentImage);
    if (success) {
      setUploadStatus("Đã gửi dữ liệu thành công!");
    } else {
      setUploadStatus("Gửi dữ liệu thất bại (Kiểm tra Script URL).");
    }
  }, [currentImage]);

  // Effect handles Auto-save and Auto-send
  useEffect(() => {
    if (appState === AppState.PREVIEW && currentImage?.processedDataUrl && !autoSaved) {
      const timer = setTimeout(() => {
        downloadImage();
        sendData(); // Trigger upload
        setAutoSaved(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [appState, currentImage?.processedDataUrl, autoSaved, downloadImage, sendData]);

  const reset = () => {
    setCurrentImage(null);
    setAnalysisResult("");
    setIsAnalyzing(false);
    setAutoSaved(false);
    setUploadStatus("");
    startCamera();
  };

  const handleAnalyze = async () => {
    if (!currentImage?.processedDataUrl) return;
    setIsAnalyzing(true);
    setAnalysisResult("");
    try {
      const result = await analyzeImage(currentImage.processedDataUrl);
      setAnalysisResult(result);
    } catch (e) {
      setAnalysisResult("Lỗi phân tích.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- UI Renders ---

  // Screen: Landing / Idle
  if (appState === AppState.IDLE) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-dark text-white text-center">
        <div className="mb-6 p-6 bg-surface rounded-full shadow-lg shadow-primary/20">
          <CameraIcon className="w-16 h-16 text-primary" />
        </div>
        <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
          GeoSnap AI
        </h1>
        <p className="text-secondary mb-8">
          Check-in hiện trường & Báo cáo tự động
        </p>

        <div className="w-full max-w-sm mb-8 space-y-4 text-left">
           <div>
             <label className="block text-sm font-medium text-slate-400 mb-1">Tên nhân sự</label>
             <input 
               type="text" 
               value={personnelName}
               onChange={(e) => setPersonnelName(e.target.value)}
               placeholder="Nhập tên của bạn..."
               className="w-full bg-surface border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
             />
           </div>
        </div>

        <button
          onClick={startCamera}
          className={`bg-primary hover:bg-sky-600 text-white font-bold py-4 px-10 rounded-2xl transition-all transform hover:scale-105 shadow-xl flex items-center gap-3 text-lg ${!personnelName.trim() ? 'opacity-50 cursor-not-allowed hover:scale-100' : ''}`}
        >
          <CameraIcon className="w-6 h-6" />
          Bắt đầu Chụp
        </button>
      </div>
    );
  }

  // Screen: Camera Viewfinder
  if (appState === AppState.CAMERA) {
    return (
      <div className="relative h-screen w-full bg-black overflow-hidden flex flex-col">
        {/* Top Bar: Info */}
        <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/70 to-transparent flex flex-col items-center gap-1">
          <div className="text-xs font-bold text-white/80 bg-black/40 px-3 py-1 rounded-full">
            {personnelName}
          </div>
          <div className="flex items-center gap-2 text-white/90 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
            <LocationIcon className={`w-4 h-4 ${location ? 'text-green-400' : 'text-yellow-400 animate-pulse'}`} />
            <span className="text-sm font-medium">
              {location ? `GPS OK: ±${Math.round(location.accuracy)}m` : locationError || "Đang tìm vệ tinh..."}
            </span>
          </div>
        </div>

        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="h-full w-full object-cover"
        />

        <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/80 to-transparent flex justify-center items-center gap-8">
           <button 
             onClick={() => { stopCamera(); setAppState(AppState.IDLE); }}
             className="text-white/70 hover:text-white p-4 rounded-full bg-white/10 backdrop-blur-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
           </button>

           <button
            onClick={capturePhoto}
            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/20 backdrop-blur-sm active:scale-90 transition-transform shadow-[0_0_15px_rgba(255,255,255,0.5)]"
          >
            <div className="w-16 h-16 bg-white rounded-full" />
          </button>
          
           <div className="w-14" />
        </div>
      </div>
    );
  }

  // Screen: Preview & Result
  return (
    <div className="min-h-screen bg-dark flex flex-col">
      {currentImage && (
        <PhotoWatermarker 
          image={currentImage} 
          onProcessed={handleProcessedImage} 
        />
      )}

      {/* Header */}
      <div className="p-4 bg-surface border-b border-white/5 flex justify-between items-center z-20">
        <button onClick={reset} className="text-secondary hover:text-white flex items-center gap-2">
          <RefreshIcon className="w-5 h-5" />
          Chụp mới
        </button>
        <div className="flex flex-col items-end">
           <h2 className="text-white font-semibold text-sm">
             {autoSaved ? "Đã lưu vào máy" : "Đang xử lý..."}
           </h2>
           <span className={`text-xs ${uploadStatus.includes("thành công") ? "text-green-400" : "text-yellow-400"}`}>
             {uploadStatus}
           </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center gap-6">
        
        {/* Image Display */}
        <div className="relative w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-black">
           {currentImage?.processedDataUrl ? (
             <img src={currentImage.processedDataUrl} alt="Captured" className="w-full h-auto" />
           ) : (
             <div className="w-full aspect-[3/4] flex items-center justify-center text-white/50 animate-pulse flex-col gap-2">
               <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
               <span>Đang gắn watermark...</span>
             </div>
           )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 w-full max-w-2xl">
          <button
            onClick={downloadImage}
            disabled={!currentImage?.processedDataUrl}
            className="flex-1 bg-surface hover:bg-slate-700 text-white py-3 px-4 rounded-xl flex items-center justify-center gap-2 border border-white/10 transition-colors disabled:opacity-50"
          >
            <DownloadIcon className="w-5 h-5" />
            Tải ảnh về
          </button>
          
          <button
            onClick={handleAnalyze}
            disabled={!currentImage?.processedDataUrl || isAnalyzing}
            className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
          >
            {isAnalyzing ? (
               <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
               <SparklesIcon className="w-5 h-5" />
            )}
            AI Phân tích
          </button>
        </div>

        {/* AI Analysis Result Card */}
        {analysisResult && (
          <div className="w-full max-w-2xl bg-surface border border-white/10 rounded-2xl p-6 shadow-xl animate-fade-in mb-8">
             <div className="flex items-center gap-3 mb-3 border-b border-white/10 pb-3">
               <SparklesIcon className="w-5 h-5 text-purple-400" />
               <h3 className="text-lg font-semibold text-white">Kết quả phân tích</h3>
             </div>
             <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
               {analysisResult}
             </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;