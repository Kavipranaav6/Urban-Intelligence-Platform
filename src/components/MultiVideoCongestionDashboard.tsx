import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Upload,
  Play,
  Pause,
  RefreshCw,
  Video,
  Bus as BusIcon,
  Route,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Car,
  Clock,
  Gauge,
  MapPin,
  TrendingUp,
  Sparkles,
  Eye,
  Layers,
  ChevronRight,
  ExternalLink,
  ShieldAlert,
  FileText
} from 'lucide-react';
import {
  Bus,
  MultiVideoSlot,
  RouteCongestionAnalysis,
  MultiVideoFleetCongestionSummary,
  UploadedVideoMetadata,
  SampledFrameData,
  UploadedVideoReport
} from '../types';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { SAMPLE_VIDEOS, generateSyntheticTestVideo } from '../utils/sampleVideoGenerator';
import { UploadedVideoReportModal } from './UploadedVideoReportModal';
import { GISMap } from './GISMap';

export const MultiVideoCongestionDashboard: React.FC = () => {
  const { buses } = useApp();

  // 4 Video Slots mapped to 4 Buses and their respective Routes
  const [slots, setSlots] = useState<MultiVideoSlot[]>([
    {
      slotId: 1,
      assignedBusId: 'BUS-101',
      assignedRouteId: 'R-01',
      assignedRouteName: 'Route 1 - North-South Express',
      videoFile: null,
      videoUrl: null,
      status: 'IDLE',
      progress: 0,
      report: null
    },
    {
      slotId: 2,
      assignedBusId: 'BUS-102',
      assignedRouteId: 'R-04',
      assignedRouteName: 'Route 4 - City Loop South',
      videoFile: null,
      videoUrl: null,
      status: 'IDLE',
      progress: 0,
      report: null
    },
    {
      slotId: 3,
      assignedBusId: 'BUS-103',
      assignedRouteId: 'R-12',
      assignedRouteName: 'Route 12 - Airport Arterial Corridor',
      videoFile: null,
      videoUrl: null,
      status: 'IDLE',
      progress: 0,
      report: null
    },
    {
      slotId: 4,
      assignedBusId: 'BUS-105',
      assignedRouteId: 'R-07',
      assignedRouteName: 'Route 7 - Tech Park Ring',
      videoFile: null,
      videoUrl: null,
      status: 'IDLE',
      progress: 0,
      report: null
    }
  ]);

  // Active playing states
  const [isPlayingMap, setIsPlayingMap] = useState<Record<number, boolean>>({
    1: true,
    2: true,
    3: true,
    4: true
  });

  // Overall batch state
  const [isAnalyzingAll, setIsAnalyzingAll] = useState<boolean>(false);
  const [isGeneratingSamples, setIsGeneratingSamples] = useState<boolean>(false);
  const [fleetSummary, setFleetSummary] = useState<MultiVideoFleetCongestionSummary | null>(null);

  // Modal report state
  const [selectedReport, setSelectedReport] = useState<UploadedVideoReport | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);

  // Derive congestion-coloured route overlays for the GIS map
  const congestionRoutes = useMemo(() => {
    const list: Array<{
      busId: string;
      waypoints: [number, number][];
      congestionLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      routeName: string;
      densityScore: number;
    }> = [];

    slots.forEach(slot => {
      const bus = buses.find(b => b.id === slot.assignedBusId);
      if (bus && bus.routeWaypoints && bus.routeWaypoints.length >= 2) {
        list.push({
          busId: slot.assignedBusId,
          waypoints: bus.routeWaypoints,
          congestionLevel: slot.congestionAnalysis?.congestionLevel || 'LOW',
          routeName: slot.assignedRouteName,
          densityScore: slot.congestionAnalysis?.densityScore || 20
        });
      }
    });

    return list.length > 0 ? list : undefined;
  }, [slots, buses]);

  // Hidden file input refs
  const slotFileInputs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null)
  ];
  const slotCsvInputs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null)
  ];
  const globalMultiFileInput = useRef<HTMLInputElement>(null);
  const globalCsvInputRef = useRef<HTMLInputElement>(null);

  // Video element refs for sampling frames
  const videoRefs = [
    useRef<HTMLVideoElement>(null),
    useRef<HTMLVideoElement>(null),
    useRef<HTMLVideoElement>(null),
    useRef<HTMLVideoElement>(null)
  ];

  // Overlay canvas refs for bounding boxes
  const canvasRefs = [
    useRef<HTMLCanvasElement>(null),
    useRef<HTMLCanvasElement>(null),
    useRef<HTMLCanvasElement>(null),
    useRef<HTMLCanvasElement>(null)
  ];

  // Handle GPS CSV attachment for all slots at once
  const handleGlobalCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setSlots((prev) =>
        prev.map((s) => ({
          ...s,
          gpsCsvFile: file,
          gpsCsvContent: text
        }))
      );
    } catch (err) {
      console.error('Failed to read global GPS CSV:', err);
    }
  };

  // Handle GPS CSV attachment for a slot
  const handleSlotCsvUpload = async (slotId: number, file: File) => {
    try {
      const text = await file.text();
      setSlots((prev) =>
        prev.map((s) =>
          s.slotId === slotId
            ? {
                ...s,
                gpsCsvFile: file,
                gpsCsvContent: text
              }
            : s
        )
      );
    } catch (err) {
      console.error(`Failed to read GPS CSV for slot ${slotId}:`, err);
    }
  };

  const handleRemoveSlotCsv = (slotId: number) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.slotId === slotId
          ? {
              ...s,
              gpsCsvFile: null,
              gpsCsvContent: null
            }
          : s
      )
    );
  };

  // Update bus mapping when user changes dropdown
  const handleBusChange = (slotId: number, busId: string) => {
    const bus = buses.find((b) => b.id === busId);
    if (!bus) return;
    setSlots((prev) =>
      prev.map((s) =>
        s.slotId === slotId
          ? {
              ...s,
              assignedBusId: bus.id,
              assignedRouteId: bus.routeId,
              assignedRouteName: bus.routeName,
              congestionAnalysis: s.congestionAnalysis
                ? {
                    ...s.congestionAnalysis,
                    busId: bus.id,
                    routeId: bus.routeId,
                    routeName: bus.routeName,
                    corridorName: bus.routeName.includes('-')
                      ? bus.routeName.split('-')[1].trim()
                      : bus.routeName
                  }
                : undefined
            }
          : s
      )
    );
  };

  // Handle single file upload for a slot
  const handleSlotFileUpload = (slotId: number, file: File) => {
    const url = URL.createObjectURL(file);
    setSlots((prev) =>
      prev.map((s) =>
        s.slotId === slotId
          ? {
              ...s,
              videoFile: file,
              videoUrl: url,
              status: 'IDLE',
              progress: 0,
              report: null,
              congestionAnalysis: undefined
            }
          : s
      )
    );
  };

  // Handle global multi-file selection (up to 4 videos at once)
  const handleMultiFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files as FileList).slice(0, 4) as File[];
    setSlots((prev) =>
      prev.map((slot, index) => {
        if (index < fileList.length) {
          const file = fileList[index];
          return {
            ...slot,
            videoFile: file,
            videoUrl: URL.createObjectURL(file),
            status: 'IDLE',
            progress: 0,
            report: null,
            congestionAnalysis: undefined
          };
        }
        return slot;
      })
    );
  };

  // One-click 4-corridor realistic video test suite generator
  const handleLoad4SampleVideos = async () => {
    setIsGeneratingSamples(true);
    try {
      for (let i = 0; i < 4 && i < SAMPLE_VIDEOS.length; i++) {
        const sample = SAMPLE_VIDEOS[i];
        setSlots((prev) =>
          prev.map((s, idx) =>
            idx === i ? { ...s, status: 'LOADING', progress: 30 } : s
          )
        );

        const file = await generateSyntheticTestVideo(
          sample.sceneType,
          sample.durationSec,
          sample.fileName
        );
        const url = URL.createObjectURL(file);

        setSlots((prev) =>
          prev.map((s, idx) =>
            idx === i
              ? {
                  ...s,
                  videoFile: file,
                  videoUrl: url,
                  assignedBusId: sample.defaultBusId,
                  assignedRouteName: sample.defaultRouteName,
                  status: 'IDLE',
                  progress: 0,
                  report: null,
                  congestionAnalysis: undefined
                }
              : s
          )
        );
      }
    } catch (err) {
      console.error('Failed to generate 4 sample videos:', err);
    } finally {
      setIsGeneratingSamples(false);
    }
  };

  // Extract frames from a video element at specified intervals
  const extractFramesFromVideo = async (
    video: HTMLVideoElement,
    file: File
  ): Promise<{ metadata: UploadedVideoMetadata; sampledFrames: SampledFrameData[] }> => {
    const duration = video.duration || 4.5;
    const fps = 30;
    const totalFrames = Math.round(duration * fps);
    const sampleCount = duration <= 5 ? 8 : Math.min(16, Math.max(8, Math.floor(duration / 3)));
    const sampledFrames: SampledFrameData[] = [];

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = 1280;
    offscreenCanvas.height = 720;
    const ctx = offscreenCanvas.getContext('2d')!;

    const origTime = video.currentTime;
    const wasPlaying = !video.paused;
    video.pause();

    for (let i = 0; i < sampleCount; i++) {
      const timeFraction = (i + 0.5) / sampleCount;
      const targetTime = Math.min(duration - 0.1, Math.max(0.1, duration * timeFraction));

      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = targetTime;
      });

      ctx.drawImage(video, 0, 0, 640, 360);
      const frameDataUrl = offscreenCanvas.toDataURL('image/jpeg', 0.85);

      const min = Math.floor(targetTime / 60);
      const sec = Math.floor(targetTime % 60);
      sampledFrames.push({
        timestamp: `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`,
        timestampSec: Number(targetTime.toFixed(2)),
        frameIndex: Math.round(targetTime * fps),
        frameDataUrl
      });
    }

    video.currentTime = origTime;
    if (wasPlaying) {
      video.play().catch(() => {});
    }

    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);

    const metadata: UploadedVideoMetadata = {
      fileName: file.name,
      fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      duration: Number(duration.toFixed(2)),
      durationFormatted: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
      fps,
      totalFrames,
      framesAnalyzed: sampledFrames.length,
      resolution: `${video.videoWidth || 1280}x${video.videoHeight || 720}`
    };

    return { metadata, sampledFrames };
  };

  // Analyze all 4 videos
  const handleAnalyzeAllVideos = async () => {
    // Check which slots have videos ready
    const activeSlots = slots.filter((s) => s.videoFile && s.videoUrl);
    if (activeSlots.length === 0) {
      alert('Please upload or load video files into the slots first.');
      return;
    }

    setIsAnalyzingAll(true);

    try {
      const extractedPayloads: Array<{
        slotId: number;
        busId: string;
        videoMetadata: UploadedVideoMetadata;
        sampledFrames: SampledFrameData[];
        gpsCsvContent?: string;
      }> = [];

      // Step 1: Extract frames from all available videos
      for (const slot of activeSlots) {
        const videoEl = videoRefs[slot.slotId - 1].current;
        if (!videoEl || !slot.videoFile) continue;

        setSlots((prev) =>
          prev.map((s) =>
            s.slotId === slot.slotId
              ? { ...s, status: 'EXTRACTING', progress: 40 }
              : s
          )
        );

        const { metadata, sampledFrames } = await extractFramesFromVideo(
          videoEl,
          slot.videoFile
        );

        extractedPayloads.push({
          slotId: slot.slotId,
          busId: slot.assignedBusId,
          videoMetadata: metadata,
          sampledFrames,
          gpsCsvContent: slot.gpsCsvContent || undefined
        });

        setSlots((prev) =>
          prev.map((s) =>
            s.slotId === slot.slotId
              ? { ...s, status: 'ANALYZING', progress: 75, videoMetadata: metadata }
              : s
          )
        );
      }

      // Step 2: Call batch multi-video analysis API
      const response = await api.analyzeMultiVideos(extractedPayloads);

      // Step 3: Update slots with detection and congestion results
      setSlots((prev) =>
        prev.map((slot) => {
          const match = response.results.find((r) => r.slotId === slot.slotId);
          if (match) {
            return {
              ...slot,
              status: 'COMPLETED',
              progress: 100,
              report: match.report,
              congestionAnalysis: match.congestionAnalysis
            };
          }
          return slot;
        })
      );

      setFleetSummary(response.fleetSummary);
    } catch (err: any) {
      console.error('Multi-video batch analysis failed:', err);
      alert(`Multi-video analysis error: ${err.message || 'Unknown failure'}`);
    } finally {
      setIsAnalyzingAll(false);
    }
  };

  // Draw bounding boxes on video overlay canvas synchronized with playback time
  const drawBoxesOnCanvas = (slotId: number) => {
    const slot = slots.find((s) => s.slotId === slotId);
    if (!slot || !slot.report || !slot.report.processedFrames) return;

    const video = videoRefs[slotId - 1].current;
    const canvas = canvasRefs[slotId - 1].current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const currentTime = video.currentTime;
    let bestFrame = slot.report.processedFrames[0];
    let minDiff = Infinity;

    for (const frame of slot.report.processedFrames) {
      const diff = Math.abs(frame.timestampSec - currentTime);
      if (diff < minDiff) {
        minDiff = diff;
        bestFrame = frame;
      }
    }

    if (!bestFrame) return;

    const w = canvas.width;
    const h = canvas.height;

    for (const det of bestFrame.detections) {
      const bx = det.x * w;
      const by = det.y * h;
      const bw = det.width * w;
      const bh = det.height * h;

      ctx.strokeStyle = det.color || '#06b6d4';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(bx, by, bw, bh);

      // Label badge
      ctx.fillStyle = det.color || '#06b6d4';
      ctx.fillRect(bx, Math.max(0, by - 18), Math.min(130, bw + 20), 18);
      ctx.fillStyle = '#020617';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(det.label || 'VEHICLE', bx + 4, Math.max(12, by - 5));
    }
  };

  // Hook playback time updates to canvas
  const handleTimeUpdate = (slotId: number) => {
    drawBoxesOnCanvas(slotId);
  };

  // Toggle play/pause for a slot
  const togglePlay = (slotId: number) => {
    const video = videoRefs[slotId - 1].current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlayingMap((prev) => ({ ...prev, [slotId]: true }));
    } else {
      video.pause();
      setIsPlayingMap((prev) => ({ ...prev, [slotId]: false }));
    }
  };

  // Color helper for congestion levels
  const getCongestionBadge = (level?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') => {
    switch (level) {
      case 'CRITICAL':
        return {
          bg: 'bg-rose-950/90 text-rose-300 border-rose-600',
          dot: 'bg-rose-500',
          label: 'CRITICAL CONGESTION',
          borderRing: 'ring-1 ring-rose-500/50'
        };
      case 'HIGH':
        return {
          bg: 'bg-orange-950/90 text-orange-300 border-orange-600',
          dot: 'bg-orange-500',
          label: 'HIGH CONGESTION',
          borderRing: 'ring-1 ring-orange-500/50'
        };
      case 'MEDIUM':
        return {
          bg: 'bg-amber-950/90 text-amber-300 border-amber-600',
          dot: 'bg-amber-500',
          label: 'MODERATE TRAFFIC',
          borderRing: 'ring-1 ring-amber-500/50'
        };
      case 'LOW':
        return {
          bg: 'bg-emerald-950/90 text-emerald-300 border-emerald-600',
          dot: 'bg-emerald-500',
          label: 'FREE FLOW',
          borderRing: 'ring-1 ring-emerald-500/50'
        };
      default:
        return {
          bg: 'bg-slate-900 text-slate-400 border-slate-700',
          dot: 'bg-slate-500',
          label: 'AWAITING AI INFERENCE',
          borderRing: ''
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Multi-Video Master Actions */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/95 to-cyan-950/30 border border-slate-800 shadow-xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <Video className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white tracking-wide uppercase font-mono flex items-center gap-2">
                  4-BUS MULTI-VIDEO FLEET INGESTION & TRAFFIC CONGESTION ANALYTICS
                  <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 text-[10px] font-bold">
                    EDGE SENSING PIPELINE
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Concurrently ingest 4 onboard camera streams mapped to 4 transit buses across distinct urban corridors.
                  Detect vehicles in real-time, compute route density, and monitor traffic bottlenecks on the GIS map.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Global multi-file input */}
            <input
              type="file"
              ref={globalMultiFileInput}
              onChange={handleMultiFileUpload}
              multiple
              accept="video/*"
              className="hidden"
            />

            {/* Global GPS CSV input for all 4 slots */}
            <input
              type="file"
              ref={globalCsvInputRef}
              onChange={handleGlobalCsvUpload}
              accept=".csv"
              className="hidden"
            />

            <button
              onClick={() => globalMultiFileInput.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-mono font-semibold transition shadow-sm"
              title="Select up to 4 video files from your device"
            >
              <Upload className="w-3.5 h-3.5 text-cyan-400" />
              <span>Upload 4 Videos</span>
            </button>

            <button
              onClick={() => globalCsvInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-mono font-semibold transition shadow-sm"
              title="Attach a single Location CSV trace to all 4 video slots"
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>Attach Location CSV (All Slots)</span>
            </button>

            <button
              onClick={handleLoad4SampleVideos}
              disabled={isGeneratingSamples || isAnalyzingAll}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-950/80 hover:bg-cyan-900/90 text-cyan-300 border border-cyan-700 text-xs font-mono font-bold transition shadow-sm disabled:opacity-50"
            >
              <Sparkles className={`w-3.5 h-3.5 text-cyan-400 ${isGeneratingSamples ? 'animate-spin' : ''}`} />
              <span>{isGeneratingSamples ? 'Generating 4 Feeds...' : 'Load 4 Route Demo Videos'}</span>
            </button>

            <button
              onClick={handleAnalyzeAllVideos}
              disabled={isAnalyzingAll || isGeneratingSamples}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-mono font-bold text-xs shadow-lg shadow-cyan-500/20 transition disabled:opacity-50 cursor-pointer"
            >
              <Cpu className={`w-4 h-4 ${isAnalyzingAll ? 'animate-spin' : ''}`} />
              <span>{isAnalyzingAll ? 'Analyzing 4 Feeds...' : 'Run AI Detection On All 4 Feeds'}</span>
            </button>
          </div>
        </div>

        {/* Fleet Congestion Live Summary Bar */}
        {fleetSummary && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-2 md:grid-cols-5 gap-3 font-mono text-xs">
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="text-slate-400 text-[10px] uppercase block">Total Vehicles Detected</span>
              <strong className="text-cyan-400 text-lg font-bold">{fleetSummary.totalVehiclesDetected}</strong>
              <span className="text-[10px] text-slate-500 ml-1">across 4 routes</span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="text-slate-400 text-[10px] uppercase block">City Congestion Index</span>
              <div className="flex items-center gap-1.5">
                <strong className={`text-lg font-bold ${
                  fleetSummary.overallCongestionLevel === 'CRITICAL' ? 'text-rose-400' :
                  fleetSummary.overallCongestionLevel === 'HIGH' ? 'text-orange-400' :
                  fleetSummary.overallCongestionLevel === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {fleetSummary.avgCityCongestionScore}%
                </strong>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${getCongestionBadge(fleetSummary.overallCongestionLevel).bg}`}>
                  {fleetSummary.overallCongestionLevel}
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="text-slate-400 text-[10px] uppercase block">Highest Congestion Corridor</span>
              <strong className="text-rose-300 text-xs block truncate mt-1" title={fleetSummary.highestCongestionRoute}>
                {fleetSummary.highestCongestionRoute}
              </strong>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="text-slate-400 text-[10px] uppercase block">Critical Bottlenecks</span>
              <strong className="text-amber-400 text-lg font-bold">{fleetSummary.criticalBottlenecksCount}</strong>
              <span className="text-[10px] text-slate-500 ml-1">junctions flagged</span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="text-slate-400 text-[10px] uppercase block">Edge Transmit Saved</span>
              <strong className="text-emerald-400 text-lg font-bold">99.9%</strong>
              <span className="text-[10px] text-slate-500 ml-1">raw video retained</span>
            </div>
          </div>
        )}
      </div>

      {/* 4-Video Grid: Each Video Mapped to a Bus and Route */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {slots.map((slot, index) => {
          const bus = buses.find((b) => b.id === slot.assignedBusId) || buses[0];
          const badge = getCongestionBadge(slot.congestionAnalysis?.congestionLevel);
          const hasVideo = Boolean(slot.videoUrl);

          return (
            <div
              key={slot.slotId}
              className={`flex flex-col rounded-2xl bg-slate-900 border transition shadow-lg ${
                slot.congestionAnalysis?.congestionLevel === 'CRITICAL'
                  ? 'border-rose-900/60 shadow-rose-950/20'
                  : 'border-slate-800'
              }`}
            >
              {/* Header: Video Slot # + Bus Mapping Dropdown + Route Badge */}
              <div className="p-3.5 bg-slate-950/90 rounded-t-2xl border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono font-bold text-xs border border-cyan-500/40">
                    VIDEO {slot.slotId}
                  </span>
                  <span className="text-slate-500 text-xs">➔</span>

                  {/* Bus Selector Dropdown */}
                  <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-lg border border-slate-700">
                    <BusIcon className="w-3.5 h-3.5 text-cyan-400" />
                    <select
                      value={slot.assignedBusId}
                      onChange={(e) => handleBusChange(slot.slotId, e.target.value)}
                      className="bg-transparent text-xs font-mono font-bold text-cyan-300 outline-none cursor-pointer"
                    >
                      {buses.map((b) => (
                        <option key={b.id} value={b.id} className="bg-slate-900 text-white">
                          {b.id} ({b.routeName.split('-')[0].trim()})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Mapped Route Indicator */}
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <Route className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-slate-300 truncate max-w-[200px]" title={slot.assignedRouteName}>
                    {slot.assignedRouteName}
                  </span>
                </div>
              </div>

              {/* GPS CSV Telemetry Attachment Control */}
              <div className="px-3.5 py-1.5 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between text-xs font-mono">
                <input
                  type="file"
                  ref={slotCsvInputs[index]}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleSlotCsvUpload(slot.slotId, file);
                  }}
                  accept=".csv"
                  className="hidden"
                />
                {slot.gpsCsvFile ? (
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="font-bold text-[11px] truncate max-w-[210px]" title={slot.gpsCsvFile.name}>
                        {slot.gpsCsvFile.name}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        ({(slot.gpsCsvFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveSlotCsv(slot.slotId)}
                      className="text-slate-400 hover:text-rose-400 text-[10px] font-bold px-1.5 py-0.5 rounded hover:bg-rose-950/40 border border-transparent hover:border-rose-800/40 transition cursor-pointer"
                      title="Remove attached GPS CSV"
                    >
                      Remove ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between w-full">
                    <span className="text-slate-500 text-[11px] flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-600" />
                      GPS: Default corridor
                    </span>
                    <button
                      type="button"
                      onClick={() => slotCsvInputs[index].current?.click()}
                      className="text-cyan-400 hover:text-cyan-300 text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800/80 transition cursor-pointer"
                    >
                      + Attach Location CSV
                    </button>
                  </div>
                )}
              </div>

              {/* Video Player & Synchronized AI Bounding Box Canvas Overlay */}
              <div className="relative aspect-video bg-slate-950 overflow-hidden flex items-center justify-center group">
                {hasVideo ? (
                  <>
                    <video
                      ref={videoRefs[index]}
                      src={slot.videoUrl!}
                      autoPlay
                      loop
                      muted
                      playsInline
                      onTimeUpdate={() => handleTimeUpdate(slot.slotId)}
                      className="w-full h-full object-cover"
                    />

                    {/* AI Bounding Box Overlay Canvas */}
                    <canvas
                      ref={canvasRefs[index]}
                      width={640}
                      height={360}
                      className="absolute inset-0 w-full h-full pointer-events-none z-10"
                    />

                    {/* HUD Telemetry Overlay (Top Left) */}
                    <div className="absolute top-2.5 left-2.5 z-20 px-2 py-1 rounded bg-slate-950/80 backdrop-blur-sm border border-slate-700/80 text-[10px] font-mono text-slate-300 pointer-events-none flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <strong className="text-cyan-400">{bus.id}</strong>
                      <span>|</span>
                      <span>SPEED: {bus.speed} km/h</span>
                      <span>|</span>
                      <span className="text-amber-400">{bus.driver || 'R. Selvam'}</span>
                    </div>

                    {/* Play/Pause Button on Hover */}
                    <button
                      onClick={() => togglePlay(slot.slotId)}
                      className="absolute bottom-2.5 left-2.5 z-20 p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700 opacity-0 group-hover:opacity-100 transition shadow-lg cursor-pointer"
                    >
                      {isPlayingMap[slot.slotId] ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                  </>
                ) : (
                  /* Empty state / file dropzone */
                  <div className="p-6 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
                      <Video className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-mono text-slate-300 font-semibold">
                        No Video Uploaded for {bus.id}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Mapped to {slot.assignedRouteName}
                      </p>
                    </div>

                    <input
                      type="file"
                      ref={slotFileInputs[index]}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleSlotFileUpload(slot.slotId, file);
                      }}
                      accept="video/*"
                      className="hidden"
                    />

                    <button
                      onClick={() => slotFileInputs[index].current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-cyan-950 text-cyan-300 hover:bg-cyan-900 border border-cyan-800 text-xs font-mono font-semibold transition"
                    >
                      Upload Video File
                    </button>
                  </div>
                )}

                {/* Progress Overlay during extraction or AI analysis */}
                {(slot.status === 'EXTRACTING' || slot.status === 'ANALYZING' || slot.status === 'LOADING') && (
                  <div className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center space-y-2">
                    <Cpu className="w-7 h-7 text-cyan-400 animate-spin" />
                    <p className="text-xs font-mono font-bold text-white">
                      {slot.status === 'EXTRACTING' && 'EXTRACTING SENSOR FRAMES...'}
                      {slot.status === 'ANALYZING' && 'RUNNING AI VEHICLE DETECTION...'}
                      {slot.status === 'LOADING' && 'GENERATING SCENARIO VIDEO...'}
                    </p>
                    <div className="w-48 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-400 transition-all duration-300"
                        style={{ width: `${slot.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Card Footer: Vehicle Detection Counts & Traffic Congestion Analytics */}
              <div className="p-4 bg-slate-900/90 rounded-b-2xl space-y-3 font-mono text-xs">
                {/* Congestion Status Pill & Score */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold ${badge.bg} ${badge.borderRing}`}>
                      <span className={`w-2 h-2 rounded-full ${badge.dot}`}></span>
                      <span>{badge.label}</span>
                    </span>

                    {slot.congestionAnalysis && (
                      <span className="text-slate-400 text-[11px]">
                        Score: <strong className="text-white">{slot.congestionAnalysis.densityScore}/100</strong>
                      </span>
                    )}
                  </div>

                  {slot.report && (
                    <button
                      onClick={() => {
                        setSelectedReport(slot.report);
                        setShowModal(true);
                      }}
                      className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold transition"
                    >
                      <span>Full AI Report</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Detected Vehicle Counts Breakdown */}
                {slot.report ? (
                  <div className="grid grid-cols-4 gap-2 text-center pt-1 border-t border-slate-800/80">
                    <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">TOTAL</span>
                      <strong className="text-cyan-400 text-sm">
                        {slot.report.vehicleCounts.uniqueVehicles}
                      </strong>
                    </div>

                    <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">CARS</span>
                      <strong className="text-blue-400 text-sm">
                        {slot.report.vehicleCounts.cars}
                      </strong>
                    </div>

                    <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">COMMERCIAL</span>
                      <strong className="text-purple-400 text-sm">
                        {slot.report.vehicleCounts.trucks + slot.report.vehicleCounts.buses}
                      </strong>
                    </div>

                    <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">TWO-WHEELER</span>
                      <strong className="text-emerald-400 text-sm">
                        {slot.report.vehicleCounts.motorcycles + slot.report.vehicleCounts.bicycles}
                      </strong>
                    </div>
                  </div>
                ) : (
                  <div className="p-2 rounded bg-slate-950/60 border border-slate-800 text-[11px] text-slate-500 text-center">
                    Vehicle classification & density calculation will display after AI execution.
                  </div>
                )}

                {/* Route Impact & Delay Metric */}
                {slot.congestionAnalysis && (
                  <div className="pt-2 border-t border-slate-800/80 text-[11px] space-y-1">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Corridor Operating Speed:</span>
                      <strong className="text-white">
                        {slot.congestionAnalysis.avgOperatingSpeedKmH} km/h
                      </strong>
                    </div>

                    <div className="flex items-center justify-between text-slate-400">
                      <span>Schedule Delay Impact:</span>
                      <strong className={slot.congestionAnalysis.estimatedDelayMinutes > 10 ? 'text-rose-400' : 'text-emerald-400'}>
                        +{slot.congestionAnalysis.estimatedDelayMinutes} mins delay
                      </strong>
                    </div>

                    {slot.congestionAnalysis.bottleneckDetected && (
                      <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 text-[10px] flex items-start gap-1.5 mt-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400 mt-0.5" />
                        <div>
                          <strong>Bottleneck:</strong> {slot.congestionAnalysis.bottleneckLocation}
                          <p className="text-slate-300 mt-0.5">{slot.congestionAnalysis.recommendedAction}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* GIS Map Visualization of All 4 Buses & Corridors */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold font-mono text-white uppercase tracking-wider">
                GIS CORRIDOR TRAFFIC HEATMAP & FLEET POSITIONS
              </h3>
              <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 text-[10px] font-mono border border-cyan-800">
                LIVE SPATIAL CORRELATION
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Visualizes the 4 buses on their active route corridors. Routes and markers reflect detected vehicle congestion levels.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <div className="flex items-center gap-1 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span>Free Flow</span>
            </div>
            <div className="flex items-center gap-1 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span>Moderate</span>
            </div>
            <div className="flex items-center gap-1 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
              <span>High</span>
            </div>
            <div className="flex items-center gap-1 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              <span>Critical</span>
            </div>
          </div>
        </div>

        <div className="h-[380px] w-full rounded-xl overflow-hidden border border-slate-800">
          <GISMap
            buses={buses}
            showHeatmap={true}
            center={[11.0168, 76.97]}
            zoom={13}
            height="380px"
            tileLayer="street"
            autoFitBounds={true}
            congestionRoutes={congestionRoutes}
          />
        </div>
      </div>

      {/* Full AI Report Modal for deep-dive inspection */}
      {showModal && selectedReport && (
        <UploadedVideoReportModal
          report={selectedReport}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
};
