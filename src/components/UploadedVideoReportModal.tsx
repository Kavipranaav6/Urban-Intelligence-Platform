import React, { useState } from 'react';
import {
  X,
  FileText,
  Video,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Car,
  Shield,
  Layers,
  Calendar,
  Clock,
  Download,
  Eye,
  Camera,
  Activity,
  Maximize2,
  Zap,
  MapPin,
  CreditCard,
  ShieldAlert
} from 'lucide-react';
import { UploadedVideoReport, VideoRoadIssueDetection, OffendingVehicleIncident } from '../types';
import { generateVideoIntelligencePDF } from '../utils/pdfGenerator';

interface UploadedVideoReportModalProps {
  report: UploadedVideoReport;
  onClose: () => void;
}

export const UploadedVideoReportModal: React.FC<UploadedVideoReportModalProps> = ({ report, onClose }) => {
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'HAZARDS' | 'VEHICLES' | 'ANPR' | 'SAFETY' | 'TIMELINE' | 'EVIDENCE'>('SUMMARY');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [incidentStatuses, setIncidentStatuses] = useState<Record<string, 'NEW' | 'ACKNOWLEDGED' | 'RESOLVED'>>({});
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  const getIncidentStatus = (id: string, defaultStatus: string = 'NEW'): 'NEW' | 'ACKNOWLEDGED' | 'RESOLVED' => {
    if (incidentStatuses[id]) return incidentStatuses[id];
    if (defaultStatus === 'RESOLVED' || defaultStatus === 'ACKNOWLEDGED') return defaultStatus;
    return 'NEW';
  };

  const cycleStatus = (id: string, current: 'NEW' | 'ACKNOWLEDGED' | 'RESOLVED') => {
    const nextMap: Record<'NEW' | 'ACKNOWLEDGED' | 'RESOLVED', 'NEW' | 'ACKNOWLEDGED' | 'RESOLVED'> = {
      NEW: 'ACKNOWLEDGED',
      ACKNOWLEDGED: 'RESOLVED',
      RESOLVED: 'NEW'
    };
    setIncidentStatuses(prev => ({ ...prev, [id]: nextMap[current] }));
  };

  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);
    try {
      await generateVideoIntelligencePDF(report);
    } catch (err) {
      console.error('Failed to generate video intelligence PDF report:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownloadJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `UrbanSense_${report.video.fileName}_Report.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-800">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  UPLOADED VIDEO INTELLIGENCE AUDIT REPORT
                </h2>
                <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 text-[10px] font-mono font-bold">
                  {report.mode}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                  report.isRealModelInference
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                    : 'bg-amber-950 text-amber-400 border-amber-800'
                }`}>
                  {report.inferenceEngine}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Report ID: <span className="text-cyan-300">{report.id}</span> | Generated: {report.generatedAt}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white shadow transition active:scale-95 disabled:opacity-50"
              title="Download PDF Inspection Report with Incident Frame Evidence"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{isExportingPdf ? 'Exporting PDF...' : 'Export PDF'}</span>
            </button>
            <button
              onClick={handleDownloadJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition active:scale-95"
              title="Download JSON Report"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-slate-800 bg-slate-900/80 text-xs font-mono">
          {[
            { id: 'SUMMARY', label: '1. Executive Summary' },
            { id: 'HAZARDS', label: `2. Road Hazards (${report.roadIssues.length})` },
            { id: 'VEHICLES', label: `3. Vehicles & Traffic (${report.vehicleCounts.uniqueVehicles})` },
            { id: 'ANPR', label: `4. ANPR / Plates (${report.anprResults.length})` },
            { id: 'SAFETY', label: `5. 🚨 Safety Incidents (${(report.safetyIncidents || []).length})` },
            { id: 'TIMELINE', label: `6. Detection Timeline (${report.detectionTimeline.length})` },
            { id: 'EVIDENCE', label: `7. Evidence Frames (${report.sampledFrames.length})` }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-2 border-b-2 font-semibold transition ${
                activeTab === tab.id
                  ? 'border-cyan-400 text-cyan-300 bg-cyan-950/30'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-200">
          {/* TAB 1: SUMMARY */}
          {activeTab === 'SUMMARY' && (
            <div className="space-y-6">
              {/* Video & Processing Metadata Header Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[11px] font-mono text-slate-400">VIDEO FILE</div>
                  <div className="font-bold text-white text-sm truncate mt-1" title={report.video.fileName}>
                    {report.video.fileName}
                  </div>
                  <div className="text-[11px] font-mono text-cyan-400 mt-0.5">
                    {report.video.fileSize} | {report.video.resolution}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[11px] font-mono text-slate-400">DURATION & FPS</div>
                  <div className="font-bold text-white text-sm mt-1">
                    {report.video.durationFormatted} ({report.video.duration.toFixed(1)}s)
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    {report.video.fps} FPS ({report.video.totalFrames} total frames)
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[11px] font-mono text-slate-400">FRAMES ANALYZED</div>
                  <div className="font-bold text-emerald-400 text-sm mt-1">
                    {report.video.framesAnalyzed} Sampled Frames
                  </div>
                  <div className="text-[11px] font-mono text-emerald-300 mt-0.5">
                    Status: COMPLETED (100%)
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[11px] font-mono text-slate-400">INFERENCE ENGINE</div>
                  <div className="font-bold text-cyan-300 text-xs mt-1 truncate">
                    {report.inferenceEngine}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    {report.isRealModelInference ? 'Gemini 3.8 Vision Active' : 'AI Analysis Simulation Fallback'}
                  </div>
                </div>
              </div>

              {/* High-Level Overview Box */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold font-mono text-white uppercase tracking-wider">
                    AI VISION INSPECTION SUMMARY
                  </h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  {report.summary}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80 text-[11px] font-mono">
                  <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
                    Road Hazards: <strong className="text-amber-400">{report.roadIssues.length}</strong>
                  </span>
                  <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
                    Unique Vehicles: <strong className="text-cyan-400">{report.vehicleCounts.uniqueVehicles}</strong>
                  </span>
                  <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
                    ANPR Plates: <strong className="text-yellow-400">{report.anprResults.length}</strong>
                  </span>
                  {(report.safetyIncidents || []).length > 0 && (
                    <span className="px-2.5 py-1 rounded bg-red-950 border border-red-800 text-slate-300 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-red-400" />
                      Safety Incidents: <strong className="text-red-400 ml-1">{(report.safetyIncidents || []).length}</strong>
                    </span>
                  )}
                  <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
                    Traffic Density: <strong className="text-purple-400">{report.trafficAnalysis.trafficDensity}</strong>
                  </span>
                  <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
                    Congestion Level: <strong className="text-rose-400">{report.trafficAnalysis.congestionLevel}</strong>
                  </span>
                </div>
              </div>

              {/* Quick Road Hazards Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold font-mono text-white uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    ROAD ISSUE DETECTIONS ({report.roadIssues.length})
                  </h3>
                  <button
                    onClick={() => setActiveTab('HAZARDS')}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-mono underline"
                  >
                    View Details →
                  </button>
                </div>

                {report.roadIssues.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs font-mono text-slate-400">
                    ✓ No road surface hazards (potholes, cracks, waterlogging) detected in this uploaded footage.
                    <span className="block text-slate-400 mt-1 font-bold">Potholes detected: 0</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                        <tr>
                          <th className="py-2.5 px-3">Event ID</th>
                          <th className="py-2.5 px-3">Timestamp</th>
                          <th className="py-2.5 px-3">Detection Type</th>
                          <th className="py-2.5 px-3">Confidence</th>
                          <th className="py-2.5 px-3">Severity</th>
                          <th className="py-2.5 px-3 text-right">Actual Video Frame</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 bg-slate-900/50">
                        {report.roadIssues.map((issue) => (
                          <tr key={issue.id} className="hover:bg-slate-800/50">
                            <td className="py-2.5 px-3 font-bold text-cyan-300">{issue.id}</td>
                            <td className="py-2.5 px-3 text-slate-300">{issue.timestamp}</td>
                            <td className="py-2.5 px-3 font-semibold text-white">{issue.type}</td>
                            <td className="py-2.5 px-3 text-emerald-400 font-bold">{issue.confidence}%</td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                issue.severity === 'CRITICAL'
                                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                  : issue.severity === 'HIGH'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-blue-950 text-blue-300 border border-blue-800'
                              }`}>
                                {issue.severity}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                onClick={() => setPreviewImage(issue.evidenceFrame)}
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-cyan-300 border border-slate-700 transition"
                              >
                                <img
                                  src={issue.evidenceFrame}
                                  alt="Evidence"
                                  className="w-8 h-5 object-cover rounded border border-slate-600"
                                />
                                <span>Inspect Frame</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: HAZARDS (Stage 3 Road & Infrastructure Hazard Detection) */}
          {activeTab === 'HAZARDS' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wide">
                    STAGE 3: ROAD & INFRASTRUCTURE HAZARD AUDIT
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Real-time detection of potholes, waterlogging, road damage, and traffic sign anomalies with temporal deduplication.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {report.hazards?.hazardModelAvailable ? (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-950/80 text-emerald-300 border border-emerald-800 font-mono text-xs font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      HAZARD MODEL ACTIVE
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-slate-400 border border-slate-700 font-mono text-[11px] flex items-center gap-1.5" title="Operating in fallback mode until custom hazard YOLO weights are placed at ml/models/hazard_yolov8.pt">
                      <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                      HAZARD MODEL FALLBACK
                    </span>
                  )}
                  <span className="px-3 py-1 rounded-lg bg-amber-950/80 text-amber-300 border border-amber-800 font-mono text-xs font-bold">
                    {report.hazards?.totalDetected ?? report.roadIssues.length} Incidents Logged
                  </span>
                </div>
              </div>

              {/* Stage 3 Hazard KPI Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[10px] font-mono uppercase text-slate-400">Total Incidents</span>
                  <div className="text-xl font-bold font-mono text-white">
                    {report.hazards?.totalDetected ?? report.roadIssues.length}
                  </div>
                  <div className="text-[10px] font-mono text-cyan-400">Deduplicated</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[10px] font-mono uppercase text-slate-400">Potholes</span>
                  <div className="text-xl font-bold font-mono text-orange-400">
                    {report.hazards?.byType.pothole ?? report.roadIssues.filter(r => r.type.toLowerCase().includes('pothole')).length}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">Surface cavities</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[10px] font-mono uppercase text-slate-400">Waterlogging</span>
                  <div className="text-xl font-bold font-mono text-sky-400">
                    {report.hazards?.byType.waterlogging ?? report.roadIssues.filter(r => r.type.toLowerCase().includes('water')).length}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">Puddle / ponding</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[10px] font-mono uppercase text-slate-400">Road Damage</span>
                  <div className="text-xl font-bold font-mono text-rose-400">
                    {report.hazards?.byType.road_damage ?? report.roadIssues.filter(r => r.type.toLowerCase().includes('crack') || r.type.toLowerCase().includes('damage')).length}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">Cracks / fissures</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[10px] font-mono uppercase text-slate-400">Sign Issues</span>
                  <div className="text-xl font-bold font-mono text-purple-400">
                    {report.hazards?.byType.traffic_sign ?? report.roadIssues.filter(r => r.type.toLowerCase().includes('sign')).length}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">Damaged / missing</div>
                </div>
              </div>

              {/* Incidents Grid */}
              {(!report.hazards?.incidents || report.hazards.incidents.length === 0) && report.roadIssues.length === 0 ? (
                <div className="p-8 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <h4 className="font-bold text-white text-sm">No Road Hazards Detected</h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    The analyzed video footage showed clean pavement conditions within the road ROI with no detected potholes, waterlogging, or sign damage.
                  </p>
                  <span className="inline-block px-3 py-1 rounded bg-slate-900 text-slate-300 font-mono text-xs border border-slate-800">
                    Potholes: 0 | Waterlogging: 0 | Cracks: 0 | Signs: 0
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(report.hazards?.incidents && report.hazards.incidents.length > 0
                    ? report.hazards.incidents
                    : report.roadIssues.map(r => ({
                        id: r.id,
                        type: r.type,
                        confidence: r.confidence,
                        severity: r.severity as 'LOW' | 'MEDIUM' | 'HIGH',
                        timestamp: r.timestampSec || 0,
                        timestampFormatted: r.timestamp,
                        frameIndex: 0,
                        bboxPixels: r.bbox || [0, 0, 0, 0],
                        center: [0, 0] as [number, number],
                        busId: 'BUS-103',
                        status: 'NEW' as const,
                        evidenceFrameDataUrl: r.evidenceFrame,
                        location: { latitude: null, longitude: null }
                      }))
                  ).map((issue) => {
                    const currentStatus = getIncidentStatus(issue.id, issue.status);
                    const evidenceImg = issue.evidenceFrameDataUrl || (issue as any).evidenceFrame;

                    return (
                      <div
                        key={issue.id}
                        className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-3 hover:border-slate-700 transition"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-cyan-400 text-sm">{issue.id}</span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                                {issue.busId || 'BUS-103'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {/* Interactive Status Transition Pill */}
                              <button
                                onClick={() => cycleStatus(issue.id, currentStatus)}
                                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition ${
                                  currentStatus === 'RESOLVED'
                                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800 hover:bg-emerald-900'
                                    : currentStatus === 'ACKNOWLEDGED'
                                    ? 'bg-sky-950 text-sky-300 border-sky-800 hover:bg-sky-900'
                                    : 'bg-amber-950 text-amber-300 border-amber-800 hover:bg-amber-900'
                                }`}
                                title="Click to cycle status: NEW -> ACKNOWLEDGED -> RESOLVED"
                              >
                                {currentStatus} ↻
                              </button>

                              {/* Severity Badge */}
                              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                issue.severity === 'HIGH' || (issue.severity as string) === 'CRITICAL'
                                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                  : issue.severity === 'MEDIUM'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              }`}>
                                {issue.severity} SEVERITY
                              </span>
                            </div>
                          </div>

                          <h4 className="font-bold text-white text-sm capitalize">
                            {issue.type.replace('_', ' ')}
                          </h4>

                          <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-400">
                            <span>Timestamp: <strong className="text-white">{issue.timestampFormatted || `${issue.timestamp}s`}</strong></span>
                            <span>Confidence: <strong className="text-emerald-400">{issue.confidence}%</strong></span>
                            {issue.observationCount && issue.observationCount > 1 && (
                              <span className="text-cyan-400">Observed in {issue.observationCount} frames</span>
                            )}
                          </div>

                          {/* GIS / Telemetry Note */}
                          <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1.5 pt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                            <span>GPS Telemetry: Pending hardware link (coordinates will populate when live bus stream is connected)</span>
                          </div>
                        </div>

                        {/* Evidence Frame Thumbnail */}
                        {evidenceImg && (
                          <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-black aspect-video group mt-1">
                            <img
                              src={evidenceImg}
                              alt={`Evidence for ${issue.id}`}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                              <button
                                onClick={() => setPreviewImage(evidenceImg)}
                                className="px-3 py-1.5 rounded-lg bg-cyan-600 text-white font-mono text-xs font-bold flex items-center gap-1.5 shadow-lg hover:bg-cyan-500 transition"
                              >
                                <Maximize2 className="w-3.5 h-3.5" />
                                <span>Enlarge Evidence Frame</span>
                              </button>
                            </div>
                            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-slate-950/85 font-mono text-[10px] text-slate-300 border border-slate-800">
                              EVIDENCE @ {issue.timestampFormatted || `${issue.timestamp}s`}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: VEHICLES & TRAFFIC */}
          {activeTab === 'VEHICLES' && (
            <div className="space-y-6">
              {/* Vehicle Counts Card */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Car className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-xs font-bold font-mono text-white uppercase tracking-wider">
                      UNIQUE VEHICLE TRACKING ACROSS FRAMES
                    </h3>
                  </div>
                  <span className="text-xs font-mono text-cyan-400 font-bold">
                    Total Tracked: {report.vehicleCounts.uniqueVehicles}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-center">
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-[10px] font-mono text-slate-400">CARS</div>
                    <div className="text-xl font-bold text-white mt-1">{report.vehicleCounts.cars}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-[10px] font-mono text-slate-400">BUSES</div>
                    <div className="text-xl font-bold text-white mt-1">{report.vehicleCounts.buses}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-[10px] font-mono text-slate-400">TRUCKS</div>
                    <div className="text-xl font-bold text-white mt-1">{report.vehicleCounts.trucks}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-[10px] font-mono text-slate-400">MOTORCYCLES</div>
                    <div className="text-xl font-bold text-white mt-1">{report.vehicleCounts.motorcycles}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-[10px] font-mono text-slate-400">BICYCLES</div>
                    <div className="text-xl font-bold text-white mt-1">{report.vehicleCounts.bicycles}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-[10px] font-mono text-slate-400">PEDESTRIANS</div>
                    <div className="text-xl font-bold text-white mt-1">{report.vehicleCounts.pedestrians}</div>
                  </div>
                </div>
              </div>

              {/* Traffic Analysis Card */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-purple-400" />
                    <h3 className="text-xs font-bold font-mono text-white uppercase tracking-wider">
                      TRAFFIC CONGESTION & DENSITY ANALYSIS
                    </h3>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded font-mono text-xs font-bold border ${
                    report.trafficAnalysis.congestionLevel === 'HIGH'
                      ? 'bg-rose-950 text-rose-300 border-rose-800'
                      : report.trafficAnalysis.congestionLevel === 'MEDIUM'
                      ? 'bg-amber-950 text-amber-300 border-amber-800'
                      : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                  }`}>
                    Congestion: {report.trafficAnalysis.congestionLevel}
                  </span>
                </div>

                {!report.trafficAnalysis.isReliable ? (
                  <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800 text-amber-300 text-xs font-mono">
                    ⚠ Insufficient video data for reliable traffic estimation
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-400">AVG PER SAMPLED FRAME</div>
                      <div className="text-lg font-bold text-cyan-300 mt-1">
                        {report.trafficAnalysis.avgVehiclesPerSampledFrame} vehicles / frame
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-400">TRAFFIC DENSITY SCORE</div>
                      <div className="text-lg font-bold text-purple-400 mt-1">
                        {report.trafficAnalysis.trafficDensity}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-400">ESTIMATED CONGESTION</div>
                      <div className="text-lg font-bold text-emerald-400 mt-1">
                        {report.trafficAnalysis.congestionLevel}
                      </div>
                    </div>
                  </div>
                )}


                <p className="text-xs text-slate-400 font-mono leading-relaxed">
                  {report.trafficAnalysis.notes}
                </p>
              </div>

              {/* Stage 2: ByteTrack Analytics Panel (only shown when tracking data is present) */}
              {report.tracking && (
                <div className="p-4 rounded-xl bg-slate-950 border border-cyan-900/50 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-cyan-400" />
                      <h3 className="text-xs font-bold font-mono text-white uppercase tracking-wider">
                        BYTETRACK ANALYTICS
                      </h3>
                      <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 text-[10px] font-mono font-bold">
                        {report.tracking.tracker}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      Prototype thresholds — requires calibration
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-400">ACTIVE VEHICLES</div>
                      <div className="text-xl font-bold text-cyan-300 mt-1">{report.tracking.activeVehicles}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">in ROI (last frame)</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-400">UNIQUE VEHICLES</div>
                      <div className="text-xl font-bold text-emerald-300 mt-1">{report.tracking.uniqueVehiclesSeen}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">distinct track IDs</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-400">TRAFFIC DENSITY</div>
                      <div className={`text-lg font-bold mt-1 ${
                        report.tracking.trafficDensity === 'HIGH' ? 'text-rose-400' :
                        report.tracking.trafficDensity === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'
                      }`}>{report.tracking.trafficDensity}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-400">CONGESTION</div>
                      <div className={`text-lg font-bold mt-1 ${
                        report.tracking.congestionLevel === 'HIGH' ? 'text-rose-400' :
                        report.tracking.congestionLevel === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'
                      }`}>{report.tracking.congestionLevel}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-400">MOTION SCORE</div>
                      <div className="text-lg font-bold text-purple-400 mt-1">
                        {report.tracking.relativeMotionScorePixels.toFixed(1)}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">px/frame (NOT speed)</div>
                    </div>
                  </div>

                  {report.tracks && report.tracks.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] font-mono text-slate-400 uppercase font-bold">
                        Track Summaries ({report.tracks.length} tracks)
                      </div>
                      <div className="overflow-x-auto rounded-lg border border-slate-800 max-h-40 overflow-y-auto">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] sticky top-0">
                            <tr>
                              <th className="py-2 px-3">Track ID</th>
                              <th className="py-2 px-3">Class</th>
                              <th className="py-2 px-3">Trajectory Pts</th>
                              <th className="py-2 px-3">Motion Score</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {report.tracks.map((track) => (
                              <tr key={track.track_id} className="hover:bg-slate-800/50">
                                <td className="py-1.5 px-3 font-bold text-cyan-300">#{track.track_id}</td>
                                <td className="py-1.5 px-3 text-white capitalize">{track.class}</td>
                                <td className="py-1.5 px-3 text-slate-300">{track.trajectory.length}</td>
                                <td className="py-1.5 px-3 text-purple-300">{track.relativeMotionScore.toFixed(2)} px/f</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[10px] text-slate-500 font-mono">
                        ⚠ Motion score is relative pixel displacement (NOT vehicle speed). Camera is moving; no calibration applied.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}


          {/* TAB 4: ANPR */}
          {activeTab === 'ANPR' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white font-mono uppercase">
                    AUTOMATIC NUMBER PLATE RECOGNITION (ANPR)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Registration characters extracted from vehicle plates identified in the uploaded video.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-lg bg-yellow-950/80 text-yellow-300 border border-yellow-800 font-mono text-xs font-bold">
                  {report.anprResults.length} Plate(s) Detected
                </span>
              </div>

              {report.anprResults.length === 0 ? (
                <div className="p-8 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-2">
                  <Shield className="w-8 h-8 text-slate-500 mx-auto" />
                  <h4 className="font-bold text-white text-sm">Number plates detected: 0</h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    No clear vehicle license plates were identifiable in the sampled frames of this video.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {report.anprResults.map((plate) => (
                    <div
                      key={plate.id}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row items-center gap-6"
                    >
                      {/* Evidence Frame Preview */}
                      <div className="relative w-full md:w-64 aspect-video rounded-lg overflow-hidden border border-slate-800 bg-slate-900 flex-shrink-0 flex items-center justify-center">
                        {plate.evidenceFrame ? (
                          <img
                            src={plate.evidenceFrame}
                            alt="Plate Evidence"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="text-slate-500 text-xs font-mono">No visual crop available</div>
                        )}
                        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-slate-950/80 font-mono text-[9px] text-yellow-300 border border-yellow-800/80">
                          FRAME @ {plate.timestamp || '00:01'}
                        </div>
                      </div>

                      {/* Plate Details */}
                      <div className="flex-1 space-y-3 w-full">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-slate-400">IDENTIFIED REGISTRATION:</span>
                          <span className="text-xs font-mono text-emerald-400 font-bold">
                            {plate.confidence > 0 ? `Confidence: ${plate.confidence}%` : 'Confidence: Low (<30%)'}
                          </span>
                        </div>

                        <div className="inline-block px-4 py-1.5 rounded-md bg-yellow-400 text-slate-950 font-black font-mono text-base tracking-wider border-2 border-slate-900 shadow-md">
                          {plate.plateNumber || 'Plate detected — unreadable'}
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs font-mono text-slate-300">
                          <div>
                            <span className="text-slate-500 block text-[10px]">VIDEO TIMESTAMP:</span>
                            {plate.timestamp}
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[10px]">REGIONAL JURISDICTION:</span>
                            {plate.stateOrRegion || 'Regional Transport Office'}
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[10px]">VEHICLE CLASS:</span>
                            {plate.vehicleClass || 'Motor Vehicle'}
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[10px]">READABLE STATUS:</span>
                            <span className={plate.readable ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                              {plate.readable ? 'Confirmed Legible' : 'Number plate detected but unreadable'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: SAFETY INCIDENTS (Hit-and-Run / Rash Driving) */}
          {activeTab === 'SAFETY' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white font-mono uppercase flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-red-400" />
                    OFFENDING VEHICLE DETECTION — HIT-AND-RUN &amp; RASH DRIVING
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Incidents detected by Stage 4 pipeline: ByteTrack ID binding, ANPR plate OCR, GPS stamp, and real-time timestamp.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-lg bg-red-950/80 text-red-300 border border-red-800 font-mono text-xs font-bold">
                  {(report.safetyIncidents || []).length} Incident(s)
                </span>
              </div>

              {/* Privacy Safeguard Notice */}
              <div className="p-3 rounded-xl bg-slate-950 border border-amber-800/50 flex items-start gap-2.5 text-xs text-slate-300">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-slate-400">
                  <strong className="text-amber-400">ANPR Privacy Boundary:</strong> Registration characters extracted on public roadways only. Personal owner linkages require authorized law enforcement API access.
                </p>
              </div>

              {(report.safetyIncidents || []).length === 0 ? (
                <div className="p-8 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-2">
                  <Shield className="w-8 h-8 text-emerald-500 mx-auto" />
                  <h4 className="font-bold text-white text-sm">No Safety Incidents Detected</h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    No hit-and-run or rash driving events were identified in this uploaded footage.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(report.safetyIncidents as OffendingVehicleIncident[]).map((inc) => (
                    <div
                      key={inc.id}
                      className="p-4 rounded-xl bg-slate-950 border border-red-900/40 space-y-3"
                    >
                      {/* Incident Header */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                            inc.incidentType === 'HIT_AND_RUN'
                              ? 'bg-red-950 text-red-300 border-red-700'
                              : 'bg-orange-950 text-orange-300 border-orange-700'
                          }`}>
                            {inc.incidentType === 'HIT_AND_RUN' ? '🚨 HIT-AND-RUN' : '⚡ RASH DRIVING'}
                          </span>
                          <span className="font-mono text-xs font-bold text-slate-400">{inc.id}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-emerald-400 font-bold">Conf: {inc.confidence}%</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                            inc.severity === 'CRITICAL' ? 'bg-red-950 text-red-400 border-red-700' : 'bg-orange-950 text-orange-400 border-orange-700'
                          }`}>{inc.severity}</span>
                        </div>
                      </div>

                      {/* Evidence Frame + Details */}
                      <div className="flex flex-col md:flex-row gap-4">
                        {/* Evidence Frame */}
                        {inc.evidenceFrame && (
                          <div
                            className="relative w-full md:w-64 aspect-video rounded-lg overflow-hidden border border-red-900/40 bg-black flex-shrink-0 cursor-pointer"
                            onClick={() => setPreviewImage(inc.evidenceFrame)}
                          >
                            <img
                              src={inc.evidenceFrame}
                              alt="Safety Incident Evidence"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-red-950/90 font-mono text-[9px] text-red-300 border border-red-800/80">
                              {inc.timestamp}
                            </div>
                            <div className="absolute bottom-1.5 right-1.5">
                              <Maximize2 className="w-3 h-3 text-white/60" />
                            </div>
                          </div>
                        )}

                        {/* Key Fields Grid */}
                        <div className="flex-1 grid grid-cols-2 gap-2 text-[11px] font-mono content-start">
                          <div className="p-2 rounded bg-slate-900 border border-slate-800 col-span-2">
                            <span className="text-slate-500 text-[10px] block flex items-center gap-1">
                              <CreditCard className="w-3 h-3 text-yellow-400" /> ANPR REGISTRATION PLATE
                            </span>
                            <div className="flex items-center justify-between mt-1">
                              <span className="px-3 py-1 rounded bg-yellow-400 text-slate-950 font-black text-sm tracking-wider">
                                {inc.plateNumber}
                              </span>
                              <span className="text-emerald-400">OCR: {inc.plateConfidence}% conf</span>
                            </div>
                            <span className={`text-[10px] mt-1 block ${inc.isPlateReadable ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {inc.isPlateReadable ? '✓ Legible — Confirmed Readable' : '⚠ Partially Readable — Manual Verification Required'}
                            </span>
                          </div>

                          <div className="p-2 rounded bg-slate-900 border border-slate-800">
                            <span className="text-slate-500 text-[10px] block">ByteTrack ID</span>
                            <strong className="text-cyan-300">#{inc.trackId}</strong>
                            <span className="text-slate-500 text-[10px] block mt-0.5">{inc.vehicleClass}</span>
                          </div>

                          <div className="p-2 rounded bg-slate-900 border border-slate-800">
                            <span className="text-slate-500 text-[10px] block flex items-center gap-1"><Zap className="w-3 h-3 text-orange-400" /> Speed Recorded</span>
                            <strong className="text-orange-300">{inc.speedRecorded} km/h</strong>
                          </div>

                          <div className="p-2 rounded bg-slate-900 border border-slate-800">
                            <span className="text-slate-500 text-[10px] block flex items-center gap-1"><Clock className="w-3 h-3" /> Timestamp</span>
                            <strong className="text-white">{inc.timestampFormatted || inc.timestamp}</strong>
                            <span className="text-slate-500 text-[10px] block">{inc.realTimestamp}</span>
                          </div>

                          <div className="p-2 rounded bg-slate-900 border border-slate-800">
                            <span className="text-slate-500 text-[10px] block flex items-center gap-1"><MapPin className="w-3 h-3 text-cyan-400" /> GPS Location</span>
                            <strong className="text-cyan-300 text-[10px]">{inc.latitude?.toFixed(5)}, {inc.longitude?.toFixed(5)}</strong>
                            <span className="text-slate-400 text-[10px] block truncate">{inc.locationName}</span>
                          </div>

                          <div className="p-2 rounded bg-slate-900 border border-slate-800 col-span-2">
                            <span className="text-slate-500 text-[10px] block">Assigned Department</span>
                            <strong className="text-slate-200">{inc.assignedDepartment}</strong>
                          </div>
                        </div>
                      </div>

                      {/* Details Notes */}
                      <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-xs text-slate-400">
                        <strong className="text-slate-300">Incident Details:</strong> {inc.details}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: TIMELINE */}
          {activeTab === 'TIMELINE' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white font-mono uppercase">
                  DETECTION TIMELINE ACROSS FOOTAGE
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Chronological progression of object detections, speed estimations, and road events.
                </p>
              </div>

              <div className="relative border-l-2 border-slate-800 ml-4 space-y-4 py-2">
                {report.detectionTimeline.map((item, idx) => (
                  <div key={idx} className="relative pl-6">
                    <span className="absolute -left-[9px] top-4 w-4 h-4 rounded-full bg-slate-900 border-2 border-cyan-400"></span>
                    <div
                      onClick={() => item.evidenceFrame && setPreviewImage(item.evidenceFrame)}
                      className={`p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2 cursor-pointer hover:border-cyan-500 hover:bg-slate-900/60 transition ${
                        item.evidenceFrame ? 'hover:shadow-lg' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-cyan-300">{item.title}</span>
                          <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 font-mono text-[10px] border border-slate-800">
                            {item.timestamp}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-emerald-400 font-bold">
                          Confidence: {item.confidence}%
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">{item.details}</p>

                      {item.evidenceFrame && (
                        <div className="flex items-center gap-3 pt-1">
                          <img
                            src={item.evidenceFrame}
                            alt="Timeline Evidence"
                            className="w-20 h-12 object-cover rounded border border-slate-700 hover:border-cyan-400"
                          />
                          <span className="text-[11px] font-mono text-cyan-400 flex items-center gap-1 underline">
                            <Eye className="w-3.5 h-3.5" />
                            Click to expand actual evidence frame @ {item.timestamp}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: EVIDENCE */}
          {activeTab === 'EVIDENCE' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white font-mono uppercase">
                  EXTRACTED EVIDENCE FRAMES GALLERY ({report.sampledFrames.length})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Actual video frames sampled directly from the uploaded footage for AI inspection.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {report.sampledFrames.map((frame, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded-xl bg-slate-950 border border-slate-800 space-y-2 group cursor-pointer hover:border-cyan-700 transition"
                    onClick={() => setPreviewImage(frame.frameDataUrl)}
                  >
                    <div className="relative aspect-video rounded-lg overflow-hidden bg-black">
                      <img
                        src={frame.frameDataUrl}
                        alt={`Sampled Frame ${idx + 1}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 font-mono text-[10px] text-cyan-300">
                        Frame #{frame.frameIndex}
                      </div>
                      <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 font-mono text-[10px] text-slate-200">
                        {frame.timestamp}
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-1 text-[11px] font-mono text-slate-400">
                      <span>Time: {frame.timestamp}</span>
                      <span className="text-cyan-400 group-hover:underline">Click to Enlarge</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs font-mono text-slate-400">
          <div>
            UrbanSense AI Edge Intelligence Engine • Confidential Municipal Audit
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold transition"
          >
            Close Report
          </button>
        </div>
      </div>

      {/* Full-Screen Image Lightbox Preview */}
      {previewImage && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/95 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-5xl w-full max-h-[90vh] flex flex-col items-center">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-cyan-400 text-sm font-mono flex items-center gap-1"
            >
              <X className="w-5 h-5" /> Close Preview
            </button>
            <img
              src={previewImage}
              alt="Full Resolution Evidence"
              className="max-w-full max-h-[85vh] object-contain rounded-xl border border-slate-700 shadow-2xl"
            />
            <div className="mt-2 text-xs font-mono text-slate-400 text-center">
              Actual video frame sampled directly from uploaded video
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
