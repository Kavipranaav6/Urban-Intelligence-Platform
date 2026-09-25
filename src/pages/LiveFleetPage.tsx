import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Bus as BusIcon,
  Play,
  Square,
  Video,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Wifi,
  Radio,
  Info,
  CheckCircle2,
  X
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { GISMap } from '../components/GISMap';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Bus } from '../types';

export const LiveFleetPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { buses, isSimulating, toggleSimulation } = useApp();

  const urlBusId = searchParams.get('busId');
  const [selectedBus, setSelectedBus] = useState<Bus | null>(null);
  const [hasInitialized, setHasInitialized] = useState<boolean>(false);

  // Sync selectedBus with URL searchParam on mount or when param changes
  useEffect(() => {
    if (buses.length > 0) {
      if (urlBusId) {
        const found = buses.find((b) => b.id.toUpperCase() === urlBusId.toUpperCase());
        if (found) {
          setSelectedBus(found);
          setHasInitialized(true);
          return;
        }
      }
      if (!hasInitialized) {
        setSelectedBus(buses[2] || buses[0]);
        setHasInitialized(true);
      }
    }
  }, [urlBusId, buses, hasInitialized]);

  const handleSelectBus = (bus: Bus) => {
    if (selectedBus?.id === bus.id) {
      // Toggle collapse
      setSelectedBus(null);
      setSearchParams({});
    } else {
      setSelectedBus(bus);
      setSearchParams({ busId: bus.id });
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs customTitle="Live Fleet Control & Diagnostics" />

      {/* Top Header with Simulation Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold text-white tracking-tight">Live Mobile Sensing Fleet</h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                isSimulating
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isSimulating ? 'bg-emerald-400' : 'bg-slate-400'}`} />
              {isSimulating ? 'Simulation Active' : 'Simulation Paused'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Central fleet command tracking 8 transit buses equipped with quad-surveillance Edge AI compute nodes.
            Select any bus to inspect telemetry, camera arrays, and GNSS streams in place.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleSimulation}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold shadow-md transition active:scale-95 ${
              isSimulating
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {isSimulating ? (
              <>
                <Square className="w-3.5 h-3.5 fill-white" />
                <span>Stop Simulation</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Start Simulation</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Split View: Map on Left (7 cols), Fleet List on Right (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Map */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-200">
              Real-Time Fleet Trajectory Map
            </span>
            <span className="text-xs text-cyan-400 font-medium">
              Live updates via OpenStreetMap & GPS Telemetry
            </span>
          </div>

          <div className="h-[480px] rounded-xl overflow-hidden border border-slate-800 shadow-xl">
            <GISMap
              buses={buses}
              selectedBusId={selectedBus?.id}
              onSelectBus={(b) => handleSelectBus(b)}
              activeLayers={{
                buses: true,
                roadIssues: true,
                traffic: false,
                safety: false,
                infrastructure: false
              }}
            />
          </div>
        </div>

        {/* Right: Fleet Cards List */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-200">
              Fleet Units (BUS-101 to BUS-108)
            </span>
            <span className="text-xs text-cyan-400 font-medium">
              {buses.filter((b) => b.speed > 0).length} En-Route / {buses.length} Registered
            </span>
          </div>

          <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
            {buses.map((bus) => {
              const isSelected = bus.id === selectedBus?.id;

              return (
                <div
                  key={bus.id}
                  onClick={() => handleSelectBus(bus)}
                  className={`p-3.5 rounded-xl border transition cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 border-cyan-500/70 shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-500/30'
                      : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400 font-mono font-bold text-xs">
                        {bus.id.replace('BUS-', '')}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-white flex items-center gap-2">
                          <span className="font-mono">{bus.id}</span>
                          <span className="text-xs font-normal text-slate-400">
                            {bus.routeName.split('-')[0]}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 truncate max-w-[220px]">
                          {bus.routeName}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-mono font-semibold text-cyan-300 text-xs">
                        {bus.speed} km/h
                      </span>
                      <span className="block text-[11px] text-slate-500 font-medium">
                        {bus.direction}
                      </span>
                    </div>
                  </div>

                  {/* Status Badges Row */}
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-950/70 text-emerald-400 border border-emerald-800/50 flex items-center gap-1 font-medium">
                        <Cpu className="w-3 h-3" />
                        AI: {bus.aiStatus}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-cyan-950/70 text-cyan-400 border border-cyan-800/50 flex items-center gap-1 font-medium">
                        <Radio className="w-3 h-3" />
                        GPS: {bus.gpsStatus}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-medium">
                        {bus.cameras.filter((c) => c.status === 'ONLINE').length}/4 Cams
                      </span>
                    </div>

                    <span className="text-cyan-400 text-xs font-semibold flex items-center gap-1">
                      <span>{isSelected ? 'Inspecting' : 'Select'}</span>
                      <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* FOLDED BUS DETAILS INSPECTION SUITE */}
      {selectedBus && (
        <div className="space-y-6 pt-4 border-t border-slate-800/80">
          {/* Section Header */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-cyan-950 border border-cyan-700 flex items-center justify-center text-cyan-400 font-mono font-bold text-lg shadow-inner">
                {selectedBus.id.replace('BUS-', '')}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    {selectedBus.id} Sensing Unit Profile
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 text-xs font-medium">
                    Edge Node Online
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Route: <strong className="text-slate-200">{selectedBus.routeName}</strong> • Driver: {selectedBus.driver}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={() => navigate(`/cameras?busId=${selectedBus.id}`)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-slate-950 shadow-md transition active:scale-95 cursor-pointer"
              >
                <Video className="w-4 h-4 text-slate-950" />
                <span>Launch Camera Feed</span>
              </button>
              <button
                onClick={() => {
                  setSelectedBus(null);
                  setSearchParams({});
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer"
                title="Collapse Bus Inspector"
              >
                <X className="w-4 h-4" />
                <span>Collapse</span>
              </button>
            </div>
          </div>

          {/* Architectural Callout: GPS Principle */}
          <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-800/60 flex items-start gap-3 text-xs text-slate-300">
            <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-cyan-400 font-semibold block text-sm">
                GPS Belongs to the Bus, Not to Individual Cameras
              </strong>
              <p className="mt-1 text-slate-400 leading-relaxed">
                All 4 camera streams (<span className="font-semibold text-cyan-300">FRONT</span>, <span className="font-semibold text-cyan-300">REAR</span>, <span className="font-semibold text-cyan-300">LEFT</span>, <span className="font-semibold text-cyan-300">RIGHT</span>) mounted on <strong className="text-white">{selectedBus.id}</strong> inherit the central GNSS coordinate stream (<code className="font-mono text-amber-300">{selectedBus.lat.toFixed(6)}, {selectedBus.lng.toFixed(6)}</code>). Detections are geo-tagged with this central vehicle coordinate before edge transmission.
              </p>
            </div>
          </div>

          {/* 4 Telemetry Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400 text-xs font-medium flex items-center justify-between">
                Bus GPS Location
                <Radio className="w-3.5 h-3.5 text-cyan-400" />
              </span>
              <div className="mt-1.5 font-mono font-semibold text-white text-sm">
                {selectedBus.lat.toFixed(5)}, {selectedBus.lng.toFixed(5)}
              </div>
              <span className="text-[11px] text-emerald-400 font-medium block mt-1">
                Status: {selectedBus.gpsStatus}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400 text-xs font-medium flex items-center justify-between">
                Velocity & Heading
                <BusIcon className="w-3.5 h-3.5 text-cyan-400" />
              </span>
              <div className="mt-1.5 font-mono font-semibold text-white text-sm">
                {selectedBus.speed} km/h <span className="text-xs font-sans text-slate-400">({selectedBus.direction})</span>
              </div>
              <span className="text-[11px] text-slate-400 font-medium block mt-1">
                Heading: {selectedBus.heading}°
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400 text-xs font-medium flex items-center justify-between">
                Camera Sensors
                <Video className="w-3.5 h-3.5 text-cyan-400" />
              </span>
              <div className="mt-1.5 font-semibold text-white text-sm">
                {selectedBus.cameras.filter((c) => c.status === 'ONLINE').length} / 4 Online
              </div>
              <span className="text-[11px] text-emerald-400 font-medium block mt-1">
                {selectedBus.cameraStatus}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400 text-xs font-medium flex items-center justify-between">
                Edge AI Computer
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              </span>
              <div className="mt-1.5 font-semibold text-emerald-400 text-sm">
                {selectedBus.aiStatus} (YOLOv8 + ByteTrack)
              </div>
              <span className="text-[11px] text-slate-400 font-medium block mt-1">
                Network: {selectedBus.networkStatus}
              </span>
            </div>
          </div>

          {/* Quad-Coverage Camera Sensors Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">
                Quad-Coverage On-Board Cameras ({selectedBus.id})
              </h3>
              <span className="text-xs text-slate-400 font-medium">360° Edge Perimeter</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {selectedBus.cameras.map((cam) => {
                const isOnline = cam.status === 'ONLINE';

                return (
                  <div
                    key={cam.id}
                    className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between space-y-3 hover:border-slate-700 transition shadow-sm"
                  >
                    <div>
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <span className="font-mono font-semibold text-xs text-cyan-400">{cam.id}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            isOnline
                              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/80'
                              : 'bg-rose-950/80 text-rose-400 border border-rose-800/80'
                          }`}
                        >
                          {cam.status}
                        </span>
                      </div>

                      <div className="mt-2.5 space-y-1 text-xs text-slate-300">
                        <div>
                          <span className="text-slate-400">Position:</span> {cam.position} Facing
                        </div>
                        <div>
                          <span className="text-slate-400">Stream:</span> {cam.resolution}
                        </div>
                        <div>
                          <span className="text-slate-400">Frame Rate:</span> {cam.fps} FPS
                        </div>
                        <div>
                          <span className="text-slate-400">Detections Today:</span> {cam.detectionsToday} events
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => navigate(`/cameras?busId=${selectedBus.id}&cameraId=${cam.id}`)}
                      className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-cyan-600 hover:text-slate-950 text-xs font-semibold text-slate-200 border border-slate-700 transition flex items-center justify-center gap-1.5 active:scale-95"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Inspect Camera Stream</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

