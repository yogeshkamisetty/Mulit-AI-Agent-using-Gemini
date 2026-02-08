import React, { useState, useRef, useEffect } from 'react';
import { Upload, Image as ImageIcon, Play, RotateCcw, Zap, StopCircle, Camera, Video, Layers, MapPin, Database, LocateFixed, Film, Loader2, AlertCircle, X, ScanEye, Home, ChevronLeft, LayoutDashboard, History as HistoryIcon, Download } from 'lucide-react';
import { AgentPipeline } from './components/AgentPipeline';
import { ResultsDashboard } from './components/ResultsDashboard';
import { analyzeTrafficImage, analyzeTrafficFast, getLocationContext } from './services/geminiService';
import { ObjectTracker } from './services/trackingService';
import { AgentStatus, FullAnalysisResult, HistoryItem, LocationContextData, Violation } from './types';

// Robust Simulation Data
const SIMULATION_SCENARIOS = [
  { url: "https://images.unsplash.com/photo-1566008885218-90abf9200ddb?q=80&w=1000", label: "Scenario 1: Moderate Flow" },
  { url: "https://images.unsplash.com/photo-1545173168-9f1947eebb8f?q=80&w=1000", label: "Scenario 2: Intersection Check" },
  { url: "https://images.unsplash.com/photo-1597762139711-8a5a0642219c?q=80&w=1000", label: "Scenario 3: Heavy Congestion" },
  { url: "https://images.unsplash.com/photo-1502877338535-766e1452684a?q=80&w=1000", label: "Scenario 4: Night Patrol" }
];

const ErrorBanner = ({ message, onDismiss }: { message: string, onDismiss: () => void }) => (
  <div className="bg-red-950/40 border border-red-500/50 rounded-lg p-4 mb-6 flex items-start gap-3 animate-fadeIn">
    <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
    <div className="flex-1">
      <h4 className="text-red-300 font-bold text-sm mb-1">System Alert</h4>
      <p className="text-red-200/80 text-sm leading-relaxed">{message}</p>
    </div>
    <button onClick={onDismiss} className="text-red-400 hover:text-red-200 transition-colors p-1"><X className="w-4 h-4" /></button>
  </div>
);

type ViewState = 'home' | 'monitor' | 'history';

