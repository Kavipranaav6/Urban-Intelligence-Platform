import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RefreshCw,
  Upload,
  Sparkles,
  Cpu,
  Eye,
  Crosshair,
  FileText,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Video as VideoIcon,
  Car,
  Layers,
  Activity,
  Maximize2,
  Square,
  Shield,
  Clock,
  ChevronRight,
  MapPin,
  X
} from 'lucide-react';
import {
  Bus,
  BusCamera,
  UploadedVideoReport,
  SampledFrameData,
  UploadedVideoMetadata,
  FrameBoundingBox,
  VideoTimelineEvent
} from '../types';
import { api, EdgeProcessResponse } from '../services/api';
import { UploadedVideoReportModal } from './UploadedVideoReportModal';
import { SAMPLE_VIDEOS, generateSyntheticTestVideo } from '../utils/sampleVideoGenerator';

interface EdgeCameraFeedProps {
  bus: Bus;
  camera: BusCamera;
  onEventGenerated?: (event: any) => void;
  onReportGenerated?: (report: UploadedVideoReport | null) => void;
  onModeChange?: (mode: 'DEMO' | 'UPLOAD') => void;
}

export const EdgeCameraFeed: React.FC<EdgeCameraFeedProps> = ({
  bus,
  camera,
  onEventGenerated,
  onReportGenerated,
  onModeChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gpsFileInputRef = useRef<HTMLInputElement>(null);
  const videoElementRef = useRef<HTMLVideoElement>(null);

  // Operational Mode: 'DEMO' (Synthetic simulation) vs 'UPLOAD' (Uploaded video AI analysis)
  const [mode, setMode] = useState<'DEMO' | 'UPLOAD'>('DEMO');

  // Video Player Analysis Mode: 'ORIGINAL' (raw video) vs 'AI_ANALYSIS' (video with AI bounding boxes)
  const [playerMode, setPlayerMode] = useState<'ORIGINAL' | 'AI_ANALYSIS'>('AI_ANALYSIS');

  // Playback & Canvas Overlay Controls
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [aiActive, setAiActive] = useState<boolean>(true);

  // Uploaded Video State
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedGpsFile, setUploadedGpsFile] = useState<File | null>(null);
  const [gpsCsvContent, setGpsCsvContent] = useState<string | null>(null);
  const [customVideoUrl, setCustomVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number }>({ width: 1280, height: 720 });
  const [isProcessingVideo, setIsProcessingVideo] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>('IDLE');
  const [processingProgress, setProcessingProgress] = useState<number>(0);

  // Real-time live processing metrics panel state
  const [liveProcessingStats, setLiveProcessingStats] = useState({
    videoName: '',
    framesProcessed: 0,
    totalFrames: 0,
    objectsDetected: 0,
    potholes: 0,
    vehicles: 0,
    pedestrians: 0,
    anpr: 0
  });

  // Cancellation ref for STOP ANALYSIS
  const cancelProcessingRef = useRef<boolean>(false);

  // Detections & Reports
  const [demoInferenceResult, setDemoInferenceResult] = useState<EdgeProcessResponse | null>(null);
  const [uploadedReport, setUploadedReport] = useState<UploadedVideoReport | null>(null);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [isGeneratingTestVideo, setIsGeneratingTestVideo] = useState<boolean>(false);

  // Selected timeline event for evidence preview
  const [selectedTimelineEvent, setSelectedTimelineEvent] = useState<VideoTimelineEvent | null>(null);

  // Python ML Service Health State
  const [mlHealth, setMlHealth] = useState<{ online: boolean; deviceInfo?: any } | null>(null);

  useEffect(() => {
    const checkMl = () => {
      api.getMlServiceHealth().then((res) => setMlHealth(res)).catch(() => setMlHealth({ online: false }));
    };
    checkMl();
    const timer = setInterval(checkMl, 10000);
    return () => clearInterval(timer);
  }, []);

  // Animation frame state for synthetic demo road simulation
  const frameRef = useRef<number>(0);
  const animOffsetRef = useRef<number>(0);

  // Notify parent of mode change
  useEffect(() => {
    if (onModeChange) {
      onModeChange(mode);
    }
  }, [mode, onModeChange]);

  // Demo Road Animation Loop (Active strictly in DEMO mode)
  useEffect(() => {
    if (mode !== 'DEMO') return;

    let animId: number;

    const renderDemo = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      if (isPlaying) {
        animOffsetRef.current = (animOffsetRef.current + (bus.speed > 0 ? bus.speed * 0.12 : 1.2)) % 100;
        frameRef.current += 1;
      }

      // 1. Sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.45);
      skyGrad.addColorStop(0, '#0f172a');
      skyGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h * 0.45);

      // City skyline silhouettes
      ctx.fillStyle = '#111827';
      for (let x = 0; x < w; x += 45) {
        const bH = 30 + ((x * 17) % 55);
        ctx.fillRect(x, h * 0.45 - bH, 40, bH);
      }

      // Road asphalt gradient
      const roadGrad = ctx.createLinearGradient(0, h * 0.45, 0, h);
      roadGrad.addColorStop(0, '#334155');
      roadGrad.addColorStop(1, '#090d16');
      ctx.fillStyle = roadGrad;
      ctx.fillRect(0, h * 0.45, w, h * 0.55);

      // Road boundaries / lanes
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(w * 0.08, h);
      ctx.lineTo(w * 0.38, h * 0.45);
      ctx.lineTo(w * 0.62, h * 0.45);
      ctx.lineTo(w * 0.92, h);
      ctx.closePath();
      ctx.fill();

      // Curbs
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(w * 0.08, h);
      ctx.lineTo(w * 0.38, h * 0.45);
      ctx.moveTo(w * 0.92, h);
      ctx.lineTo(w * 0.62, h * 0.45);
      ctx.stroke();

      // Animated Center Dashes
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 4;
      const dashStep = 45;
      const offset = (animOffsetRef.current / 100) * dashStep;
      for (let y = h * 0.45; y < h; y += dashStep) {
        const currentY = y + offset;
        if (currentY > h) continue;
        const progress = (currentY - h * 0.45) / (h * 0.55);
        const startX = w * 0.5;
        ctx.beginPath();
        ctx.moveTo(startX, currentY);
        ctx.lineTo(startX, currentY + 20 * progress);
        ctx.stroke();
      }

      // Simulated Ahead Vehicle (Blue sedan)
      const carBaseY = h * 0.65;
      const carW = 140;
      const carH = 75;
      const carX = w * 0.54 - carW / 2 + Math.sin(frameRef.current * 0.03) * 12;

      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(carX, carBaseY, carW, carH);
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(carX + 15, carBaseY - 25, carW - 30, 30);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(carX + 8, carBaseY + 30, 16, 12);
      ctx.fillRect(carX + carW - 24, carBaseY + 30, 16, 12);

      // License Plate
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(carX + carW / 2 - 32, carBaseY + 36, 64, 16);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('TN 38 AB 1234', carX + carW / 2 - 30, carBaseY + 48);

      // Simulated Pothole in Left Lane
      const potCycle = (frameRef.current * 2) % 300;
      const potProgress = potCycle / 300;
      const potY = h * 0.45 + (h * 0.55) * potProgress;
      const potScale = 0.4 + potProgress * 1.6;
      const potX = w * 0.32 - 40 * potProgress;

      ctx.fillStyle = '#05070a';
      ctx.beginPath();
      ctx.ellipse(potX, potY, 32 * potScale, 14 * potScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Overlaid AI Detections in DEMO mode
      if (aiActive) {
        // Vehicle Bounding Box
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2;
        ctx.strokeRect(carX - 8, carBaseY - 32, carW + 16, carH + 40);
        ctx.fillStyle = '#06b6d4';
        ctx.fillRect(carX - 8, carBaseY - 48, 120, 16);
        ctx.fillStyle = '#020617';
        ctx.font = 'bold 9px monospace';
        ctx.fillText('CAR #17 [95.4%]', carX - 4, carBaseY - 36);

        // ANPR OCR Box
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.strokeRect(carX + carW / 2 - 34, carBaseY + 34, 68, 20);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(carX + carW / 2 - 34, carBaseY + 16, 125, 16);
        ctx.fillStyle = '#020617';
        ctx.font = 'bold 9px monospace';
        ctx.fillText('ANPR: TN 38 AB 1234', carX + carW / 2 - 30, carBaseY + 28);

        // Pothole Detection Box
        if (potY > h * 0.52 && potY < h * 0.9) {
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 2;
          const boxW = 80 * potScale;
          const boxH = 40 * potScale;
          ctx.strokeRect(potX - boxW / 2, potY - boxH / 2, boxW, boxH);
          ctx.fillStyle = '#f97316';
          ctx.fillRect(potX - boxW / 2, potY - boxH / 2 - 16, 110, 16);
          ctx.fillStyle = '#020617';
          ctx.font = 'bold 9px monospace';
          ctx.fillText('POTHOLE [94.1%]', potX - boxW / 2 + 4, potY - boxH / 2 - 4);
        }
      }

      // Telemetry HUD
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(12, 12, 280, 52);
      ctx.strokeStyle = '#334155';
      ctx.strokeRect(12, 12, 280, 52);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`EDGE UNIT: ${bus.id} | CAM: ${camera.id}`, 20, 28);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px monospace';
      ctx.fillText(`GPS: ${bus.lat.toFixed(4)}, ${bus.lng.toFixed(4)} | SPEED: ${bus.speed.toFixed(0)} km/h`, 20, 42);
      ctx.fillText(`YOLOv8 DETECTIONS: 3 | BYTE-TRACK: ACTIVE`, 20, 55);

      if (isPlaying) {
        animId = requestAnimationFrame(renderDemo);
      }
    };

    renderDemo();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [mode, isPlaying, aiActive, bus, camera]);

  // Synchronized Drawing of Bounding Boxes on Uploaded Video Overlay
  const drawOverlayBoundingBoxes = useCallback((currentTime: number) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (playerMode !== 'AI_ANALYSIS' || !uploadedReport || !uploadedReport.processedFrames) {
      return;
    }

    // Find the processed frame closest to current video time (within 1.5s tolerance)
    let bestFrame = uploadedReport.processedFrames[0];
    let minDiff = Infinity;

    for (const frame of uploadedReport.processedFrames) {
      const diff = Math.abs(frame.timestampSec - currentTime);
      if (diff < minDiff) {
        minDiff = diff;
        bestFrame = frame;
      }
    }

    if (!bestFrame || minDiff > 1.8) {
      return;
    }

    const w = canvas.width;
    const h = canvas.height;

    // Draw detections for this frame
    for (const det of bestFrame.detections) {
      const bx = det.x * w;
      const by = det.y * h;
      const bw = det.width * w;
      const bh = det.height * h;

      ctx.strokeStyle = det.color || '#06b6d4';
      ctx.lineWidth = 2.5;

      // Glow effect
      ctx.shadowColor = det.color || '#06b6d4';
      ctx.shadowBlur = 6;
      ctx.strokeRect(bx, by, bw, bh);

      // HUD Corner Brackets
      const bracketLen = Math.min(16, bw * 0.25, bh * 0.25);
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      // Top-Left
      ctx.moveTo(bx, by + bracketLen);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + bracketLen, by);
      // Top-Right
      ctx.moveTo(bx + bw - bracketLen, by);
      ctx.lineTo(bx + bw, by);
      ctx.lineTo(bx + bw, by + bracketLen);
      // Bottom-Left
      ctx.moveTo(bx, by + bh - bracketLen);
      ctx.lineTo(bx, by + bh);
      ctx.lineTo(bx + bracketLen, by + bh);
      // Bottom-Right
      ctx.moveTo(bx + bw - bracketLen, by + bh);
      ctx.lineTo(bx + bw, by + bh);
      ctx.lineTo(bx + bw, by + bh - bracketLen);
      ctx.stroke();

      ctx.shadowBlur = 0;

      // Label Tag
      const labelText = det.label || `${det.class.toUpperCase()} ${det.confidence}%`;
      ctx.font = 'bold 12px monospace';
      const textWidth = ctx.measureText(labelText).width;
      const tagH = 20;
      const tagW = textWidth + 14;

      const tagY = by >= 24 ? by - tagH : by;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(bx, tagY, tagW, tagH);
      ctx.strokeStyle = det.color || '#06b6d4';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, tagY, tagW, tagH);

      ctx.fillStyle = det.color || '#38bdf8';
      ctx.fillText(labelText, bx + 7, tagY + 14);

      // If pothole, draw subtle crosshair in center
      if (det.class === 'pothole') {
        const cx = bx + bw / 2;
        const cy = by + bh / 2;
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy);
        ctx.lineTo(cx + 10, cy);
        ctx.moveTo(cx, cy - 10);
        ctx.lineTo(cx, cy + 10);
        ctx.stroke();
      }
    }
  }, [playerMode, uploadedReport]);

  // Video Time Update Listener
  const handleTimeUpdate = () => {
    const video = videoElementRef.current;
    if (video) {
      drawOverlayBoundingBoxes(video.currentTime);
    }
  };

  // Re-draw overlay if playerMode changes or report updates
  useEffect(() => {
    const video = videoElementRef.current;
    if (video) {
      drawOverlayBoundingBoxes(video.currentTime);
    }
  }, [playerMode, uploadedReport, drawOverlayBoundingBoxes]);

  // Handle File Upload from User's device
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadVideoFile(file);
  };

  // Handle GPS CSV File Upload from User's device
  const handleGpsFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedGpsFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setGpsCsvContent(text);
    };
    reader.readAsText(file);
  };

  const handleClearGpsFile = () => {
    setUploadedGpsFile(null);
    setGpsCsvContent(null);
    if (gpsFileInputRef.current) {
      gpsFileInputRef.current.value = '';
    }
  };

  // Load a video file (either custom or synthetic sample)
  const loadVideoFile = (file: File) => {
    const url = URL.createObjectURL(file);
    setUploadedFile(file);
    setCustomVideoUrl(url);
    setMode('UPLOAD');
    setPlayerMode('AI_ANALYSIS');
    setUploadedReport(null);
    setProcessingStatus('AWAITING AI ANALYSIS');
    setProcessingProgress(0);
    setLiveProcessingStats({
      videoName: file.name,
      framesProcessed: 0,
      totalFrames: 0,
      objectsDetected: 0,
      potholes: 0,
      vehicles: 0,
      pedestrians: 0,
      anpr: 0
    });
  };

  // Test Video Sample Loader (Video A Downtown vs Video B Highway)
  const handleLoadSampleVideo = async (sampleId: string) => {
    const sample = SAMPLE_VIDEOS.find((s) => s.id === sampleId);
    if (!sample) return;

    setIsGeneratingTestVideo(true);
    try {
      const file = await generateSyntheticTestVideo(sample.sceneType, sample.durationSec, sample.fileName);
      loadVideoFile(file);
    } catch (err) {
      console.error('Failed to generate test video:', err);
    } finally {
      setIsGeneratingTestVideo(false);
    }
  };

  // Video Loaded Metadata Handler
  const handleVideoLoadedMetadata = () => {
    const video = videoElementRef.current;
    if (video) {
      setVideoDuration(video.duration || 0);
      setVideoDimensions({
        width: video.videoWidth || 1280,
        height: video.videoHeight || 720
      });

      const fps = 30;
      const totalFrames = Math.round((video.duration || 5) * fps);
      setLiveProcessingStats((prev) => ({
        ...prev,
        totalFrames
      }));
    }
  };

  // STOP ANALYSIS handler
  const handleStopAnalysis = () => {
    cancelProcessingRef.current = true;
    setIsProcessingVideo(false);
    setProcessingStatus('ANALYSIS STOPPED BY USER');
  };

  // Real Frame Extraction and AI Analysis Pipeline for Uploaded Video
  const handleAnalyzeUploadedVideo = async () => {
    const video = videoElementRef.current;
    if (!video || !uploadedFile) return;

    cancelProcessingRef.current = false;
    setIsProcessingVideo(true);
    setProcessingProgress(5);
    setProcessingStatus('INITIALIZING AI FRAME EXTRACTION PIPELINE...');

    try {
      const duration = video.duration || videoDuration || 5.0;
      const fps = 30;
      const totalFrames = Math.round(duration * fps);
      const minutes = Math.floor(duration / 60);
      const seconds = Math.floor(duration % 60);
      const durationFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      // Fast, lightweight high-fidelity canvas (854x480) optimized for fast edge transmission
      const canvasWidth = 854;
      const canvasHeight = 480;
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = canvasWidth;
      offscreenCanvas.height = canvasHeight;
      const offscreenCtx = offscreenCanvas.getContext('2d')!;

      // Calculate target timestamps for extraction
      // For short demo videos (<= 4s), keep early dense burst; for full road videos, sample evenly across duration
      let targetTimestamps: number[] = [];
      if (duration <= 4.0) {
        const earlyBurst = [0.05, 0.15, 0.25, 0.38, 0.55, 0.85, 1.25, 1.65, 2.00, 2.35, 2.70];
        targetTimestamps = earlyBurst.filter((t) => t < duration - 0.15);
      } else {
        const tsSet = new Set<number>();
        // Early burst window
        [0.5, 1.2, 2.0, 3.2, 4.5].forEach((t) => {
          if (t < duration - 0.5) tsSet.add(Number(t.toFixed(2)));
        });
        // Comprehensive spread across the entire video (e.g. ~14-16 keyframes max)
        const step = Math.max(1.8, (duration - 4.5) / 14);
        for (let cur = 5.0; cur < duration - 0.3; cur += step) {
          tsSet.add(Number(cur.toFixed(2)));
        }
        targetTimestamps = Array.from(tsSet).sort((a, b) => a - b);
      }
      const sampleCount = targetTimestamps.length;
      const sampledFrames: SampledFrameData[] = [];

      // Seek video to specific timestamps and extract frames
      const originalTime = video.currentTime;
      const wasPlaying = !video.paused;
      video.pause();

      setLiveProcessingStats({
        videoName: uploadedFile.name,
        framesProcessed: 0,
        totalFrames,
        objectsDetected: 0,
        potholes: 0,
        vehicles: 0,
        pedestrians: 0,
        anpr: 0
      });

      for (let i = 0; i < sampleCount; i++) {
        if (cancelProcessingRef.current) {
          throw new Error('Analysis cancelled by user');
        }

        const targetTime = targetTimestamps[i];
        const currentFrameIndex = Math.round(targetTime * fps);
        const progressPct = 10 + Math.round((i / sampleCount) * 40);

        setProcessingStatus(`EXTRACTING FRAME ${i + 1}/${sampleCount} (@ ${targetTime.toFixed(1)}s)...`);
        setProcessingProgress(progressPct);

        // Seek video
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          video.addEventListener('seeked', onSeeked);
          video.currentTime = targetTime;
        });

        // Draw frame onto offscreen canvas with compact 0.75 JPEG compression
        offscreenCtx.drawImage(video, 0, 0, canvasWidth, canvasHeight);
        const frameDataUrl = offscreenCanvas.toDataURL('image/jpeg', 0.75);

        const frameMin = Math.floor(targetTime / 60);
        const frameSec = Math.floor(targetTime % 60);
        const timestampFormatted = `${String(frameMin).padStart(2, '0')}:${String(frameSec).padStart(2, '0')}`;

        sampledFrames.push({
          timestamp: timestampFormatted,
          timestampSec: Number(targetTime.toFixed(2)),
          frameIndex: currentFrameIndex,
          frameDataUrl
        });

        // Update live processing panel stats incrementally during frame extraction
        setLiveProcessingStats((prev) => ({
          ...prev,
          framesProcessed: currentFrameIndex
        }));

        // Small yield so browser re-renders progress bar
        await new Promise((r) => setTimeout(r, 20));
      }

      // Restore video playback state
      video.currentTime = originalTime;
      if (wasPlaying) {
        video.play().catch(() => {});
      }

      if (cancelProcessingRef.current) {
        throw new Error('Analysis cancelled by user');
      }

      setProcessingProgress(60);
      setProcessingStatus('DISPATCHING FRAMES TO AI VISION PIPELINE...');

      const metadata: UploadedVideoMetadata = {
        fileName: uploadedFile.name,
        fileSize: `${(uploadedFile.size / (1024 * 1024)).toFixed(1)} MB`,
        duration: Number(duration.toFixed(2)),
        durationFormatted,
        fps,
        totalFrames,
        framesAnalyzed: sampledFrames.length,
        resolution: `${videoDimensions.width}x${videoDimensions.height}`
      };

      setProcessingProgress(75);
      setProcessingStatus('RUNNING AI MULTI-OBJECT & HAZARD INFERENCE...');

      // Send to Backend API
      const result = await api.analyzeUploadedVideo(metadata, sampledFrames, bus.id, gpsCsvContent || undefined);

      if (cancelProcessingRef.current) {
        throw new Error('Analysis cancelled by user');
      }

      // Update final live metrics
      const totalObjs =
        result.report.vehicleCounts.uniqueVehicles +
        result.report.vehicleCounts.pedestrians +
        result.report.roadIssues.length;

      const potCount = result.report.roadIssues.filter((r) => r.type.toLowerCase().includes('pothole')).length;

      setLiveProcessingStats({
        videoName: uploadedFile.name,
        framesProcessed: totalFrames,
        totalFrames,
        objectsDetected: totalObjs,
        potholes: potCount,
        vehicles: result.report.vehicleCounts.uniqueVehicles,
        pedestrians: result.report.vehicleCounts.pedestrians,
        anpr: result.report.anprResults.length
      });

      setProcessingProgress(100);
      setProcessingStatus('ANALYSIS COMPLETE');
      setUploadedReport(result.report);
      setPlayerMode('AI_ANALYSIS');

      if (onReportGenerated) {
        onReportGenerated(result.report);
      }

      // If road hazards were found, generate notification event
      if (result.report.roadIssues.length > 0 && onEventGenerated) {
        const firstHazard = result.report.roadIssues[0];
        onEventGenerated({
          id: firstHazard.id,
          type: firstHazard.type,
          severity: firstHazard.severity,
          confidence: firstHazard.confidence,
          timestamp: firstHazard.timestamp,
          locationName: `Uploaded Video Survey (${metadata.fileName})`,
          evidence: firstHazard.evidenceFrame
        });
      }
    } catch (err: any) {
      if (err.message === 'Analysis cancelled by user') {
        console.log('Analysis stopped');
      } else {
        console.error('Video analysis failed:', err);
        setProcessingStatus(`ANALYSIS FAILED: ${err.message || 'Unknown error'}`);
      }
    } finally {
      setIsProcessingVideo(false);
    }
  };

  // Demo Run AI Handler (Used strictly in DEMO mode)
  const handleRunDemoAI = async () => {
    setIsProcessingVideo(true);
    setProcessingStatus('PROCESSING DEMO YOLO PIPELINE...');
    try {
      const result = await api.runEdgeAI(bus.id, camera.id);
      setDemoInferenceResult(result);
      if (onEventGenerated) {
        onEventGenerated(result.generatedEvent);
      }
    } catch (err) {
      console.error('Demo Edge AI error:', err);
    } finally {
      setIsProcessingVideo(false);
      setProcessingStatus('DEMO COMPLETE');
    }
  };

  // Return to Demo Mode
  const handleSwitchToDemo = () => {
    setMode('DEMO');
    setCustomVideoUrl(null);
    setUploadedFile(null);
    setUploadedGpsFile(null);
    setGpsCsvContent(null);
    if (gpsFileInputRef.current) {
      gpsFileInputRef.current.value = '';
    }
    setUploadedReport(null);
    setSelectedTimelineEvent(null);
    if (onReportGenerated) {
      onReportGenerated(null);
    }
  };

  // Seek video and select timeline event for inspection
  const handleSelectTimelineEvent = (evt: VideoTimelineEvent) => {
    setSelectedTimelineEvent(evt);
    if (videoElementRef.current) {
      videoElementRef.current.currentTime = evt.timestampSec;
      drawOverlayBoundingBoxes(evt.timestampSec);
    }
  };

  return (
    <div className="flex flex-col gap-4 bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-2xl">
      {/* Top Header Bar with Mode Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="flex h-3 w-3 relative">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                mode === 'UPLOAD' ? 'bg-cyan-400' : 'bg-amber-400'
              }`}
            ></span>
            <span
              className={`relative inline-flex rounded-full h-3 w-3 ${
                mode === 'UPLOAD' ? 'bg-cyan-500' : 'bg-amber-500'
              }`}
            ></span>
          </span>

          <span className="font-mono font-bold text-sm text-white tracking-wide">
            {bus.id} / {camera.id}
          </span>

          {/* Explicit Mode Indicators */}
          {mode === 'DEMO' ? (
            <span className="px-2.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 text-[11px] font-mono font-bold flex items-center gap-1.5 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              DEMO SIMULATION
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-700 text-[11px] font-mono font-bold flex items-center gap-1.5 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
              UPLOADED VIDEO AI ANALYSIS
            </span>
          )}

          {mlHealth?.online ? (
            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-mono font-bold flex items-center gap-1 shadow-sm">
              <Cpu className="w-3 h-3 text-emerald-400" />
              PYTHON EDGE ML: YOLOv8 ONLINE ({mlHealth.deviceInfo?.deviceName || 'Active'})
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-mono font-bold flex items-center gap-1">
              <Cpu className="w-3 h-3 text-slate-500" />
              PYTHON ML SERVICE: STANDBY
            </span>
          )}

          {mode === 'UPLOAD' && uploadedReport && (
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                uploadedReport.isRealModelInference
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                  : 'bg-amber-950 text-amber-400 border-amber-800'
              }`}
            >
              {uploadedReport.inferenceEngine}
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Hidden native video file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFileUpload}
          />

          {/* Hidden native GPS CSV file input */}
          <input
            ref={gpsFileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleGpsFileUpload}
          />

          {mode === 'UPLOAD' && (
            <button
              onClick={handleSwitchToDemo}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition"
              title="Return to Predefined Demo Simulation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Demo</span>
            </button>
          )}

          {/* Test Video Presets (Test Video A vs Test Video B) */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs font-mono">
            <span className="px-2 text-[10px] text-slate-500 uppercase font-bold">Presets:</span>
            <button
              onClick={() => handleLoadSampleVideo('sample-a')}
              disabled={isGeneratingTestVideo || isProcessingVideo}
              className="px-2 py-1 rounded hover:bg-slate-800 text-slate-300 hover:text-cyan-300 transition text-[11px]"
              title="Video A: Downtown (Car, Pothole, Pedestrian, Plate: KA 01 MJ 8821)"
            >
              Test Video A
            </button>
            <button
              onClick={() => handleLoadSampleVideo('sample-b')}
              disabled={isGeneratingTestVideo || isProcessingVideo}
              className="px-2 py-1 rounded hover:bg-slate-800 text-slate-300 hover:text-cyan-300 transition text-[11px]"
              title="Video B: Highway (Truck, Waterlogging, No Potholes, No Plates)"
            >
              Test Video B
            </button>
          </div>

          {/* Upload Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessingVideo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
          >
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span>Upload Road Video</span>
          </button>

          {/* Optional GPS CSV Input */}
          {!uploadedGpsFile ? (
            <button
              onClick={() => gpsFileInputRef.current?.click()}
              disabled={isProcessingVideo}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-dashed border-slate-600 hover:border-cyan-500 transition"
              title="Attach optional GPS telemetry CSV (timestamp_sec, latitude, longitude)"
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>Attach GPS CSV (Optional)</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-700 text-xs font-mono text-emerald-300 shadow-sm">
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span className="truncate max-w-[130px]" title={uploadedGpsFile.name}>{uploadedGpsFile.name}</span>
              <button
                onClick={handleClearGpsFile}
                disabled={isProcessingVideo}
                className="p-0.5 hover:bg-emerald-900 rounded text-emerald-400 hover:text-white"
                title="Remove GPS CSV"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}


        </div>
      </div>

      {/* REQUIRED VIDEO PLAYER MODE BUTTONS: PLAY ORIGINAL, PLAY AI ANALYSIS, START ANALYSIS, STOP ANALYSIS */}
      {mode === 'UPLOAD' && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800">
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <span className="text-slate-400 text-[11px] uppercase mr-1">Player Mode:</span>
            <button
              onClick={() => setPlayerMode('ORIGINAL')}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                playerMode === 'ORIGINAL'
                  ? 'bg-slate-700 text-white shadow ring-1 ring-slate-500'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-400'
              }`}
            >
              <VideoIcon className="w-3.5 h-3.5 text-slate-300" />
              <span>PLAY ORIGINAL</span>
            </button>
            <button
              onClick={() => setPlayerMode('AI_ANALYSIS')}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                playerMode === 'AI_ANALYSIS'
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-600 ring-1 ring-cyan-500 shadow-md shadow-cyan-950'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-400'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
              <span>PLAY AI ANALYSIS</span>
            </button>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            {!isProcessingVideo ? (
              <button
                onClick={handleAnalyzeUploadedVideo}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-xs font-bold text-white shadow-lg shadow-cyan-950 transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>START ANALYSIS</span>
              </button>
            ) : (
              <button
                onClick={handleStopAnalysis}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white shadow-lg shadow-rose-950 transition animate-pulse"
              >
                <Square className="w-3.5 h-3.5" />
                <span>STOP ANALYSIS</span>
              </button>
            )}

            {uploadedReport && (
              <button
                onClick={() => setShowReportModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-700 text-xs font-bold transition"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>GENERATE REPORT</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* REQUIRED PROCESSING PANEL:
          While processing show:
          AI ANALYSIS RUNNING
          Video: road_video.mp4
          Frames processed: 245 / 1200
          Objects detected: 37
          Potholes: 2
          Vehicles: 29
          Pedestrians: 6
          ANPR: 3
          Processing progress bar.
      */}
      {mode === 'UPLOAD' && isProcessingVideo && (
        <div className="p-4 rounded-xl bg-slate-950 border border-cyan-800 font-mono text-xs space-y-3 shadow-xl">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
              <span className="text-cyan-300 font-bold tracking-wider uppercase text-sm">
                AI ANALYSIS RUNNING
              </span>
            </div>
            <button
              onClick={handleStopAnalysis}
              className="px-2.5 py-1 rounded bg-rose-950 text-rose-300 border border-rose-800 hover:bg-rose-900 text-[11px] font-bold"
            >
              STOP ANALYSIS
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5 text-center">
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 block uppercase">Video</span>
              <strong className="text-white text-xs truncate block mt-0.5" title={liveProcessingStats.videoName}>
                {liveProcessingStats.videoName || uploadedFile?.name}
              </strong>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 block uppercase">Frames processed</span>
              <strong className="text-cyan-300 text-xs block mt-0.5">
                {liveProcessingStats.framesProcessed} / {liveProcessingStats.totalFrames || 150}
              </strong>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 block uppercase">Objects detected</span>
              <strong className="text-emerald-400 text-xs block mt-0.5">
                {liveProcessingStats.objectsDetected}
              </strong>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 block uppercase">Potholes</span>
              <strong className="text-amber-400 text-xs block mt-0.5">
                {liveProcessingStats.potholes}
              </strong>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 block uppercase">Vehicles</span>
              <strong className="text-blue-400 text-xs block mt-0.5">
                {liveProcessingStats.vehicles}
              </strong>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 block uppercase">Pedestrians</span>
              <strong className="text-rose-400 text-xs block mt-0.5">
                {liveProcessingStats.pedestrians}
              </strong>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 block uppercase">ANPR</span>
              <strong className="text-yellow-400 text-xs block mt-0.5">
                {liveProcessingStats.anpr}
              </strong>
            </div>
          </div>

          {/* Processing Progress Bar */}
          <div className="space-y-1 pt-1">
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-500 transition-all duration-300"
                style={{ width: `${processingProgress}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-[11px] text-slate-400">
              <span className="text-cyan-300">{processingStatus}</span>
              <span className="font-bold">{processingProgress}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Viewport: Canvas (for DEMO) vs Real Video Element with Overlay Canvas (for UPLOAD) */}
      <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-slate-800 bg-black group">
        {mode === 'DEMO' ? (
          <canvas
            ref={canvasRef}
            width={854}
            height={480}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="relative w-full h-full">
            <video
              ref={videoElementRef}
              src={customVideoUrl || undefined}
              controls
              autoPlay
              loop
              muted
              playsInline
              onLoadedMetadata={handleVideoLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              className="w-full h-full object-contain"
            />

            {/* SYNCHRONIZED AI BOUNDING BOX OVERLAY CANVAS */}
            <canvas
              ref={overlayCanvasRef}
              width={videoDimensions.width}
              height={videoDimensions.height}
              className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-200 ${
                playerMode === 'AI_ANALYSIS' ? 'opacity-100' : 'opacity-0'
              }`}
            />

            {/* Overlay Badges for Uploaded Video */}
            <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
              <span className="px-2 py-1 rounded bg-slate-900/90 text-cyan-300 font-mono text-[10px] border border-slate-700">
                {playerMode === 'AI_ANALYSIS' ? 'AI BOUNDING BOX OVERLAY' : 'ORIGINAL RAW FOOTAGE'}
              </span>
              <span className="px-2 py-1 rounded bg-slate-900/90 text-emerald-400 font-mono text-[10px] border border-slate-700">
                {videoDimensions.width}x{videoDimensions.height}
              </span>
            </div>
          </div>
        )}

        {/* GPS Badge */}
        <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-none">
          <span className="px-2 py-1 rounded bg-slate-900/90 text-cyan-300 font-mono text-[10px] border border-slate-700">
            {camera.resolution}
          </span>
          <span className="px-2 py-1 rounded bg-slate-900/90 text-emerald-400 font-mono text-[10px] border border-slate-700">
            BUS GPS: {bus.lat.toFixed(4)}, {bus.lng.toFixed(4)}
          </span>
        </div>

        {/* Play/Pause controls for Demo mode */}
        {mode === 'DEMO' && (
          <div className="absolute bottom-3 left-3 flex items-center gap-2 z-20">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 backdrop-blur border border-slate-700"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setAiActive(!aiActive)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-bold border transition ${
                aiActive
                  ? 'bg-amber-950/90 text-amber-300 border-amber-700'
                  : 'bg-slate-900/90 text-slate-400 border-slate-700'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Demo Boxes: {aiActive ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        )}

        {/* Notice Badge */}
        <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded bg-slate-950/80 text-[10px] font-mono border border-slate-800 pointer-events-none">
          {mode === 'DEMO' ? (
            <span className="text-amber-400">DEMO SIMULATION</span>
          ) : (
            <span className="text-cyan-400">UPLOADED VIDEO AI ANALYSIS</span>
          )}
        </div>
      </div>

      {/* REQUIRED DETECTION TIMELINE:
          Example:
          00:14 → Car detected
          00:27 → Pedestrian detected
          00:43 → Pothole detected
          01:12 → Number plate detected
          Clicking an event should show the actual evidence frame from that timestamp.
      */}
      {mode === 'UPLOAD' && uploadedReport && (
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                DETECTION TIMELINE (CLICK EVENT TO INSPECT TIMESTAMP & EVIDENCE FRAME)
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">
              {uploadedReport.detectionTimeline.length} events logged
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
            {uploadedReport.detectionTimeline.map((evt, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectTimelineEvent(evt)}
                className={`p-3 rounded-lg text-left border transition flex flex-col justify-between ${
                  selectedTimelineEvent?.timestamp === evt.timestamp
                    ? 'bg-cyan-950/60 border-cyan-500 shadow-md ring-1 ring-cyan-500'
                    : 'bg-slate-900/80 hover:bg-slate-900 border-slate-800 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-cyan-400 text-xs">
                    {evt.timestamp} →
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-950 text-[10px] text-emerald-400 font-bold border border-slate-800">
                    {evt.confidence}%
                  </span>
                </div>
                <div className="font-bold text-white text-xs mt-1.5 truncate">
                  {evt.title}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                  {evt.details}
                </div>
                <div className="text-[10px] text-cyan-300 mt-2 flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  <span>View Evidence Frame</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* EVIDENCE FRAME POPUP MODAL (When timeline event clicked) */}
      {selectedTimelineEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 font-mono">
              <div className="flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-cyan-400" />
                <span className="font-bold text-white text-sm">
                  EVIDENCE FRAME: {selectedTimelineEvent.title}
                </span>
                <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 text-[10px] border border-cyan-800">
                  @ {selectedTimelineEvent.timestamp}
                </span>
              </div>
              <button
                onClick={() => setSelectedTimelineEvent(null)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedTimelineEvent.evidenceFrame ? (
              <div className="relative aspect-video rounded-xl overflow-hidden border border-slate-800 bg-black">
                <img
                  src={selectedTimelineEvent.evidenceFrame}
                  alt="Evidence Frame"
                  className="w-full h-full object-contain"
                />
                <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded bg-slate-950/90 font-mono text-[11px] text-emerald-300 border border-slate-800">
                  CONFIDENCE: {selectedTimelineEvent.confidence}% | SAMPLED VIDEO TIMESTAMP
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 font-mono text-xs">
                No image data captured for this timestamp
              </div>
            )}

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 space-y-1">
              <div className="font-bold text-white">{selectedTimelineEvent.title}</div>
              <p className="text-slate-400 text-[11px]">{selectedTimelineEvent.details}</p>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setSelectedTimelineEvent(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-white transition"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DYNAMIC RESULTS DRAWER FOR UPLOADED VIDEO */}
      {mode === 'UPLOAD' && uploadedReport && (
        <div className="p-4 rounded-xl bg-slate-950 border border-cyan-800/80 space-y-4 shadow-xl font-mono">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                UPLOADED VIDEO ANALYSIS RESULTS
              </h3>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                  uploadedReport.isRealModelInference
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                    : 'bg-amber-950 text-amber-400 border-amber-800'
                }`}
              >
                {uploadedReport.inferenceEngine}
              </span>
            </div>

            {/* Prominent GENERATE REPORT Button */}
            <button
              onClick={() => setShowReportModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-slate-950 font-bold text-xs shadow-lg transition"
            >
              <FileText className="w-4 h-4" />
              <span>GENERATE REPORT</span>
            </button>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {/* 1. Road Issues */}
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-slate-400 text-[10px]">ROAD HAZARDS</div>
              <div className="text-lg font-bold text-amber-400 mt-0.5">
                {uploadedReport.roadIssues.length > 0 ? (
                  `${uploadedReport.roadIssues.length} Detected`
                ) : (
                  'Potholes detected: 0'
                )}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 truncate">
                {uploadedReport.roadIssues[0]?.type || 'Road surface intact'}
              </div>
            </div>

            {/* 2. Unique Vehicles */}
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-slate-400 text-[10px]">UNIQUE VEHICLES</div>
              <div className="text-lg font-bold text-cyan-400 mt-0.5">
                {uploadedReport.vehicleCounts.uniqueVehicles} Tracked
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {uploadedReport.vehicleCounts.cars} Cars, {uploadedReport.vehicleCounts.pedestrians} Peds
              </div>
            </div>

            {/* 3. ANPR Plates */}
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[10px]">ANPR IDENTIFICATION</span>
                  {uploadedReport.anprResults.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-400/20 text-yellow-300 font-mono font-bold">
                      {uploadedReport.anprResults.length} plate(s)
                    </span>
                  )}
                </div>
                <div className="text-sm font-bold text-yellow-400 mt-1 truncate">
                  {uploadedReport.anprResults.length > 0
                    ? uploadedReport.anprResults[0].plateNumber
                    : 'Number plates detected: 0'}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {uploadedReport.anprResults.length > 0
                    ? `Conf: ${uploadedReport.anprResults[0].confidence}% ${uploadedReport.anprResults[0].vehicleClass ? `(${uploadedReport.anprResults[0].vehicleClass})` : ''}`
                    : 'No plates visible'}
                </div>
              </div>
              {uploadedReport.anprResults[0]?.evidenceFrame && (
                <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center gap-2">
                  <img
                    src={uploadedReport.anprResults[0].evidenceFrame}
                    alt="Plate crop"
                    className="h-8 w-auto max-w-[110px] object-contain rounded border border-yellow-500/40 bg-slate-950"
                  />
                  <span className="text-[10px] text-slate-400 font-mono">
                    {uploadedReport.anprResults[0].timestamp || '00:01'}
                  </span>
                </div>
              )}
            </div>

            {/* 4. Traffic Flow */}
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-slate-400 text-[10px]">TRAFFIC DENSITY</div>
              <div className="text-lg font-bold text-purple-400 mt-0.5">
                {uploadedReport.trafficAnalysis.congestionLevel} Congestion
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {uploadedReport.trafficAnalysis.trafficDensity} density
              </div>
            </div>
          </div>

          {/* Survey Telemetry & Map Reflection Banner */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-cyan-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400 text-sm">
                🗺️
              </div>
              <div>
                <div className="font-bold text-white flex items-center gap-2">
                  <span>Geospatial Telemetry Ingested</span>
                  {uploadedGpsFile && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-mono">
                      {uploadedGpsFile.name}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400">
                  {uploadedReport.roadIssues.length} road hazard(s) and {uploadedReport.anprResults.length} vehicle plate read(s) mapped to GIS coordinates.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <a
                href="/gis-map"
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-lg shadow-cyan-600/20 cursor-pointer"
              >
                <span>🗺️ View on GIS Map</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Road Issue Report Table (from uploaded video) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300 uppercase">
                Road Issues ({uploadedReport.roadIssues.length})
              </span>
              <span className="text-slate-500 text-[11px]">
                {uploadedReport.roadIssues.length === 0 ? 'Potholes detected: 0' : 'Derived from uploaded video'}
              </span>
            </div>
            {uploadedReport.roadIssues.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="py-2 px-3">Event ID</th>
                      <th className="py-2 px-3">Timestamp</th>
                      <th className="py-2 px-3">Detection Type</th>
                      <th className="py-2 px-3">Confidence</th>
                      <th className="py-2 px-3">Severity</th>
                      <th className="py-2 px-3 text-right">Actual Frame Evidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                    {uploadedReport.roadIssues.map((issue) => (
                      <tr key={issue.id} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-bold text-cyan-300">{issue.id}</td>
                        <td className="py-2 px-3 text-slate-300">{issue.timestamp}</td>
                        <td className="py-2 px-3 font-semibold text-white">{issue.type}</td>
                        <td className="py-2 px-3 text-emerald-400">{issue.confidence}%</td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[10px] font-bold">
                            {issue.severity}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <img
                            src={issue.evidenceFrame}
                            alt="Evidence"
                            className="inline-block w-12 h-7 object-cover rounded border border-slate-700 cursor-pointer hover:border-cyan-400"
                            onClick={() => setSelectedTimelineEvent({
                              timestamp: issue.timestamp,
                              timestampSec: issue.timestampSec,
                              category: 'HAZARD',
                              title: `${issue.type} Detection`,
                              details: issue.description,
                              confidence: issue.confidence,
                              evidenceFrame: issue.evidenceFrame
                            })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 text-xs text-center">
                Potholes detected: 0 — No road surface defects found in this video footage.
              </div>
            )}
          </div>

          {/* Automated Number Plate Recognition (ANPR) Plates Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-yellow-400 uppercase flex items-center gap-1.5 font-mono">
                <span>🚘</span>
                <span>AUTOMATED NUMBER PLATE RECOGNITION (ANPR) ({uploadedReport.anprResults.length} Captured)</span>
              </span>
              <span className="text-slate-500 text-[11px]">
                {uploadedReport.anprResults.length === 0 ? 'No plates captured' : 'HSRP Indian Standards \u00b7 High-Resolution Crop Evidence'}
              </span>
            </div>
            {uploadedReport.anprResults.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="py-2 px-3">Plate Identifier</th>
                      <th className="py-2 px-3">Registration Number</th>
                      <th className="py-2 px-3">Vehicle Class</th>
                      <th className="py-2 px-3">State / Jurisdiction</th>
                      <th className="py-2 px-3">Timestamp</th>
                      <th className="py-2 px-3">OCR Confidence</th>
                      <th className="py-2 px-3 text-right">Plate Crop Evidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                    {uploadedReport.anprResults.map((plate, pIdx) => {
                      return (
                        <tr key={plate.id || `anpr-${pIdx}`} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono font-bold text-cyan-300">
                            {plate.id}
                            {plate.trackId >= 0 && <span className="text-slate-500 text-[10px] ml-1">#{plate.trackId}</span>}
                          </td>
                          <td className="py-2 px-3">
                            <div className="inline-flex items-center rounded border border-slate-600 bg-white text-slate-900 px-2 py-0.5 font-mono font-bold text-xs shadow-sm">
                              <span className="text-[8px] bg-blue-700 text-white px-1 py-0.2 rounded-l -ml-1.5 mr-1 font-sans">IND</span>
                              <span className="tracking-wider text-slate-950">{plate.plateNumber}</span>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-slate-200 font-semibold">{plate.vehicleClass || 'Vehicle'}</td>
                          <td className="py-2 px-3 text-slate-400 text-[11px]">{plate.stateOrRegion || plate.stateName || 'Regional Jurisdiction'}</td>
                          <td className="py-2 px-3 text-slate-300 font-mono text-[11px]">{plate.timestamp || '00:01'}</td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              plate.confidence >= 70 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                              plate.confidence >= 40 ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                              'bg-amber-950 text-amber-300 border border-amber-800'
                            }`}>
                              {plate.confidence > 0 ? `${plate.confidence}%` : 'Visual Crop'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            {plate.evidenceFrame ? (
                              <img
                                src={plate.evidenceFrame}
                                alt="Plate crop"
                                className="inline-block h-8 w-auto max-w-[120px] object-contain rounded border border-yellow-500/50 bg-slate-950 cursor-pointer hover:border-yellow-400 shadow-sm"
                                onClick={() => setSelectedTimelineEvent({
                                  timestamp: plate.timestamp || '00:01',
                                  timestampSec: plate.timestampSec || 1.0,
                                  category: 'ANPR',
                                  title: `ANPR: ${plate.plateNumber}`,
                                  details: `${plate.vehicleClass || 'Vehicle'} - ${plate.stateOrRegion || 'Regional Jurisdiction'} (${plate.confidence}% OCR confidence)`,
                                  confidence: plate.confidence,
                                  evidenceFrame: plate.evidenceFrame
                                })}
                              />
                            ) : (
                              <span className="text-slate-600 text-[11px]">No crop</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 text-xs text-center">
                No license plates visible in the extracted video frames.
              </div>
            )}
          </div>
        </div>
      )}

      {/* DEMO RESULTS DRAWER (Active strictly when in DEMO mode and analysis run) */}
      {mode === 'DEMO' && demoInferenceResult && (
        <div className="p-3.5 rounded-lg bg-amber-950/20 border border-amber-800/60 text-xs flex flex-col gap-2 font-mono">
          <div className="flex items-center justify-between">
            <span className="font-bold text-amber-400 flex items-center gap-1.5">
              <Crosshair className="w-4 h-4" />
              DEMO SIMULATION REPORT ({demoInferenceResult.mode})
            </span>
            <span className="text-slate-400 text-[11px]">
              Latency: {demoInferenceResult.frameAnalysis.latencyMs}ms | FPS: {demoInferenceResult.frameAnalysis.fps}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-1">
            <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
              <strong className="text-slate-400 block text-[10px]">EVENT CREATED:</strong>
              <span className="font-bold text-white">{demoInferenceResult.generatedEvent.id}</span> - {demoInferenceResult.generatedEvent.type}
              <div className="text-emerald-400 text-[11px] mt-0.5">
                GPS: {demoInferenceResult.generatedEvent.latitude}, {demoInferenceResult.generatedEvent.longitude}
              </div>
            </div>
            <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
              <strong className="text-slate-400 block text-[10px]">ANPR OCR RESULT:</strong>
              <span className="font-bold text-yellow-400">{demoInferenceResult.anprOcr.cleanedPlate}</span>
              <div className="text-slate-400 text-[11px] mt-0.5">State: {demoInferenceResult.anprOcr.stateCode}</div>
            </div>
            <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
              <strong className="text-slate-400 block text-[10px]">DATA OPTIMIZATION:</strong>
              <span className="text-purple-400 font-bold">
                {demoInferenceResult.bandwidthOptimization.bandwidthSavedPct} Data Saved
              </span>
              <div className="text-slate-400 text-[11px] mt-0.5">
                Payload: {demoInferenceResult.bandwidthOptimization.transmittedPayloadSize}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conceptual Pipeline Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
          <div className="text-slate-400 text-[10px] font-mono">1. OBJECT DETECTION</div>
          <div className="font-bold text-slate-200 mt-0.5">
            {mode === 'UPLOAD'
              ? uploadedReport
                ? `${uploadedReport.vehicleCounts.uniqueVehicles} Vehicles, ${uploadedReport.vehicleCounts.pedestrians} Peds`
                : 'Awaiting Video'
              : 'YOLOv8 Real-time'}
          </div>
          <div className="text-[11px] text-cyan-400">
            {mode === 'UPLOAD'
              ? uploadedReport?.roadIssues.length
                ? `${uploadedReport.roadIssues.length} Hazards`
                : 'Potholes: 0'
              : 'Pothole (94%), Car (95%)'}
          </div>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
          <div className="text-slate-400 text-[10px] font-mono">2. VEHICLE TRACKING</div>
          <div className="font-bold text-slate-200 mt-0.5">
            {mode === 'UPLOAD' ? 'ByteTrack Trajectory' : 'ByteTrack Trajectory'}
          </div>
          <div className="text-[11px] text-emerald-400">
            {mode === 'UPLOAD' && uploadedReport
              ? `${uploadedReport.vehicleCounts.uniqueVehicles} Unique IDs`
              : 'Track ID #17 (48 km/h)'}
          </div>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
          <div className="text-slate-400 text-[10px] font-mono">3. OCR / ANPR</div>
          <div className="font-bold text-slate-200 mt-0.5">Plate Identification</div>
          <div className="text-[11px] text-amber-400 font-mono truncate">
            {mode === 'UPLOAD' && uploadedReport
              ? uploadedReport.anprResults[0]?.plateNumber || 'Plates: 0'
              : 'TN 38 AB 1234 (91%)'}
          </div>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
          <div className="text-slate-400 text-[10px] font-mono">4. EDGE BANDWIDTH</div>
          <div className="font-bold text-slate-200 mt-0.5">Metadata Only</div>
          <div className="text-[11px] text-purple-400">99.98% Bandwidth Saved</div>
        </div>
      </div>

      {/* Comprehensive Audit Report Modal */}
      {showReportModal && uploadedReport && (
        <UploadedVideoReportModal
          report={uploadedReport}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  );
};
