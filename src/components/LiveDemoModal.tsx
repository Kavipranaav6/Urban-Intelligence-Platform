import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, CheckCircle2, Loader2, Sparkles, MapPin, AlertTriangle, ArrowRight, Shield } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const LiveDemoModal: React.FC = () => {
  const { showDemoModal, isDemoRunning, demoSteps, currentDemoStep, closeDemoModal } = useApp();
  const navigate = useNavigate();

  if (!showDemoModal) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-2xl rounded-2xl bg-slate-900 border border-cyan-500/30 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-950 border border-cyan-700 text-cyan-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base tracking-tight">URBANSENSE AI - LIVE END-TO-END DEMO</h3>

              </div>
              <p className="text-xs text-slate-400">
                Automated 12-Step Mobile Urban Sensing & Edge Inference Story
              </p>
            </div>
          </div>
          {!isDemoRunning && (
            <button
              onClick={closeDemoModal}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-950 h-1.5 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-400 transition-all duration-500"
            style={{ width: `${(currentDemoStep / demoSteps.length) * 100}%` }}
          />
        </div>

        {/* Steps List */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          {demoSteps.map((step) => {
            const isCompleted = step.status === 'completed';
            const isActive = step.status === 'active';

            return (
              <div
                key={step.stepNumber}
                className={`flex items-start gap-3.5 p-3 rounded-xl border transition-all duration-300 ${
                  isActive
                    ? 'bg-cyan-950/40 border-cyan-500/60 shadow-lg shadow-cyan-950/50'
                    : isCompleted
                    ? 'bg-slate-950/40 border-slate-800/80'
                    : 'bg-slate-950/20 border-slate-900/60 opacity-40'
                }`}
              >
                {/* Step indicator */}
                <div className="pt-0.5">
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : isActive ? (
                    <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-slate-700 flex items-center justify-center text-[10px] text-slate-500 font-mono">
                      {step.stepNumber}
                    </div>
                  )}
                </div>

                {/* Step Content */}
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold font-mono ${isActive ? 'text-cyan-300' : isCompleted ? 'text-slate-200' : 'text-slate-500'}`}>
                      STEP {step.stepNumber}: {step.title}
                    </span>
                    {isActive && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-900 text-cyan-200 animate-pulse">
                        PROCESSING...
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer with jump buttons */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {isDemoRunning ? (
              <span className="flex items-center gap-2 text-cyan-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Executing edge pipeline... step {currentDemoStep} of {demoSteps.length}
              </span>
            ) : (
              <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Workflow successfully stored in Central PostGIS database!
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isDemoRunning && (
              <>
                <button
                  onClick={() => {
                    closeDemoModal();
                    navigate('/map');
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white transition shadow-lg"
                >
                  <MapPin className="w-4 h-4" />
                  <span>View on GIS Map</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    closeDemoModal();
                    navigate('/incidents');
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Review Incidents Hub</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
