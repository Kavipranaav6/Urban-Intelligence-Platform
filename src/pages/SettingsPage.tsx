import React from 'react';
import {
  Settings,
  Cpu,
  Server,
  Database,
  Layers,
  Shield,
  Wifi,
  WifiOff,
  Sun,
  Moon,
  Monitor,
  CheckCircle2
} from 'lucide-react';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useApp } from '../context/AppContext';
import { UserRole } from '../types';

export const SettingsPage: React.FC = () => {
  const {
    role,
    setRole,
    networkOnline,
    setNetworkOnline,
    offlineQueue,
    syncOfflineQueue,
    theme,
    setTheme
  } = useApp();

  return (
    <div className="space-y-6">
      <Breadcrumbs customTitle="System Architecture & Edge Pipeline Settings" />

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-100 tracking-tight">
              ARCHITECTURE & SYSTEM CONFIGURATION
            </h1>

          </div>
          <p className="text-xs text-slate-400 mt-1">
            Structural specifications for Edge AI processing, multi-bus spatial deduplication,
            offline queueing, and role-based authority access.
          </p>
        </div>
      </div>

      {/* Display & Theme Appearance Settings */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-sm">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
              DISPLAY & THEME APPEARANCE
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Current: <strong className="text-cyan-400 uppercase">{theme} MODE</strong>
          </span>
        </div>

        <p className="text-xs text-slate-400">
          Choose your interface preference. Toggle anytime from the top navigation bar or select below.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* Tactical Dark Mode */}
          <div
            onClick={() => setTheme('dark')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              theme === 'dark'
                ? 'bg-slate-950 border-cyan-500 ring-2 ring-cyan-500/30 shadow-lg'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 opacity-80'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-amber-400">
                  <Moon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-100">Tactical Dark</h4>
                  <span className="text-[10px] text-slate-400 font-mono">Command Center Default</span>
                </div>
              </div>
              {theme === 'dark' && (
                <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed">
              High-contrast tactical dark styling optimized for 24/7 transport monitoring rooms, reduced eye strain, and glowing GIS overlays.
            </p>
          </div>

          {/* High-Contrast Light Mode */}
          <div
            onClick={() => setTheme('light')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              theme === 'light'
                ? 'bg-slate-950 border-cyan-500 ring-2 ring-cyan-500/30 shadow-lg'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 opacity-80'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-blue-500">
                  <Sun className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-100">Executive Light</h4>
                  <span className="text-[10px] text-slate-400 font-mono">Municipal Office Contrast</span>
                </div>
              </div>
              {theme === 'light' && (
                <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed">
              Clean, bright daylight paper aesthetic designed for municipal office desks, daylight inspection tablets, and presentation displays.
            </p>
          </div>
        </div>
      </div>

      {/* Architectural Flow Diagram */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-sm">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
              END-TO-END DATA FLOW PIPELINE ARCHITECTURE
            </h3>
          </div>
          <span className="text-[11px] font-mono text-emerald-400">Strict Layer Separation</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          {/* Box 1 */}
          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 flex flex-col justify-between space-y-2">
            <div>
              <span className="text-[10px] font-mono text-cyan-400 font-bold block">1. BUS EDGE SENSORS</span>
              <h4 className="font-bold text-slate-100 mt-1">Quad Video Cameras</h4>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                4 on-board cameras (FRONT, REAR, L, R) capture road surface and traffic continuously at 30 FPS.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-400 font-mono">
              Local Hardware Bus Unit
            </div>
          </div>

          {/* Box 2 */}
          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-cyan-500/50 shadow-md flex flex-col justify-between space-y-2">
            <div>
              <span className="text-[10px] font-mono text-emerald-400 font-bold block">2. ON-BOARD EDGE AI</span>
              <h4 className="font-bold text-slate-100 mt-1">YOLOv8 + ByteTrack + ANPR</h4>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Inference runs locally on the bus edge computer. Filters out empty frames. Extracts vehicle tracks,
                potholes, waterlogging, and plates.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-800 text-[10px] text-cyan-400 font-mono">
              Edge Storage Queue
            </div>
          </div>

          {/* Box 3 */}
          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 flex flex-col justify-between space-y-2">
            <div>
              <span className="text-[10px] font-mono text-amber-400 font-bold block">3. CELLULAR DISPATCH</span>
              <h4 className="font-bold text-slate-100 mt-1">Event-Based Transmission</h4>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Sends lightweight JSON metadata (14 KB) + cropped evidence frames over 4G/5G. Queues locally when offline.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-800 text-[10px] text-purple-400 font-mono">
              99.98% Bandwidth Saved
            </div>
          </div>

          {/* Box 4 */}
          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 flex flex-col justify-between space-y-2">
            <div>
              <span className="text-[10px] font-mono text-rose-400 font-bold block">4. CENTRAL AUTHORITY</span>
              <h4 className="font-bold text-slate-100 mt-1">PostGIS & GIS Dashboard</h4>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Fuses observations from multiple buses within 85m. Generates work-orders for PWD, Traffic Police,
                and Municipal Corporation.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-400 font-mono">
              Central PostGIS / API
            </div>
          </div>
        </div>
      </div>

      {/* Bandwidth Optimization & Offline Architecture */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Bandwidth Optimization */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 text-xs shadow-sm">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <Cpu className="w-4 h-4 text-purple-400" />
            <h3 className="font-bold text-slate-200 uppercase font-mono tracking-wider">
              BANDWIDTH OPTIMIZATION ARCHITECTURE
            </h3>
          </div>

          <p className="text-slate-400 leading-relaxed">
            Streaming raw high-definition video from hundreds of city buses over commercial cellular networks is
            cost-prohibitive and unstable. UrbanSense AI implements an{' '}
            <strong className="text-slate-200">Edge-Retention Protocol</strong>:
          </p>

          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 font-mono space-y-2">
            <div className="flex justify-between text-slate-400">
              <span>Continuous 1080p Video Stream:</span>
              <span className="text-rose-400 font-bold">~1.8 GB / hour per bus</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>UrbanSense Edge Event Payload:</span>
              <span className="text-emerald-400 font-bold">~4.2 MB / hour per bus</span>
            </div>
            <div className="pt-2 border-t border-slate-800 flex justify-between text-slate-300">
              <span>Overall Cellular Bandwidth Saved:</span>
              <strong className="text-purple-400 text-sm">99.76% Reduction</strong>
            </div>
          </div>

          <p className="text-slate-400 text-[11px] leading-relaxed">
            Raw footage remains in a rolling 48-hour circular ring buffer on the bus's local NVMe solid-state drive
            and is only queried upon special warrant or major accident investigation.
          </p>
        </div>

        {/* Right: Offline Edge Queueing Engine */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 text-xs shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4 text-cyan-400" />
              <h3 className="font-bold text-slate-200 uppercase font-mono tracking-wider">
                OFFLINE-RESILIENT EDGE QUEUE
              </h3>
            </div>
            <button
              onClick={() => {
                if (!networkOnline) syncOfflineQueue();
                setNetworkOnline(!networkOnline);
              }}
              className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold border transition ${
                networkOnline
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                  : 'bg-rose-950 text-rose-400 border-rose-800'
              }`}
            >
              Simulate: {networkOnline ? 'GO OFFLINE' : 'RESTORE ONLINE'}
            </button>
          </div>

          <p className="text-slate-400 leading-relaxed">
            Public buses regularly pass through underpasses, rural fringes, and cellular dead zones. The edge software
            spools detected hazard records into a persistent local SQLite queue with exact GPS tags and timestamps.
          </p>

          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between font-mono">
              <span className="text-slate-400">Current Network Status:</span>
              <span className={networkOnline ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {networkOnline ? 'ONLINE (5G DEDICATED)' : 'OFFLINE (NETWORK DROPPED)'}
              </span>
            </div>
            <div className="flex items-center justify-between font-mono">
              <span className="text-slate-400">Locally Spooled Events in Queue:</span>
              <strong className="text-amber-400">{offlineQueue.length} records pending</strong>
            </div>
          </div>

          {offlineQueue.length > 0 && (
            <button
              onClick={syncOfflineQueue}
              className="w-full py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs transition"
            >
              Sync {offlineQueue.length} Spooled Events to Central DB
            </button>
          )}
        </div>
      </div>

      {/* Role-Based Authority Control */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-sm">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
              ROLE-BASED AUTHORITY ACCESS (RBAC)
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-400">Active Role: <strong className="text-cyan-400">{role}</strong></span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div
            onClick={() => setRole('TRANSPORT_AUTHORITY')}
            className={`p-3.5 rounded-xl border cursor-pointer transition ${
              role === 'TRANSPORT_AUTHORITY'
                ? 'bg-slate-950 border-cyan-500/70 ring-1 ring-cyan-500/30'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="font-semibold text-slate-200">Transport Authority</div>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Verify road defects, dispatch PWD repair work-orders, inspect city-wide traffic congestion, and review ANPR violations.
            </p>
          </div>

          <div
            onClick={() => setRole('ADMIN')}
            className={`p-3.5 rounded-xl border cursor-pointer transition ${
              role === 'ADMIN'
                ? 'bg-slate-950 border-cyan-500/70 ring-1 ring-cyan-500/30'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="font-semibold text-slate-200">System Administrator</div>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Configure edge model weights (YOLOv8 confidence thresholds), manage bus fleet nodes, and adjust PostGIS fusion radii.
            </p>
          </div>

          <div
            onClick={() => setRole('OPERATOR')}
            className={`p-3.5 rounded-xl border cursor-pointer transition ${
              role === 'OPERATOR'
                ? 'bg-slate-950 border-cyan-500/70 ring-1 ring-cyan-500/30'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="font-semibold text-slate-200">Fleet Operator</div>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Monitor live camera sensor streams, check driver schedules, and track individual vehicle mechanical telemetry.
            </p>
          </div>
        </div>
      </div>

      {/* Prototype Disclosure Notice */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-1.5 leading-relaxed shadow-sm">
        <strong className="text-amber-400 font-mono block">URBANSENSE AI - PROTOTYPE TRANSPARENCY DISCLOSURE:</strong>
        <p>
          This application is a software prototype created to evaluate and demonstrate the operational feasibility
          of using public bus networks as distributed urban edge sensing platforms. Telemetry, video feeds, and
          hazard alerts are generated using a realistic city simulation engine and demo videos. It does not interface
          with live public bus security cameras without authorized governmental deployment.
        </p>
      </div>
    </div>
  );
};
