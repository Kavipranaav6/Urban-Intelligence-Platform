import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Bus as BusIcon,
  Video,
  Radio,
  Wifi,
  Cpu,
  ShieldAlert,
  ArrowRight,
  Info,
  CheckCircle,
  ExternalLink,
  MapPin
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { GISMap } from '../components/GISMap';
import { api } from '../services/api';
import { Bus, UrbanEvent, BusCamera } from '../types';

export const BusDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { buses } = useApp();

  const [bus, setBus] = useState<Bus | null>(null);
  const [busEvents, setBusEvents] = useState<UrbanEvent[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<BusCamera | null>(null);

  useEffect(() => {
    const busId = id || 'BUS-103';
    const found = buses.find((b) => b.id.toUpperCase() === busId.toUpperCase());
    if (found) {
      setBus(found);
      setSelectedCamera(found.cameras[0]);
    } else {
      api.getBus(busId).then((b) => {
        setBus(b);
        setSelectedCamera(b.cameras[0]);
      }).catch(console.error);
    }

    api.getEvents({ busId }).then((events) => {
      setBusEvents(events);
    }).catch(console.error);
  }, [id, buses]);

  if (!bus) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>Loading bus telemetry...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs customTitle={`${bus.id} Telemetry & Sensors`} />

      {/* Bus Hero Profile */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-700 flex items-center justify-center text-cyan-400 font-mono font-black text-sm">
              {bus.id.replace('BUS-', '')}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold font-mono text-white tracking-tight">{bus.id}</h1>
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-mono font-bold">
                  EDGE NODE ONLINE
                </span>
              </div>
              <p className="text-xs text-slate-400">{bus.routeName}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/cameras?busId=${bus.id}&cameraId=${selectedCamera?.id || bus.cameras[0].id}`)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-slate-950 shadow-lg shadow-cyan-950/40 transition active:scale-95"
          >
            <Video className="w-4 h-4 text-slate-950" />
            <span>Launch Live Edge Camera Feed</span>
          </button>
        </div>
      </div>

      {/* Crucial Architectural Principle Callout (Requirement 7) */}
      <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-800/60 flex items-start gap-3 text-xs text-slate-300">
        <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-cyan-400 font-semibold block text-sm">
            CORE PRINCIPLE: GPS BELONGS TO THE BUS, NOT TO THE CAMERA
          </strong>
          <p className="mt-1 text-slate-400 leading-relaxed">
            Every camera sensor (<code className="text-cyan-400">FRONT</code>, <code className="text-cyan-400">REAR</code>, <code className="text-cyan-400">LEFT</code>, <code className="text-cyan-400">RIGHT</code>)
            mounted on <strong className="text-white">{bus.id}</strong> inherits the bus's primary GNSS/GPS coordinate stream
            (<code className="text-amber-300">{bus.lat.toFixed(6)}, {bus.lng.toFixed(6)}</code>). When any camera detects a pothole,
            traffic bottleneck, or reckless driving incident, the event is immediately geo-tagged with this central vehicle coordinate.
          </p>
        </div>
      </div>

      {/* 4 Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-400 text-[11px] font-mono flex items-center justify-between">
            BUS GPS LOCATION
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
          </span>
          <div className="mt-1 font-mono font-bold text-white text-sm">
            {bus.lat.toFixed(5)}, {bus.lng.toFixed(5)}
          </div>
          <span className="text-[10px] text-emerald-400 font-mono block mt-0.5">STATUS: {bus.gpsStatus}</span>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-400 text-[11px] font-mono flex items-center justify-between">
            VELOCITY & HEADING
            <BusIcon className="w-3.5 h-3.5 text-cyan-400" />
          </span>
          <div className="mt-1 font-mono font-bold text-white text-sm">
            {bus.speed} km/h ({bus.direction})
          </div>
          <span className="text-[10px] text-slate-500 font-mono block mt-0.5">Heading: {bus.heading}°</span>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-400 text-[11px] font-mono flex items-center justify-between">
            CAMERA SENSORS
            <Video className="w-3.5 h-3.5 text-cyan-400" />
          </span>
          <div className="mt-1 font-mono font-bold text-white text-sm">
            {bus.cameras.filter((c) => c.status === 'ONLINE').length} / 4 Online
          </div>
          <span className="text-[10px] text-emerald-400 font-mono block mt-0.5">{bus.cameraStatus}</span>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-400 text-[11px] font-mono flex items-center justify-between">
            EDGE AI COMPUTER
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          </span>
          <div className="mt-1 font-mono font-bold text-emerald-400 text-sm">
            {bus.aiStatus} (YOLOv8 + ByteTrack)
          </div>
          <span className="text-[10px] text-slate-500 font-mono block mt-0.5">Network: {bus.networkStatus}</span>
        </div>
      </div>

      {/* 4 Assigned Camera Sensors Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            ASSIGNED ON-BOARD CAMERA SENSORS
          </h2>
          <span className="text-xs text-slate-400 font-mono">Quad-Coverage Perimeter</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {bus.cameras.map((cam) => {
            const isOnline = cam.status === 'ONLINE';

            return (
              <div
                key={cam.id}
                className="p-4 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between space-y-3 hover:border-cyan-500/50 transition"
              >
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="font-mono font-bold text-xs text-cyan-400">{cam.id}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                        isOnline ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-red-950 text-red-400 border border-red-800'
                      }`}
                    >
                      {cam.status}
                    </span>
                  </div>

                  <div className="mt-2.5 space-y-1 text-xs text-slate-300">
                    <div>
                      <strong className="text-slate-400">Position:</strong> {cam.position} Facing
                    </div>
                    <div>
                      <strong className="text-slate-400">Stream:</strong> {cam.resolution}
                    </div>
                    <div>
                      <strong className="text-slate-400">Frame Rate:</strong> {cam.fps} FPS
                    </div>
                    <div>
                      <strong className="text-slate-400">Detections Today:</strong> {cam.detectionsToday} events
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => navigate(`/cameras?busId=${bus.id}&cameraId=${cam.id}`)}
                  className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-cyan-600 hover:text-slate-950 text-xs font-semibold text-slate-200 border border-slate-700 transition flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Monitor Stream</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Map & Recent Bus Events */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 flex flex-col gap-2">
          <span className="text-xs font-mono font-bold text-slate-300 uppercase">
            Active Corridor Trajectory: {bus.routeName}
          </span>
          <div className="h-[360px] rounded-xl overflow-hidden border border-slate-800">
            <GISMap
              buses={[bus]}
              events={busEvents}
              selectedBusId={bus.id}
              center={[bus.lat, bus.lng]}
              zoom={14}
            />
          </div>
        </div>

        <div className="lg:col-span-6 flex flex-col gap-2">
          <span className="text-xs font-mono font-bold text-slate-300 uppercase">
            Recent Detections Inheriting {bus.id} GPS
          </span>
          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 h-[360px] overflow-y-auto space-y-2">
            {busEvents.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No recent hazard detections recorded for this bus.
              </div>
            ) : (
              busEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-xs flex items-center justify-between"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-amber-400">{ev.id}</span>
                      <span className="font-semibold text-slate-200">{ev.type}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">Sensor: {ev.cameraId}</div>
                    <div className="text-[10px] text-cyan-400 font-mono">
                      GPS: {ev.latitude.toFixed(5)}, {ev.longitude.toFixed(5)}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300">
                      {ev.confidence}% Conf
                    </span>
                    <span className="block text-[10px] text-slate-400 mt-1">{ev.timestamp}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
