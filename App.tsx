import React, { useState, useRef, useEffect } from 'react';
import { Upload, Image as ImageIcon, Play, RotateCcw, Zap, StopCircle, Camera, Video, Layers, MapPin, Database, LocateFixed, Film, Loader2, AlertCircle, X, ScanEye, Home, ChevronLeft, LayoutDashboard, History as HistoryIcon, Download, ArrowRight } from 'lucide-react';
import { AgentPipeline } from './components/AgentPipeline';
import { ResultsDashboard } from './components/ResultsDashboard';
import { analyzeTrafficImage, analyzeTrafficFast, getLocationContext } from './services/geminiService';
import { ObjectTracker } from './services/trackingService';
import { AgentStatus, FullAnalysisResult, HistoryItem, LocationContextData, Violation } from './types';

// Robust Simulation Data with Diverse Scenarios
const SIMULATION_SCENARIOS = [
  { url: "https://images.unsplash.com/photo-1566008885218-90abf9200ddb?q=80&w=1000", label: "Scenario 1: Moderate Highway Flow" },
  { url: "https://images.unsplash.com/photo-1545173168-9f1947eebb8f?q=80&w=1000", label: "Scenario 2: Urban Intersection" },
  { url: "https://images.unsplash.com/photo-1597762139711-8a5a0642219c?q=80&w=1000", label: "Scenario 3: Heavy Congestion" },
  { url: "https://images.unsplash.com/photo-1502877338535-766e1452684a?q=80&w=1000", label: "Scenario 4: Night City Patrol" },
  { url: "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?q=80&w=1000", label: "Scenario 5: Rainy Weather" },
  { url: "https://images.unsplash.com/photo-1548685913-fe6678b0d7f3?q=80&w=1000", label: "Scenario 6: Snowy Conditions" },
  { url: "https://images.unsplash.com/photo-1485573489862-2315b93d7c2a?q=80&w=1000", label: "Scenario 7: Foggy Morning" },
  { url: "https://images.unsplash.com/photo-1494522855154-9297ac14b55f?q=80&w=1000", label: "Scenario 8: Tunnel Surveillance" }
];

