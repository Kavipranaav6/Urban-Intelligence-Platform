import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Bus,
  AlertTriangle,
  Activity,
  ShieldAlert,
  Camera,
  Layers,
  ArrowUpRight,
  TrendingUp,
  Cpu,
  CheckCircle,
  Clock,
  MapPin,
  Wifi
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { GISMap } from '../components/GISMap';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { UrbanEvent, ConsolidatedRoadIssue } from '../types';

export const OverviewDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { buses, stats, networkOnline } = useApp();
  const [recentEvents, setRecentEvents] = useState<UrbanEvent[]>([]);
  const [roadIssues, setRoadIssues] = useState<ConsolidatedRoadIssue[]>([]);
  const [trafficSummary, setTrafficSummary] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [events, issues, traffic] = await Promise.all([
          api.getEvents(),
          api.getRoadIssues(),
          api.getTraffic()
        ]);
        setRecentEvents(events.slice(0, 6));
        setRoadIssues(issues.slice(0, 4));
        setTrafficSummary(traffic);
      } catch (e) {
        console.error('Error fetching dashboard data:', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      <Breadcrumbs />

      {/* Hero Command Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Central Transport Command Centre
            </h1>
            <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 text-[11px] font-medium">
              Edge AI Telemetry
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Real-time urban surveillance transforming regular public buses into mobile sensor units.
            Analyzing road surface hazards, traffic congestion, pedestrian safety, and ANPR at the Edge.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/map')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5 text-cyan-400" />
            <span>Full GIS Map</span>
          </button>
        </div>
      </div>

      {/* 4 Primary Key Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Active Fleet */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Active Bus Fleet</span>
            <div className="p-1.5 rounded-lg bg-cyan-950 border border-cyan-800 text-cyan-400">
              <Bus className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-white">
                {stats?.activeBuses ?? buses.filter((b) => b.speed > 0).length}
              </span>
              <span className="text-sm font-mono text-slate-400">
                / {stats?.totalBuses ?? buses.length} Units
              </span>
            </div>
            <span className="text-xs text-emerald-400 font-medium flex items-center gap-1.5 mt-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
              On-Route Mobile Sensing
            </span>
          </div>
        </div>

        {/* Metric 2: Unresolved Road Hazards */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Unresolved Hazards</span>
            <div className="p-1.5 rounded-lg bg-amber-950 border border-amber-800 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-amber-400">
                {stats?.roadIssuesDetected ?? roadIssues.length}
              </span>
              <span className="text-xs text-slate-400">Defect Clusters</span>
            </div>
            <span className="text-xs text-slate-400 mt-1 block">
              Potholes, cracks & waterlogging
            </span>
          </div>
        </div>

        {/* Metric 3: Safety Incidents */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Safety Alerts</span>
            <div className="p-1.5 rounded-lg bg-rose-950 border border-rose-800 text-rose-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-rose-400">
                {stats?.safetyAlerts ?? 0}
              </span>
              <span className="text-xs text-slate-400">Infractions</span>
            </div>
            <span className="text-xs text-slate-400 mt-1 block">
              Pedestrian, rash driving & ANPR
            </span>
          </div>
        </div>

        {/* Metric 4: System & Edge Pipeline Status */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Network & Edge Pipeline</span>
            <div className="p-1.5 rounded-lg bg-emerald-950 border border-emerald-800 text-emerald-400">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-emerald-400">
                {networkOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
              <span className="text-xs text-slate-400">5G Link</span>
            </div>
            <span className="text-xs text-slate-400 mt-1 block">
              99.98% Cellular Bandwidth Saved
            </span>
          </div>
        </div>
      </div>

      {/* Main Command Split: Left GIS Map Preview, Right Live Events & Multi-bus Fusions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: GIS Map Preview (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-white tracking-tight">LIVE GIS FLEET & HAZARD SURVEILLANCE</h2>
            </div>
            <Link
              to="/map"
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
            >
              <span>Expand Full Map</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="h-[420px] rounded-xl overflow-hidden border border-slate-800 shadow-xl">
            <GISMap
              buses={buses}
              events={recentEvents}
              showHeatmap={true}
              onSelectBus={(b) => navigate(`/fleet?busId=${b.id}`)}
              onSelectEvent={(e) => navigate('/incidents')}
            />
          </div>

          {/* Dynamic Corridor Speeds from Live Buses */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {buses.length > 0 ? (
              buses.slice(0, 3).map((bus) => {
                const corridorName = bus.routeName?.includes('-')
                  ? bus.routeName.split('-')[1].trim()
                  : bus.routeName || 'Corridor Transit';
                const speed = typeof bus.speed === 'number' ? bus.speed : 0;
                const isIdle = speed === 0;
                const isCongested = !isIdle && speed < 20;
                const isModerate = !isIdle && speed >= 20 && speed < 35;
                const statusLabel = isIdle ? 'IDLE' : isCongested ? 'SLOW' : isModerate ? 'MOD' : 'CLEAR';
                const statusClass = isIdle
                  ? 'bg-slate-800 text-slate-400 border border-slate-700'
                  : isCongested
                  ? 'bg-rose-950 text-rose-400 border border-rose-800'
                  : isModerate
                  ? 'bg-amber-950 text-amber-400 border border-amber-800'
                  : 'bg-emerald-950 text-emerald-400 border border-emerald-800';

                return (
                  <div key={bus.id} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 text-[10px] block truncate font-mono uppercase">
                      {bus.id} • {corridorName}
                    </span>
                    <div className="flex items-center justify-between mt-1">
                      <span className="font-bold text-slate-100 font-mono">
                        {isIdle ? '0 km/h (Stopped)' : `${speed} km/h`}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${statusClass}`}>
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              // Safe fallback when buses telemetry is loading or empty
              ['Avinashi Corridor', 'Trichy Arterial', 'Mettupalayam Rd'].map((name, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 text-[10px] block truncate font-mono uppercase">
                    FLEET • {name}
                  </span>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-bold text-slate-400 font-mono">-- km/h</span>
                    <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                      STANDBY
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Multi-Bus Event Fusion & Recent Alerts (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* High-Priority Road Hazards Card */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold font-mono text-white uppercase tracking-wider">
                  HIGH-PRIORITY ROAD HAZARDS
                </h3>
              </div>
              <Link to="/incidents?category=ROAD_HAZARD" className="text-[11px] text-cyan-400 hover:underline">
                View All
              </Link>
            </div>

            <div className="mt-3 space-y-2">
              {roadIssues.map((issue) => (
                <div
                  key={issue.id}
                  onClick={() => navigate('/incidents?category=ROAD_HAZARD')}
                  className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-cyan-500/50 cursor-pointer transition flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-amber-400">{issue.id}</span>
                      <span className="font-semibold text-slate-200">{issue.type}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
                      {issue.roadName}
                    </div>
                    <div className="text-[10px] text-cyan-400 font-mono">
                      Buses: {issue.reportingBuses.join(', ')}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 font-mono font-bold text-[10px] border border-cyan-800">
                      {issue.sightingCount} Sightings
                    </span>
                    <span className="block text-[10px] text-emerald-400 font-medium mt-1">
                      Confirmed Fusion
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Authority Alerts */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  RECENT AUTHORITY ALERTS
                </h3>
              </div>
              <Link to="/incidents" className="text-[11px] text-cyan-400 hover:underline">
                View All
              </Link>
            </div>

            <div className="mt-2.5 space-y-2">
              {recentEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="p-2 rounded-lg bg-slate-950/50 border border-slate-800/80 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        ev.severity === 'CRITICAL' ? 'bg-red-500' :
                        ev.severity === 'HIGH' ? 'bg-orange-500' : 'bg-yellow-500'
                      }`}
                    />
                    <div>
                      <div className="font-semibold text-slate-200">
                        {ev.type} <span className="font-mono text-slate-500 text-[10px]">({ev.busId})</span>
                      </div>
                      <div className="text-[10px] text-slate-400">{ev.timestamp}</div>
                    </div>
                  </div>

                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                      ev.status === 'NEW' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                      ev.status === 'VERIFIED' ? 'bg-cyan-950 text-cyan-400 border border-cyan-800' :
                      ev.status === 'RESOLVED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                      'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {ev.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Fleet Live Table Quick Glance */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Bus className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Active Sensing Bus Units (8 Fleet Units)
            </h3>
          </div>
          <Link to="/fleet" className="text-xs text-cyan-400 hover:underline flex items-center gap-1 font-medium">
            <span>Fleet Control Room</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 font-medium text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Bus ID</th>
                <th className="py-2.5 px-3">Assigned Route</th>
                <th className="py-2.5 px-3">Speed</th>
                <th className="py-2.5 px-3">GPS Coordinate</th>
                <th className="py-2.5 px-3">Cameras</th>
                <th className="py-2.5 px-3">Edge AI Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {buses.map((bus) => (
                <tr key={bus.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-2.5 px-3 font-mono font-bold text-cyan-400">{bus.id}</td>
                  <td className="py-2.5 px-3 text-slate-300">{bus.routeName}</td>
                  <td className="py-2.5 px-3 font-mono">{bus.speed} km/h</td>
                  <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px]">
                    {bus.lat.toFixed(4)}, {bus.lng.toFixed(4)}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 font-mono text-[10px]">
                      4/4 Online
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-medium">
                      <Cpu className="w-3 h-3" />
                      YOLOv8 Active
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={() => navigate(`/fleet?busId=${bus.id}`)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition cursor-pointer"
                    >
                      Inspect Unit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