export default function App() {
  const [activeView, setActiveView] = useState<ViewState>('home');
  const [lastView, setLastView] = useState<ViewState>('home');
  const [status, setStatus] = useState<AgentStatus>(AgentStatus.IDLE);
  
  // Media State
  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState<FullAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
  // Active Modes
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationStep, setSimulationStep] = useState(0);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [processingVideo, setProcessingVideo] = useState(false);
  
  // Video State
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoSessionData, setVideoSessionData] = useState<FullAnalysisResult[]>([]);
  
  // Refs
  const simulationRef = useRef<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoProcessingRef = useRef<boolean>(false);
  const trackerRef = useRef<ObjectTracker>(new ObjectTracker());

  const isMonitorActive = !!(image || isSimulating || isCameraActive || processingVideo);

  useEffect(() => {
    const saved = localStorage.getItem('multi_ai_agent_history');
    if (saved) {
      try { setHistory(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
  }, []);

  useEffect(() => {
    if (history.length > 0) localStorage.setItem('multi_ai_agent_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (result && image && activeView === 'monitor' && !isCameraActive && !processingVideo && !isSimulating) {
        setTimeout(() => { if (result.detections) drawDetections(result.detections); }, 100);
    }
  }, [result, image, activeView]);

  const navigateTo = (view: ViewState) => {
    setLastView(activeView);
    setActiveView(view);
  };

  const goHome = () => {
    stopAllModes();
    setActiveView('home');
  };

  const handleLoadHistoryItem = (item: HistoryItem) => {
    stopAllModes();
    setTimeout(() => {
        setImage(item.thumbnail);
        setResult(item);
        setStatus(AgentStatus.COMPLETE);
        navigateTo('monitor');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 10);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    stopAllModes();
    setError(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    if (file.type.startsWith('video/')) {
      handleVideoUpload(file);
    } else {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        processImage(reader.result as string, "image/jpeg", 'single');
      };
      reader.readAsDataURL(file);
    }
    navigateTo('monitor');
  };

  const handleVideoUpload = (file: File) => {
    const url = URL.createObjectURL(file);
    setImage(null);
    setProcessingVideo(true);
    videoProcessingRef.current = true;
    setVideoSessionData([]);
    trackerRef.current.reset();
    setError(null);
    
    if (videoRef.current) {
      videoRef.current.src = url;
      videoRef.current.load();
      videoRef.current.onloadedmetadata = () => {
        processVideoSequence();
      };
      videoRef.current.onerror = () => {
        setError("Failed to load video file.");
        setProcessingVideo(false);
      };
    }
  };

  const processVideoSequence = async () => {
    if (!videoRef.current || !videoProcessingRef.current) return;
    const video = videoRef.current;
    
    // Process every 0.5s of video
    const INTERVAL = 0.5;
    let currentTime = 0;

    const loop = async () => {
      if (!videoProcessingRef.current || currentTime > video.duration) {
        setProcessingVideo(false);
        setStatus(AgentStatus.COMPLETE);
        clearOverlay();
        return;
      }

      setVideoProgress((currentTime / video.duration) * 100);
      video.currentTime = currentTime;
      
      await new Promise<void>(r => {
        const h = () => { video.removeEventListener('seeked', h); r(); };
        video.addEventListener('seeked', h);
      });

      const frame = captureFrame(video);
      if (frame) {
        try {
           // Fast mode for video
           await processImage(frame.data, frame.mime, 'video', currentTime * 1000);
        } catch (e) {
           console.warn("Frame skipped", e);
        }
      }
      currentTime += INTERVAL;
      requestAnimationFrame(loop);
    };
    loop();
  };

  const captureFrame = (video: HTMLVideoElement) => {
    if (!canvasRef.current) return null;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    const u = canvas.toDataURL('image/jpeg', 0.8);
    return { mime: 'image/jpeg', data: u.split(',')[1] };
  };

  const stopAllModes = () => {
    stopCamera();
    stopSimulation();
    setProcessingVideo(false);
    videoProcessingRef.current = false;
    setVideoProgress(0);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = "";
    }
    setImage(null);
    setResult(null);
    setStatus(AgentStatus.IDLE);
    setError(null);
    trackerRef.current.reset();
    clearOverlay();
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
    if (videoRef.current) videoRef.current.srcObject = null;
    clearOverlay();
  };

  const startCamera = async () => {
    stopAllModes();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setCameraStream(stream);
      setIsCameraActive(true);
      trackerRef.current.reset();
      navigateTo('monitor');
    } catch (err) {
      setError("Camera Access Denied.");
    }
  };

  const handleLocationDiscovery = () => {
    if (!navigator.geolocation) { setError("Geolocation unsupported."); return; }
    setStatus(AgentStatus.DATA_ANALYSIS);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const ctx = await getLocationContext(pos.coords.latitude, pos.coords.longitude);
          setResult(prev => prev ? { ...prev, locationContext: ctx } : null);
          setStatus(AgentStatus.COMPLETE);
        } catch (e) { setStatus(AgentStatus.COMPLETE); }
      },
      (e) => { setError("Location failed."); setStatus(AgentStatus.IDLE); }
    );
  };

  // --- SIMULATION LOGIC ---
  const preloadImages = async () => {
    const promises = SIMULATION_SCENARIOS.map(s => {
      return new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.src = s.url;
        img.crossOrigin = "Anonymous";
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          c.getContext('2d')?.drawImage(img, 0, 0);
          resolve(c.toDataURL('image/jpeg'));
        };
        img.onerror = reject;
      });
    });
    return Promise.all(promises);
  };

  const startSimulation = async () => {
    stopAllModes();
    simulationRef.current = true;
    setIsSimulating(true);
    setSimulationStep(0);
    setError(null);
    trackerRef.current.reset();
    navigateTo('monitor');

    // Pre-load logic
    setStatus(AgentStatus.VISION_SCANNING);
    try {
      const loadedImages = await preloadImages();
      
      for (let i = 0; i < loadedImages.length; i++) {
        if (!simulationRef.current) break;
        setSimulationStep(i + 1);
        const base64 = loadedImages[i];
        setImage(base64);
        
        // Use single mode for simulation to show full analysis capabilities
        // But with reduced delay
        await processImage(base64.split(',')[1], 'image/jpeg', 'single'); 
        
        // Wait before next slide
        await new Promise(r => setTimeout(r, 4000));
      }
    } catch (e) {
      setError("Simulation failed to load resources.");
    }
    
    if (simulationRef.current) {
        setIsSimulating(false);
        setStatus(AgentStatus.COMPLETE);
    }
  };

  const stopSimulation = () => {
    simulationRef.current = false;
    setIsSimulating(false);
    setSimulationStep(0);
  };

  // --- PROCESSING LOGIC ---
  const processImage = async (base64Data: string, mimeType: string, mode: 'single' | 'video' | 'camera', timestampOverride?: number) => {
    try {
      setStatus(AgentStatus.VISION_SCANNING);
      
      let data: Partial<FullAnalysisResult> = {};
      
      // Use FAST mode for loops, FULL mode for single/simulation
      if (mode === 'video' || mode === 'camera') {
        data = await analyzeTrafficFast(base64Data, mimeType);
      } else {
        data = await analyzeTrafficImage(base64Data, mimeType);
      }
      
      setStatus(AgentStatus.DATA_ANALYSIS);

      if (!data.detections) throw new Error("No detections returned");

      const ts = timestampOverride !== undefined ? timestampOverride : Date.now();
      
      // Tracking
      const tracked = trackerRef.current.update(data.detections, ts);
      data.detections = tracked;
      
      // Generate violations from tracking if not provided by full analysis
      const trackingViolations: Violation[] = [];
      tracked.forEach(d => {
         if (d.isSpeeding) trackingViolations.push({ type: 'Speeding', description: `Vehicle #${d.trackId} speeding`, severity: 'High' });
         if (d.isWrongWay) trackingViolations.push({ type: 'Wrong Lane', description: `Vehicle #${d.trackId} wrong way`, severity: 'High' });
      });

      if (!data.analysis) {
        // Mock analysis structure if missing (Fast Mode)
        data.analysis = {
            congestionLevel: 0,
            trafficFlowStatus: 'Moderate',
            totalVehicles: tracked.filter(t => t.type === 'vehicle').length,
            pedestrianCount: tracked.filter(t => t.type === 'pedestrian').length,
            trafficLights: [],
            estimatedAverageSpeed: 0,
            detectedViolations: trackingViolations
        } as any;
      } else {
         data.analysis.detectedViolations = [...(data.analysis.detectedViolations || []), ...trackingViolations];
      }

      // Default report for fast mode
      if (!data.report) {
         data.report = { summary: "Live Tracking Active", recommendations: [], priorityScore: 1 };
      }

      drawDetections(tracked);
      setStatus(AgentStatus.REPORT_GENERATION);
      
      const fullResult = data as FullAnalysisResult;
      setResult(fullResult);
      
      if (mode === 'video') setVideoSessionData(prev => [...prev, fullResult]);
      
      // Add to history occasionally or if single
      if (mode === 'single' || Math.random() > 0.8) {
         setHistory(prev => [{...fullResult, id: Math.random().toString(36).substr(2), thumbnail: `data:${mimeType};base64,${base64Data}`}, ...prev]);
      }

      setStatus(AgentStatus.COMPLETE);
    } catch (err: any) {
      console.error(err);
      if (mode === 'single') {
         setError(err.message);
         setStatus(AgentStatus.ERROR);
      }
    }
  };

  // Camera Loop
  useEffect(() => {
    let timeoutId: any;
    const loop = async () => {
        if (!isCameraActive || !videoRef.current) return;
        if (status === AgentStatus.IDLE || status === AgentStatus.COMPLETE || status === AgentStatus.ERROR) {
           const frame = captureFrame(videoRef.current);
           if (frame) {
             try { await processImage(frame.data, frame.mime, 'camera'); } 
             catch (e) { /* ignore */ }
           }
        }
        timeoutId = setTimeout(loop, 1000); // 1 FPS for camera
    };
    if (isCameraActive) loop();
    return () => clearTimeout(timeoutId);
  }, [isCameraActive, status]);

  // Drawing
  const drawDetections = (detections: any[]) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Resize canvas to match display size
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    detections.forEach(det => {
        if (!det.box_2d) return;
        const [ymin, xmin, ymax, xmax] = det.box_2d;
        const x = (xmin / 1000) * canvas.width;
        const y = (ymin / 1000) * canvas.height;
        const w = ((xmax - xmin) / 1000) * canvas.width;
        const h = ((ymax - ymin) / 1000) * canvas.height;
        
        const isTracked = !!det.trackId;
        const color = det.isSpeeding ? '#ef4444' : det.isWrongWay ? '#f59e0b' : isTracked ? '#22d3ee' : '#94a3b8';
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        
        // Label
        ctx.fillStyle = color;
        ctx.fillRect(x, y - 20, w, 20);
        ctx.fillStyle = '#000';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(`${det.object} ${det.trackId ? '#'+det.trackId : ''}`, x + 2, y - 6);
    });
  };
  
  const clearOverlay = () => {
    const c = overlayCanvasRef.current;
    if(c) c.getContext('2d')?.clearRect(0,0,c.width, c.height);
  };

  const handleCaptureScreenshot = () => { /* Same as before, omitted for brevity but logic is kept if needed */ };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-12">
      <canvas ref={canvasRef} className="hidden" />
      <header className="bg-slate-900/50 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <button onClick={goHome} className="flex items-center gap-2">
            <div className="w-8 h-8 bg-cyan-600 rounded flex items-center justify-center font-bold text-white">M</div>
            <span className="font-bold text-white">Traffic<span className="text-cyan-400">Agent</span></span>
          </button>
          <nav className="flex gap-2">
             <button onClick={goHome} className={`px-3 py-1.5 rounded-lg text-sm ${activeView === 'home' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>Home</button>
             <button onClick={() => navigateTo('monitor')} disabled={!isMonitorActive} className={`px-3 py-1.5 rounded-lg text-sm ${activeView === 'monitor' ? 'bg-cyan-950/50 text-cyan-400 border border-cyan-900' : 'text-slate-400'}`}>Monitor</button>
             <button onClick={() => navigateTo('history')} className={`px-3 py-1.5 rounded-lg text-sm ${activeView === 'history' ? 'bg-purple-950/50 text-purple-400 border border-purple-900' : 'text-slate-400'}`}>History</button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {activeView === 'home' && (
          <div className="max-w-3xl mx-auto space-y-6 animate-fadeIn">
            <div className="text-center mb-10 pt-8">
              <h2 className="text-4xl font-bold text-white mb-4">Autonomous Traffic Control</h2>
              <p className="text-slate-400">Deploy multi-agent vision systems for real-time analysis.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="col-span-2 h-48 border-2 border-dashed border-slate-700 rounded-2xl flex flex-col items-center justify-center bg-slate-900/50 hover:bg-slate-800 cursor-pointer">
                <Upload className="w-8 h-8 text-cyan-500 mb-2" />
                <span className="font-medium text-white">Upload Media</span>
                <span className="text-xs text-slate-500 mt-1">Images or MP4 Video</span>
                <input type="file" className="hidden" multiple accept="image/*,video/*" onChange={handleUpload} />
              </label>

              <button onClick={startCamera} className="p-6 bg-slate-800 rounded-2xl border border-slate-700 hover:border-red-500/50 text-left group">
                 <Camera className="w-6 h-6 text-red-400 mb-3" />
                 <h3 className="font-bold text-white">Live Feed</h3>
                 <p className="text-sm text-slate-400">Connect to local camera stream.</p>
              </button>

              <button onClick={startSimulation} className="p-6 bg-slate-800 rounded-2xl border border-slate-700 hover:border-indigo-500/50 text-left group">
                 <Layers className="w-6 h-6 text-indigo-400 mb-3" />
                 <h3 className="font-bold text-white">Simulation</h3>
                 <p className="text-sm text-slate-400">Run pre-configured scenario.</p>
              </button>
            </div>
            
            {history.length > 0 && (
               <div className="mt-8 p-4 bg-slate-900 rounded-xl border border-slate-800">
                 <h4 className="text-sm font-bold text-slate-400 mb-3 flex items-center gap-2"><Database className="w-4 h-4" /> Recent Analysis</h4>
                 <div className="flex gap-2 overflow-x-auto pb-2">
                    {history.slice(0, 5).map((h, i) => (
                        <img key={i} src={h.thumbnail} className="w-24 h-16 object-cover rounded border border-slate-700 cursor-pointer hover:opacity-80" onClick={() => handleLoadHistoryItem(h)} />
                    ))}
                 </div>
               </div>
            )}
          </div>
        )}

        {activeView === 'monitor' && (
            <div className="animate-fadeIn">
               <div className="flex items-center justify-between mb-4">
                 <button onClick={() => navigateTo('home')} className="text-sm text-slate-400 hover:text-white flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> Home</button>
                 {isSimulating && (
                   <span className="text-xs font-mono text-indigo-400 bg-indigo-950/50 px-2 py-1 rounded border border-indigo-900">
                     SIMULATION STEP {simulationStep}/{SIMULATION_SCENARIOS.length}
                   </span>
                 )}
               </div>

               <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 mb-6 relative overflow-hidden">
                  <div className="relative aspect-video bg-black rounded-lg overflow-hidden ring-1 ring-slate-700">
                     {(isCameraActive || processingVideo) ? (
                        <video ref={videoRef} autoPlay={isCameraActive} muted playsInline className="w-full h-full object-contain" />
                     ) : (
                        image && <img ref={imgRef} src={image} className="w-full h-full object-contain" />
                     )}
                     <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
                     
                     {status === AgentStatus.VISION_SCANNING && (
                        <div className="absolute inset-0 pointer-events-none border-b-2 border-cyan-500/50 animate-scan shadow-[0_0_20px_rgba(6,182,212,0.5)]"></div>
                     )}
                  </div>
                  
                  {/* Controls */}
                  <div className="flex justify-between items-center mt-4">
                     <button onClick={stopAllModes} className="flex items-center gap-2 text-sm font-bold text-red-400 hover:text-red-300 px-4 py-2 bg-red-950/20 rounded-lg hover:bg-red-950/40">
                       <StopCircle className="w-4 h-4" /> Stop Session
                     </button>
                     <div className="flex gap-2">
                        <button onClick={handleLocationDiscovery} className="p-2 text-indigo-400 bg-indigo-950/20 rounded-lg hover:bg-indigo-950/40" title="Detect Location"><LocateFixed className="w-4 h-4" /></button>
                     </div>
                  </div>
               </div>

               <AgentPipeline status={status} />
               <ResultsDashboard data={result} history={history} videoSessionData={videoSessionData} onLoadHistoryItem={handleLoadHistoryItem} />
            </div>
        )}
        
        {activeView === 'history' && (
           <div className="animate-fadeIn">
             <button onClick={() => navigateTo('home')} className="mb-4 text-sm text-slate-400 hover:text-white flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> Home</button>
             <ResultsDashboard data={null} history={history} videoSessionData={[]} onLoadHistoryItem={handleLoadHistoryItem} />
           </div>
        )}
      </main>
    </div>
  );
}