const ErrorBanner = ({ message, onDismiss }: { message: string, onDismiss: () => void }) => (
  <div className="bg-brand-red/10 border border-brand-red/40 rounded-lg p-4 mb-6 flex items-start gap-3 animate-fadeIn backdrop-blur-md">
    <AlertCircle className="w-5 h-5 text-brand-red shrink-0 mt-0.5" />
    <div className="flex-1">
      <h4 className="text-brand-red font-bold text-sm mb-1">System Alert</h4>
      <p className="text-brand-red/80 text-sm leading-relaxed">{message}</p>
    </div>
    <button onClick={onDismiss} className="text-brand-red hover:text-white transition-colors p-1"><X className="w-4 h-4" /></button>
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
        const resultStr = reader.result as string;
        setImage(resultStr);
        
        // Robust mime type detection
        const mimeMatch = resultStr.match(/^data:(.*);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        
        // Extract raw base64
        const base64 = resultStr.split(',')[1];
        processImage(base64, mimeType, 'single');
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
      
      // Add to history
      if (mode === 'single' || Math.random() > 0.8) {
         // Fix: Ensure we construct a valid data URI without double prefix
         // base64Data is raw here, so this construction is correct.
         const thumb = `data:${mimeType};base64,${base64Data}`;
         setHistory(prev => [{...fullResult, id: Math.random().toString(36).substr(2), thumbnail: thumb}, ...prev]);
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

    // --- AGGREGATE FLOW CALCULATION ---
    const gridCols = 8;
    const gridFlows = new Array(gridCols).fill(0).map(() => ({ sumVel: 0, count: 0 }));

    detections.forEach(det => {
        if (!det.box_2d) return;
        const [ymin, xmin, ymax, xmax] = det.box_2d;
        
        // --- DRAW BOXES ---
        const x = (xmin / 1000) * canvas.width;
        const y = (ymin / 1000) * canvas.height;
        const w = ((xmax - xmin) / 1000) * canvas.width;
        const h = ((ymax - ymin) / 1000) * canvas.height;
        
        const isTracked = !!det.trackId;
        // COLOR THEME MAPPING
        // Speeding -> Red, WrongWay -> Red/Orange mix, Tracked -> Sky Blue, Idle -> Slate
        const color = det.isSpeeding ? '#FF6B6B' : det.isWrongWay ? '#F59E0B' : isTracked ? '#7DD3FC' : '#94a3b8';
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        
        // Label
        ctx.fillStyle = color;
        ctx.fillRect(x, y - 20, w, 20);
        ctx.fillStyle = '#0B0F19'; // Brand Dark
        ctx.font = 'bold 10px monospace';
        ctx.fillText(`${det.object} ${det.trackId ? '#'+det.trackId : ''}`, x + 2, y - 6);

        // --- DRAW INDIVIDUAL FLOW ARROWS ---
        if (isTracked && det.velocity !== undefined && Math.abs(det.velocity) > 0.05) {
            const centerX = x + w / 2;
            const centerY = y + h / 2;
            const arrowLength = (det.velocity * canvas.height) * 0.5;
            const endX = centerX;
            const endY = centerY + arrowLength;

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(endX, endY);
            ctx.strokeStyle = det.isWrongWay ? '#FF6B6B' : '#7DD3FC';
            ctx.lineWidth = 3;
            ctx.stroke();

            const angle = Math.atan2(endY - centerY, endX - centerX);
            const headLen = 10;
            ctx.beginPath();
            ctx.moveTo(endX, endY);
            ctx.lineTo(endX - headLen * Math.cos(angle - Math.PI / 6), endY - headLen * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(endX - headLen * Math.cos(angle + Math.PI / 6), endY - headLen * Math.sin(angle + Math.PI / 6));
            ctx.lineTo(endX, endY);
            ctx.fillStyle = ctx.strokeStyle;
            ctx.fill();

            // Accumulate for grid flow
            const gridX = (xmin + xmax) / 2 / 1000;
            const colIndex = Math.floor(gridX * gridCols);
            if (colIndex >= 0 && colIndex < gridCols) {
                gridFlows[colIndex].sumVel += det.velocity;
                gridFlows[colIndex].count += 1;
            }
        }
    });

    // --- DRAW AGGREGATE LANE FLOWS ---
    const colWidth = canvas.width / gridCols;
    gridFlows.forEach((flow, i) => {
        if (flow.count > 0) {
            const avgVel = flow.sumVel / flow.count;
            if (Math.abs(avgVel) > 0.05) {
                const isDown = avgVel > 0;
                const x = i * colWidth + colWidth / 2;
                const arrowSize = 40;
                const startY = isDown ? 40 : canvas.height - 40;
                const endY = isDown ? 40 + arrowSize : canvas.height - 40 - arrowSize;
                
                ctx.save();
                ctx.globalAlpha = 0.4;
                ctx.strokeStyle = '#6366F1'; // Brand Indigo
                ctx.fillStyle = '#6366F1';
                ctx.lineWidth = 8;
                
                ctx.beginPath();
                ctx.moveTo(x, startY);
                ctx.lineTo(x, endY);
                ctx.stroke();

                const angle = isDown ? Math.PI / 2 : -Math.PI / 2;
                const headLen = 20;
                ctx.beginPath();
                ctx.moveTo(x, endY);
                ctx.lineTo(x - headLen * Math.cos(angle - Math.PI / 4), endY - headLen * Math.sin(angle - Math.PI / 4));
                ctx.lineTo(x - headLen * Math.cos(angle + Math.PI / 4), endY - headLen * Math.sin(angle + Math.PI / 4));
                ctx.lineTo(x, endY);
                ctx.fill();

                ctx.globalAlpha = 0.9;
                ctx.fillStyle = '#FEF9C3'; // Brand Cream
                ctx.font = 'bold 12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(isDown ? 'INCOMING' : 'OUTGOING', x, isDown ? startY - 10 : startY + 20);

                ctx.restore();
            }
        }
    });
  };
  
  const clearOverlay = () => {
    const c = overlayCanvasRef.current;
    if(c) c.getContext('2d')?.clearRect(0,0,c.width, c.height);
  };

  return (
    <div className="min-h-screen bg-[#D7F1D5] text-slate-900 pb-12">
      <canvas ref={canvasRef} className="hidden" />
      <header className="bg-brand-panel/80 backdrop-blur-md border-b border-white/5 sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <button onClick={goHome} className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-brand-indigo rounded-lg flex items-center justify-center font-bold text-white group-hover:scale-105 transition-transform shadow-[0_0_15px_rgba(99,102,241,0.5)]">M</div>
            <span className="font-bold text-white text-lg tracking-tight drop-shadow-md">Traffic<span className="text-brand-sky">Agent</span></span>
          </button>
          <nav className="flex gap-2">
             <button onClick={goHome} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeView === 'home' ? 'bg-white/10 text-white' : 'text-slate-200 hover:text-white'}`}>Home</button>
             <button onClick={() => navigateTo('monitor')} disabled={!isMonitorActive} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeView === 'monitor' ? 'bg-brand-indigo/20 text-brand-indigo border border-brand-indigo/30' : 'text-slate-200 hover:text-white'}`}>Monitor</button>
             <button onClick={() => navigateTo('history')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeView === 'history' ? 'bg-brand-sky/20 text-brand-sky border border-brand-sky/30' : 'text-slate-200 hover:text-white'}`}>History</button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {activeView === 'home' && (
          <div className="max-w-3xl mx-auto space-y-6 animate-fadeIn">
            <div className="text-center mb-10 pt-8">
              <h2 className="text-5xl font-bold text-brand-dark mb-4 tracking-tight drop-shadow-sm">Autonomous Traffic <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-indigo to-brand-red">Control</span></h2>
              <p className="text-brand-dark/70 text-lg font-medium">Deploy multi-agent vision systems for real-time analysis.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="col-span-2 h-48 border-2 border-dashed border-brand-dark/20 rounded-2xl flex flex-col items-center justify-center bg-brand-panel/90 hover:bg-brand-panel cursor-pointer transition-all group shadow-xl">
                <div className="p-4 bg-brand-sky/10 rounded-full mb-3 group-hover:scale-110 transition-transform">
                   <Upload className="w-8 h-8 text-brand-sky" />
                </div>
                <span className="font-medium text-white">Upload Media</span>
                <span className="text-xs text-slate-400 mt-1">Images or MP4 Video</span>
                <input type="file" className="hidden" multiple accept="image/*,video/*" onChange={handleUpload} />
              </label>

              <button onClick={startCamera} className="p-6 bg-brand-panel/90 rounded-2xl border border-brand-dark/20 hover:border-brand-red/50 text-left group transition-all shadow-xl hover:bg-brand-panel">
                 <div className="flex items-center justify-between mb-4">
                     <div className="p-3 bg-brand-red/10 rounded-lg group-hover:bg-brand-red/20 transition-colors">
                        <Camera className="w-6 h-6 text-brand-red" />
                     </div>
                     <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-brand-red transition-colors" />
                 </div>
                 <h3 className="font-bold text-white text-lg">Live Feed</h3>
                 <p className="text-sm text-slate-400 mt-1">Connect to local camera stream.</p>
              </button>

              <button onClick={startSimulation} className="p-6 bg-brand-panel/90 rounded-2xl border border-brand-dark/20 hover:border-brand-indigo/50 text-left group transition-all shadow-xl hover:bg-brand-panel">
                 <div className="flex items-center justify-between mb-4">
                     <div className="p-3 bg-brand-indigo/10 rounded-lg group-hover:bg-brand-indigo/20 transition-colors">
                        <Layers className="w-6 h-6 text-brand-indigo" />
                     </div>
                     <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-brand-indigo transition-colors" />
                 </div>
                 <h3 className="font-bold text-white text-lg">Simulation</h3>
                 <p className="text-sm text-slate-400 mt-1">Run pre-configured scenario.</p>
              </button>
            </div>
            
            {history.length > 0 && (
               <div className="mt-8 p-6 bg-brand-panel/90 rounded-2xl border border-brand-dark/20 shadow-xl backdrop-blur-sm">
                 <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-brand-cream/80 flex items-center gap-2"><Database className="w-4 h-4" /> Recent Analysis</h4>
                 </div>
                 <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                    {history.slice(0, 5).map((h, i) => (
                        <div key={i} className="relative group cursor-pointer flex-shrink-0" onClick={() => handleLoadHistoryItem(h)}>
                           <img src={h.thumbnail} className="w-32 h-20 object-cover rounded-lg border border-white/10 group-hover:border-brand-sky transition-colors shadow-md" />
                           <div className="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-all rounded-lg"></div>
                           <div className="absolute bottom-1 right-1">
                               <span className="text-[10px] font-mono bg-black/70 text-brand-cream px-1.5 py-0.5 rounded">{new Date(h.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                           </div>
                        </div>
                    ))}
                 </div>
               </div>
            )}
          </div>
        )}

        {activeView === 'monitor' && (
            <div className="animate-fadeIn">
               <div className="flex items-center justify-between mb-4">
                 <button onClick={() => navigateTo('home')} className="text-sm text-brand-dark hover:text-white font-bold flex items-center gap-1 transition-colors bg-white/20 px-3 py-1 rounded-full"><ChevronLeft className="w-4 h-4" /> Home</button>
                 {isSimulating && (
                   <span className="text-xs font-mono font-bold text-brand-indigo bg-white/80 px-3 py-1 rounded-full border border-brand-indigo/20 shadow-sm">
                     SIMULATION STEP {simulationStep}/{SIMULATION_SCENARIOS.length}
                   </span>
                 )}
               </div>

               <div className="bg-brand-panel rounded-2xl border border-white/10 p-4 mb-6 relative overflow-hidden shadow-2xl">
                  <div className="relative aspect-video bg-black rounded-lg overflow-hidden ring-1 ring-white/10">
                     {(isCameraActive || processingVideo) ? (
                        <video ref={videoRef} autoPlay={isCameraActive} muted playsInline className="w-full h-full object-contain" />
                     ) : (
                        image && <img ref={imgRef} src={image} className="w-full h-full object-contain" />
                     )}
                     <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
                     
                     {status === AgentStatus.VISION_SCANNING && (
                        <div className="absolute inset-0 pointer-events-none border-b-2 border-brand-sky/50 animate-scan shadow-[0_0_20px_rgba(125,211,252,0.5)]"></div>
                     )}
                  </div>
                  
                  {/* Controls */}
                  <div className="flex justify-between items-center mt-4">
                     <button onClick={stopAllModes} className="flex items-center gap-2 text-sm font-bold text-brand-red hover:text-white px-4 py-2 bg-brand-red/10 rounded-lg hover:bg-brand-red transition-colors border border-brand-red/20">
                       <StopCircle className="w-4 h-4" /> Stop Session
                     </button>
                     <div className="flex gap-2">
                        <button onClick={handleLocationDiscovery} className="flex items-center gap-2 px-3 py-2 text-brand-indigo bg-brand-indigo/10 rounded-lg hover:bg-brand-indigo hover:text-white transition-colors border border-brand-indigo/20 text-xs font-medium">
                            <LocateFixed className="w-3.5 h-3.5" /> Detect Location
                        </button>
                     </div>
                  </div>
               </div>

               <AgentPipeline status={status} />
               <ResultsDashboard data={result} history={history} videoSessionData={videoSessionData} onLoadHistoryItem={handleLoadHistoryItem} />
            </div>
        )}
        
        {activeView === 'history' && (
           <div className="animate-fadeIn">
             <button onClick={() => navigateTo('home')} className="mb-4 text-sm text-brand-dark hover:text-white font-bold flex items-center gap-1 transition-colors bg-white/20 px-3 py-1 rounded-full w-fit"><ChevronLeft className="w-4 h-4" /> Home</button>
             <ResultsDashboard data={null} history={history} videoSessionData={[]} onLoadHistoryItem={handleLoadHistoryItem} />
           </div>
        )}
      </main>
    </div>
  );
}