import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Video,
  Camera,
  Bus as BusIcon,
  Cpu,
  Layers,
  Sparkles,
  Info,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Shield,
  Activity,
  FileText
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { EdgeCameraFeed } from '../components/EdgeCameraFeed';
import { MultiVideoCongestionDashboard } from '../components/MultiVideoCongestionDashboard';
import { Bus, BusCamera, UrbanEvent, UploadedVideoReport } from '../types';

export const BusCameraMonitoringPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { buses } = useApp();

  const busParam = searchParams.get('busId') || 'BUS-103';
  const camParam = searchParams.get('cameraId') || 'CAM-103-FRONT';

  const [selectedBus, setSelectedBus] = useState<Bus>(
    buses.find((b) => b.id === busParam) || buses[2] || buses[0]
  );
  const [selectedCam, setSelectedCam] = useState<BusCamera>(
    selectedBus?.cameras.find((c) => c.id === camParam) || selectedBus?.cameras[0]
  );
  const [lastGeneratedEvent, setLastGeneratedEvent] = useState<UrbanEvent | null>(null);

  // Mode and dynamic report from EdgeCameraFeed
  const [feedMode, setFeedMode] = useState<'DEMO' | 'UPLOAD'>('DEMO');
  const [uploadedReport, setUploadedReport] = useState<UploadedVideoReport | null>(null);

  // View mode: 'SINGLE' (Single camera inspection) vs 'MULTI' (4-bus multi-video congestion pipeline)
  const tabParam = searchParams.get('tab');
  const [viewMode, setViewMode] = useState<'SINGLE' | 'MULTI'>(tabParam === 'multi' ? 'MULTI' : 'SINGLE');

  const handleTabChange = (mode: 'SINGLE' | 'MULTI') => {
    setViewMode(mode);
    setSearchParams(mode === 'MULTI' ? { tab: 'multi' } : { busId: selectedBus.id, cameraId: selectedCam.id });
  };

  useEffect(() => {
    const bus = buses.find((b) => b.id === busParam);
    if (bus) {
      setSelectedBus(bus);
      const cam = bus.cameras.find((c) => c.id === camParam) || bus.cameras[0];
      setSelectedCam(cam);
    }
  }, [busParam, camParam, buses]);

  const handleSelectBus = (busId: string) => {
    const bus = buses.find((b) => b.id === busId);
    if (bus) {
      setSelectedBus(bus);
      const firstCam = bus.cameras[0];
      setSelectedCam(firstCam);
      setSearchParams({ busId: bus.id, cameraId: firstCam.id });
    }
  };

  const handleSelectCamera = (cam: BusCamera) => {
    setSelectedCam(cam);
    setSearchParams({ busId: selectedBus.id, cameraId: cam.id });
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs customTitle="Edge Camera Surveillance & Monitoring" />

      {/* Primary Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-xl bg-slate-900 border border-slate-800 w-fit">
        <button
          onClick={() => handleTabChange('SINGLE')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
            viewMode === 'SINGLE'
              ? 'bg-cyan-500 text-slate-950 shadow-sm font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>Single Bus Camera Feed</span>
        </button>

        <button
          onClick={() => handleTabChange('MULTI')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
            viewMode === 'MULTI'
              ? 'bg-cyan-500 text-slate-950 shadow-sm font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Multi-Bus Fleet Ingestion & Congestion</span>
          <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${
            viewMode === 'MULTI' ? 'bg-slate-950 text-cyan-400' : 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/80'
          }`}>
            AI Ingestion
          </span>
        </button>
      </div>

      {viewMode === 'MULTI' ? (
        <MultiVideoCongestionDashboard />
      ) : (
        <>
          {/* Top Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-bold text-white tracking-tight">
                  Edge Camera Monitoring Feed
                </h1>
            {feedMode === 'DEMO' ? (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/80 text-xs font-medium">
                Simulation Mode
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/80 text-xs font-medium">
                Video Analysis
              </span>
            )}
            <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-xs font-medium">
              Live Sensor Stream
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {feedMode === 'DEMO'
              ? 'Synthesized multi-sensor camera stream simulating on-board YOLOv8 object detection, ByteTrack tracking, and ANPR optical character recognition.'
              : 'Autonomous Edge AI inspecting actual uploaded road video. All detections, timestamps, vehicle counts, and ANPR results are dynamically generated.'}
          </p>
        </div>

        {/* Bus Selector Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {buses.map((b) => (
            <button
              key={b.id}
              onClick={() => handleSelectBus(b.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium border transition ${
                b.id === selectedBus.id
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-sm font-semibold'
                  : 'bg-slate-950 hover:bg-slate-800 text-slate-400 border-slate-800'
              }`}
            >
              {b.id}
            </button>
          ))}
        </div>
      </div>

      {/* Camera Position Switcher Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">
            Active Bus: <span className="text-cyan-400 font-mono font-semibold">{selectedBus.id}</span>
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-xs text-slate-400 font-sans">
            Route: {selectedBus.routeName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Select Angle:</span>
          {selectedBus.cameras.map((cam) => {
            const isSelected = cam.id === selectedCam.id;
            return (
              <button
                key={cam.id}
                onClick={() => handleSelectCamera(cam)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  isSelected
                    ? 'bg-cyan-950 text-cyan-300 border-cyan-600 ring-1 ring-cyan-500 font-semibold'
                    : 'bg-slate-950 hover:bg-slate-800 text-slate-400 border-slate-800'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{cam.position}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Video Player & Edge AI Canvas Component */}
      <EdgeCameraFeed
        bus={selectedBus}
        camera={selectedCam}
        onEventGenerated={(ev) => setLastGeneratedEvent(ev)}
        onReportGenerated={(report) => setUploadedReport(report)}
        onModeChange={(m) => setFeedMode(m)}
      />

      {/* ByteTrack & ANPR Real-Time Pipeline Inspection Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Multi-Object Tracker / Detections (7 cols) */}
        <div className="lg:col-span-7 p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-200">
                {feedMode === 'DEMO'
                  ? 'ByteTrack Object Tracking Table'
                  : 'Uploaded Video Vehicle & Object Tracking'}
              </h3>
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
              feedMode === 'DEMO'
                ? 'bg-amber-950/80 text-amber-400 border border-amber-800/80'
                : 'bg-cyan-950/80 text-cyan-400 border border-cyan-800/80'
            }`}>
              {feedMode === 'DEMO' ? 'Simulation' : 'Video Analysis'}
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            {feedMode === 'DEMO'
              ? 'ByteTrack maintains consistent vehicle and obstacle identities across video frames, computing approximate velocity and trajectory vector.'
              : `Dynamic tracking results derived strictly from the uploaded footage (${uploadedReport?.video.fileName || 'Pending'}). Objects tracked across sampled frames.`}
          </p>

          {feedMode === 'DEMO' ? (
            /* Demo Synthetic Table */
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead className="bg-slate-950 text-slate-400 text-xs font-medium">
                  <tr>
                    <th className="py-2 px-3">Vehicle / Class</th>
                    <th className="py-2 px-3">Track ID</th>
                    <th className="py-2 px-3">Speed</th>
                    <th className="py-2 px-3">Direction</th>
                    <th className="py-2 px-3">Confidence</th>
                    <th className="py-2 px-3 text-right">Trajectory Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  <tr className="bg-cyan-950/20">
                    <td className="py-2.5 px-3 text-cyan-400 font-bold">CAR #17 (Sedan)</td>
                    <td className="py-2.5 px-3 text-slate-300">ID_17</td>
                    <td className="py-2.5 px-3 text-amber-400 font-bold">48 km/h</td>
                    <td className="py-2.5 px-3 text-slate-300">North-East Cut</td>
                    <td className="py-2.5 px-3 text-emerald-400">94.8%</td>
                    <td className="py-2.5 px-3 text-right text-rose-400 font-bold">⚠ Sudden Cut-In</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-slate-300">CAR #21 (Hatchback)</td>
                    <td className="py-2.5 px-3 text-slate-400">ID_21</td>
                    <td className="py-2.5 px-3 text-slate-300">31 km/h</td>
                    <td className="py-2.5 px-3 text-slate-400">Northbound</td>
                    <td className="py-2.5 px-3 text-emerald-400">92.1%</td>
                    <td className="py-2.5 px-3 text-right text-emerald-400">Normal Lane</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-orange-400 font-bold">POTHOLE #8</td>
                    <td className="py-2.5 px-3 text-slate-400">ID_08</td>
                    <td className="py-2.5 px-3 text-slate-400">0 km/h</td>
                    <td className="py-2.5 px-3 text-slate-400">Road Surface</td>
                    <td className="py-2.5 px-3 text-emerald-400">94.2%</td>
                    <td className="py-2.5 px-3 text-right text-orange-400 font-bold">⚠ Hazard Defect</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-slate-300">PEDESTRIAN #34</td>
                    <td className="py-2.5 px-3 text-slate-400">ID_34</td>
                    <td className="py-2.5 px-3 text-slate-300">4 km/h</td>
                    <td className="py-2.5 px-3 text-slate-400">Sidewalk</td>
                    <td className="py-2.5 px-3 text-emerald-400">89.6%</td>
                    <td className="py-2.5 px-3 text-right text-amber-400">Near Curb</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            /* Uploaded Video Dynamic Results */
            <div>
              {!uploadedReport ? (
                <div className="p-6 rounded-xl bg-slate-950 border border-slate-800 text-center font-mono text-xs text-slate-400 space-y-2">
                  <Activity className="w-6 h-6 text-cyan-400 mx-auto" />
                  <p>Video loaded. Click <strong className="text-cyan-400">"START ANALYSIS"</strong> above to extract real frames and execute AI vision inference.</p>
                </div>
              ) : (
                <div className="space-y-3 font-mono text-xs">
                  {/* Vehicle Breakdown Pills */}
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center">
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">TOTAL</span>
                      <strong className="text-cyan-400 text-sm">{uploadedReport.vehicleCounts.uniqueVehicles}</strong>
                    </div>
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">CARS</span>
                      <strong className="text-white text-sm">{uploadedReport.vehicleCounts.cars}</strong>
                    </div>
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">BUSES</span>
                      <strong className="text-white text-sm">{uploadedReport.vehicleCounts.buses}</strong>
                    </div>
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">TRUCKS</span>
                      <strong className="text-white text-sm">{uploadedReport.vehicleCounts.trucks}</strong>
                    </div>
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">BIKES</span>
                      <strong className="text-white text-sm">{uploadedReport.vehicleCounts.motorcycles}</strong>
                    </div>
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">PEDS</span>
                      <strong className="text-white text-sm">{uploadedReport.vehicleCounts.pedestrians}</strong>
                    </div>
                  </div>

                  {/* Dynamic Timeline Events */}
                  <div className="overflow-x-auto rounded-lg border border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase">
                        <tr>
                          <th className="py-2 px-3">Video Time</th>
                          <th className="py-2 px-3">Detection / Object</th>
                          <th className="py-2 px-3">Details</th>
                          <th className="py-2 px-3 text-right">Confidence</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 bg-slate-950/50">
                        {uploadedReport.detectionTimeline.slice(0, 5).map((evt, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/60">
                            <td className="py-2 px-3 text-cyan-400 font-bold">{evt.timestamp}</td>
                            <td className="py-2 px-3 font-semibold text-white">{evt.title}</td>
                            <td className="py-2 px-3 text-slate-400 text-[11px] truncate max-w-xs">{evt.details}</td>
                            <td className="py-2 px-3 text-right text-emerald-400 font-bold">{evt.confidence}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: ANPR OCR Pipeline Inspection (5 cols) */}
        <div className="lg:col-span-5 p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-200">
                {feedMode === 'DEMO'
                  ? 'ANPR / OCR Pipeline Engine'
                  : 'Uploaded Video ANPR / OCR'}
              </h3>
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
              feedMode === 'DEMO'
                ? 'bg-amber-950/80 text-amber-400 border border-amber-800/80'
                : 'bg-cyan-950/80 text-cyan-400 border border-cyan-800/80'
            }`}>
              {feedMode === 'DEMO' ? 'Simulation' : 'Video Analysis'}
            </span>
          </div>

          {feedMode === 'DEMO' ? (
            /* Demo Synthetic ANPR Box */
            <div className="space-y-2.5 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-xs font-medium">Identified Registration:</span>
                  <span className="px-2 py-0.5 rounded bg-yellow-400 text-slate-950 font-bold font-mono text-xs shadow">
                    TN 38 AB 1234
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-300 text-xs">
                  <span>OCR Confidence:</span>
                  <span className="text-emerald-400 font-mono font-semibold">91.2%</span>
                </div>
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>State & RTO:</span>
                  <span className="text-slate-200">Tamil Nadu / Coimbatore North (38)</span>
                </div>
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Vehicle Class:</span>
                  <span className="text-slate-200">Private Sedan (Blue)</span>
                </div>
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Associated Bus & GPS:</span>
                  <span className="text-cyan-400 font-mono">{selectedBus.id} ({selectedBus.lat.toFixed(4)}, {selectedBus.lng.toFixed(4)})</span>
                </div>
              </div>

              {/* Privacy & Legal Boundary Disclaimer */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 space-y-1">
                <strong className="text-amber-400 font-medium block">System Boundary & Data Privacy Notice:</strong>
                <p className="leading-relaxed">
                  ANPR identifies only the visual registration number. The prototype does NOT claim or attempt
                  to query citizen names or private owner databases.
                </p>
              </div>
            </div>
          ) : (
            /* Uploaded Video Dynamic ANPR */
            <div className="space-y-2 text-xs">
              {!uploadedReport ? (
                <div className="p-6 rounded-lg bg-slate-950 border border-slate-800 text-center text-slate-400">
                  Waiting for video analysis to detect visible number plates...
                </div>
              ) : uploadedReport.anprResults.length === 0 ? (
                <div className="p-6 rounded-lg bg-slate-950 border border-slate-800 text-center space-y-2">
                  <Shield className="w-8 h-8 text-slate-400 mx-auto" />
                  <div className="font-bold text-white text-sm">Number plates detected: 0</div>
                  <p className="text-xs text-slate-400">
                    No license plates visible in the uploaded video footage. Results are not invented.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {uploadedReport.anprResults.map((plate) => (
                    <div key={plate.id} className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[11px]">REGISTRATION:</span>
                        <span className="text-emerald-400 text-[11px] font-bold">
                          {plate.confidence > 0 ? `Conf: ${plate.confidence}%` : 'Conf: Low (<30%)'}
                        </span>
                      </div>
                      <div className="inline-block px-3 py-1 rounded bg-yellow-400 text-slate-950 font-black font-mono text-sm">
                        {plate.plateNumber || 'Plate detected — unreadable'}
                      </div>
                      <div className="text-[11px] text-slate-400 space-y-0.5">
                        <div>Video Time: <strong className="text-cyan-400">{plate.timestamp || '00:01'}</strong></div>
                        <div>Jurisdiction: <span className="text-slate-300">{plate.stateOrRegion || 'Regional Transport Office'}</span></div>
                        <div>Status: <span className={plate.readable ? 'text-emerald-400 font-bold' : 'text-amber-400'}>{plate.readable ? 'Legible' : 'Number plate detected but unreadable'}</span></div>
                      </div>
                      {/* Evidence Frame Thumbnail */}
                      <div className="pt-2 border-t border-slate-800">
                        {plate.evidenceFrame ? (
                          <img
                            src={plate.evidenceFrame}
                            alt="Plate Evidence"
                            className="w-full h-24 object-contain bg-slate-900 rounded border border-slate-800"
                          />
                        ) : (
                          <div className="w-full h-20 flex items-center justify-center bg-slate-900 rounded text-slate-400 text-[10px] font-mono border border-slate-800">
                            Vehicle tracked — plate resolution below threshold
                          </div>
                        )}
                        <span className="block text-[9px] text-slate-400 mt-1">
                          Actual video frame evidence captured at {plate.timestamp || '00:01'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )}
</div>
);
};
