import React from 'react';
import { Sparkles, Play, Square, Wifi, WifiOff, Cpu, Sun, Moon } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const Navbar: React.FC = () => {
  const {
    networkOnline,
    setNetworkOnline,
    offlineQueue,
    syncOfflineQueue,
    isSimulating,
    toggleSimulation,
    startLiveDemoFlow,
    isDemoRunning,
    theme,
    toggleTheme
  } = useApp();

  return (
    <header className="sticky top-0 z-40 w-full bg-slate-950/95 backdrop-blur-md border-b border-slate-800/80 px-4 py-2.5 flex items-center justify-between text-slate-100">
      {/* Brand & Identity */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center text-slate-950 font-black text-sm shadow-md shadow-cyan-950">
            US
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-white">UrbanSense AI</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
                Demo
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-normal">
              Mobile Urban Edge Intelligence & Transit Surveillance
            </p>
          </div>
        </div>

        {/* Bandwidth optimization indicator */}
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300">
          <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          <span>Edge Processing: <strong className="text-emerald-400 font-mono font-medium">99.9% saved</strong></span>
        </div>
      </div>

      {/* Center Controls: Simulation & Run Live Demo */}
      <div className="flex items-center gap-2">
        {/* Run Live Demo button */}
        <button
          onClick={() => startLiveDemoFlow()}
          disabled={isDemoRunning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-xs font-semibold text-slate-950 shadow-sm transition active:scale-95 disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5 text-slate-950 fill-slate-950" />
          <span>Run Live Demo</span>
        </button>

        {/* Simulation Mode Toggle */}
        <button
          onClick={toggleSimulation}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition active:scale-95 ${
            isSimulating
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600/80 shadow-sm'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
          }`}
        >
          {isSimulating ? (
            <>
              <Square className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" />
              <span>Simulation Active</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-slate-400 text-slate-400" />
              <span>Start Simulation</span>
            </>
          )}
        </button>
      </div>

      {/* Right Controls: Network Status + Theme Switcher */}
      <div className="flex items-center gap-3">
        {/* Network Online / Offline toggle */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              if (!networkOnline) {
                syncOfflineQueue();
              }
              setNetworkOnline(!networkOnline);
            }}
            title="Toggle Network connectivity to test Edge Offline Queueing"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
              networkOnline
                ? 'bg-slate-900 text-emerald-400 border-slate-800 hover:bg-slate-800'
                : 'bg-rose-950/80 text-rose-300 border-rose-800'
            }`}
          >
            {networkOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span>Online (5G)</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                <span>Offline ({offlineQueue.length} Queued)</span>
              </>
            )}
          </button>
        </div>

        {/* Theme Toggle (Light / Dark) */}
        <div className="flex items-center pl-2 border-l border-slate-800">
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Tactical Dark Theme'}
            aria-label="Toggle Light/Dark Theme"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all active:scale-95 ${
              theme === 'dark'
                ? 'bg-slate-900 hover:bg-slate-800 text-amber-400 border-slate-700 hover:border-amber-500/50 shadow-sm'
                : 'bg-white hover:bg-slate-100 text-blue-600 border-slate-300 shadow-sm'
            }`}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
                <span className="hidden md:inline text-xs text-slate-300">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-blue-600 fill-blue-600/20" />
                <span className="hidden md:inline text-xs text-slate-700">Dark</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
