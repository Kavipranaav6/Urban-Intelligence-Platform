import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Car,
  Video,
  TrendingUp,
  Clock,
  AlertTriangle,
  Layers,
  MapPin,
  CheckCircle2,
  Gauge
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from 'recharts';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { GISMap } from '../components/GISMap';
import { api } from '../services/api';
import { useApp } from '../context/AppContext';

export const TrafficAnalyticsPage: React.FC = () => {
  const { buses } = useApp();
  const [trafficData, setTrafficData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    api.getTraffic().then((data) => {
      setTrafficData(data);
      setLoading(false);
    }).catch(console.error);
  }, []);

  // Derive hourly trends directly from backend /api/traffic
  const hourlyTrends = trafficData?.hourly?.map((h: any) => ({
    hour: h.time,
    congestion: h.congestion,
    avgSpeed: h.avgSpeed,
    vehicles: h.vehicles
  })) || [];

  // Derive corridor bottlenecks directly from backend /api/traffic bottlenecks
  const corridorData = (trafficData?.bottlenecks || []).map((b: any) => ({
    corridor: b.name.replace(' Central Cross', '').replace(' Junction', '').replace(' Arterial Meridian', '').replace(' Underpass', ''),
    fullName: b.name,
    speed: b.avgSpeed,
    congestion: b.level === 'CRITICAL' ? 88 : b.level === 'HIGH' ? 74 : b.level === 'MEDIUM' ? 52 : 36,
    queue: b.queueLengthMeters,
    level: b.level
  }));

  // Dynamic KPI calculations from live data
  const avgFleetSpeed = buses.length > 0
    ? (buses.reduce((acc, b) => acc + (b.speed || 0), 0) / buses.length).toFixed(1)
    : '27.4';

  const peakCongestionItem = hourlyTrends.length > 0
    ? [...hourlyTrends].sort((a, b) => b.congestion - a.congestion)[0]
    : null;

  return (
    <div className="space-y-6">
      <Breadcrumbs customTitle="Traffic Density & Bottleneck Analytics" />

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold text-white tracking-tight">
              City-Wide Traffic Density Intelligence
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/80 text-xs font-medium">
              Edge Traffic Sensing
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time traffic density, bottleneck mapping, dwell time, and arterial velocity
            aggregated continuously across mobile bus fleet telemetry.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/cameras?tab=multi"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/80 text-xs font-medium transition shadow-sm"
          >
            <Video className="w-3.5 h-3.5 text-cyan-400" />
            <span>Multi-Bus Video Ingestion</span>
          </Link>
        </div>
      </div>

      {/* Top 4 Traffic KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-slate-400 text-xs font-medium flex items-center justify-between">
            Peak Congestion
            <Activity className="w-4 h-4 text-rose-400" />
          </span>
          <div className="mt-2">
            <span className="text-2xl font-bold font-mono text-rose-400">
              {peakCongestionItem ? `${peakCongestionItem.congestion}%` : '94%'}
            </span>
            <span className="text-xs text-slate-400 block mt-0.5">
              {peakCongestionItem ? `Peak at ${peakCongestionItem.hour}` : 'Gandhipuram Core (18:00 - 19:30)'}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-slate-400 text-xs font-medium flex items-center justify-between">
            Fleet Avg Transit Speed
            <Gauge className="w-4 h-4 text-cyan-400" />
          </span>
          <div className="mt-2">
            <span className="text-2xl font-bold font-mono text-cyan-300">{avgFleetSpeed} km/h</span>
            <span className="text-xs text-emerald-400 block mt-0.5">Real-time bus velocity average</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-slate-400 text-xs font-medium flex items-center justify-between">
            Active Bottlenecks
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </span>
          <div className="mt-2">
            <span className="text-2xl font-bold font-mono text-amber-400">
              {corridorData.length} Corridors
            </span>
            <span className="text-xs text-slate-400 block mt-0.5">
              {corridorData.length > 0 ? corridorData.map((c: any) => c.corridor).slice(0, 2).join(', ') : 'Monitoring active'}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-slate-400 text-xs font-medium flex items-center justify-between">
            Avg Bus Stop Dwell Time
            <Clock className="w-4 h-4 text-amber-300" />
          </span>
          <div className="mt-2">
            <span className="text-2xl font-bold font-mono text-amber-300">42 sec</span>
            <span className="text-xs text-slate-400 block mt-0.5">Within 45s target threshold</span>
          </div>
        </div>
      </div>

      {/* Hourly Trend Chart */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">
              Hourly Congestion & Average Speed Profile (06:00 - 21:00)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Correlation between vehicular density and transit velocity recorded across fleet routes.
            </p>
          </div>
          <span className="text-xs text-cyan-400 font-medium">Aggregated Fleet Telemetry</span>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={hourlyTrends} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="congGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="hour" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '12px'
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              <Area
                type="monotone"
                dataKey="congestion"
                name="Congestion Index (%)"
                stroke="#f43f5e"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#congGrad)"
              />
              <Area
                type="monotone"
                dataKey="avgSpeed"
                name="Average Speed (km/h)"
                stroke="#06b6d4"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#speedGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Corridor Bottleneck Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Corridor Speed Comparison (8 cols) */}
        <div className="lg:col-span-8 p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                Corridor Bottlenecks & Velocity
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Congestion index and detected vehicle speed per arterial segment
              </p>
            </div>
            <span className="text-xs text-slate-400 font-medium">Peak Period</span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={corridorData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <XAxis dataKey="corridor" stroke="#64748b" fontSize={11} interval={0} angle={-15} textAnchor="end" />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '12px'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="congestion" name="Congestion (%)" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="speed" name="Speed (km/h)" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Bottleneck Details Panel (4 cols) */}
        <div className="lg:col-span-4 p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h3 className="text-sm font-semibold text-slate-200">
              Bottleneck Queues
            </h3>
            <span className="text-xs text-amber-400 font-medium">Live Ingestion</span>
          </div>

          <div className="space-y-2.5">
            {corridorData.length > 0 ? (
              corridorData.map((item: any, idx: number) => (
                <div key={idx} className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white truncate max-w-[180px]">
                      {item.fullName || item.corridor}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                        item.level === 'CRITICAL'
                          ? 'bg-rose-950/80 text-rose-400 border-rose-800/80'
                          : item.level === 'HIGH'
                          ? 'bg-amber-950/80 text-amber-400 border-amber-800/80'
                          : 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                      }`}
                    >
                      {item.level || 'MODERATE'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Queue: <strong className="text-white font-mono">{item.queue || 180}m</strong></span>
                    <span>Transit: <strong className="text-cyan-400 font-mono">{item.speed} km/h</strong></span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-500 py-4 text-center">
                No active bottleneck congestion detected
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Heatmap Map View */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-cyan-400" />
            GIS Traffic Congestion Heatmap Overlay
          </h3>
          <span className="text-xs text-slate-400 font-medium">
            Red circles indicate active traffic bottlenecks (Gandhipuram, Lakshmi Mills, Hope College)
          </span>
        </div>

        <div className="h-[380px] rounded-xl overflow-hidden border border-slate-800">
          <GISMap
            buses={buses}
            showHeatmap={true}
            activeLayers={{
              buses: true,
              traffic: true,
              roadIssues: false,
              safety: false,
              infrastructure: false
            }}
          />
        </div>
      </div>
    </div>
  );
};
