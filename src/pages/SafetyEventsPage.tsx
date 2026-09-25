import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Camera,
  Eye,
  CheckCircle,
  Clock,
  X,
  UserCheck,
  Car,
  Filter,
  Zap,
  MapPin,
  CreditCard
} from 'lucide-react';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { api } from '../services/api';
import { UrbanEvent, AlertStatus } from '../types';

export const SafetyEventsPage: React.FC = () => {
  const [safetyEvents, setSafetyEvents] = useState<UrbanEvent[]>([]);
  const [selectedViolation, setSelectedViolation] = useState<string>('ALL');
  const [modalEvent, setModalEvent] = useState<UrbanEvent | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    api.getEvents({ category: 'SAFETY' }).then((events) => {
      setSafetyEvents(events);
      setLoading(false);
    }).catch(console.error);
  }, []);

  const handleStatusChange = async (id: string, status: AlertStatus) => {
    try {
      const updated = await api.updateEventStatus(id, status);
      setSafetyEvents((prev) => prev.map((e) => (e.id === id ? updated : e)));
      if (modalEvent?.id === id) setModalEvent(updated);
    } catch (err) {
      console.error(err);
    }
  };

  const hitRunCount = safetyEvents.filter(ev => ev.type.toLowerCase().includes('hit-and-run') || ev.type.toLowerCase().includes('hit and run')).length;
  const rashCount = safetyEvents.filter(ev => ev.type.toLowerCase().includes('rash')).length;

  const filtered = safetyEvents.filter((ev) => {
    if (selectedViolation === 'ALL') return true;
    if (selectedViolation === 'HIT_AND_RUN') return ev.type.toLowerCase().includes('hit-and-run') || ev.type.toLowerCase().includes('hit and run');
    if (selectedViolation === 'RASH') return ev.type.toLowerCase().includes('rash');
    return ev.type.toLowerCase().includes(selectedViolation.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <Breadcrumbs customTitle="Safety Incidents & ANPR Surveillance" />

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-white tracking-tight">
              SAFETY EVENTS & ANPR SURVEILLANCE
            </h1>

            <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800 text-[10px] font-mono font-bold">
              CRITICAL INCIDENTS
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time trajectory analysis flagging pedestrian near-misses, dangerous overtaking,
            and bus-lane encroachment, with OCR plate identification.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-rose-400">
            Active Safety Alerts: <strong>{safetyEvents.length}</strong>
          </span>
          {hitRunCount > 0 && (
            <span className="px-3 py-1.5 rounded-lg bg-red-950 border border-red-700 text-xs font-mono text-red-300 flex items-center gap-1 animate-pulse">
              <Zap className="w-3 h-3" />
              Hit-and-Run: <strong className="ml-1">{hitRunCount}</strong>
            </span>
          )}
          {rashCount > 0 && (
            <span className="px-3 py-1.5 rounded-lg bg-orange-950 border border-orange-700 text-xs font-mono text-orange-300 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Rash Driving: <strong className="ml-1">{rashCount}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Mandatory Privacy & System Boundary Callout (Requirement 14) */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-start gap-3.5 text-xs text-slate-300">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-amber-400 font-semibold block text-sm">
            SYSTEM BOUNDARY & CITIZEN PRIVACY SAFEGUARD NOTICE
          </strong>
          <p className="mt-1 text-slate-400 leading-relaxed">
            The on-board ANPR module identifies optical registration characters on public roadways (e.g.{' '}
            <code className="text-amber-300">TN 38 AB 1234</code>) to record vehicular infractions. It does{' '}
            <strong className="text-slate-200">NOT</strong> automatically disclose personal owner names or private residential records.
            Such linkages are restricted to authorized law enforcement officers via secure government vehicle database APIs.
          </p>
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400 font-medium">Filter by Incident Class:</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(['ALL', 'HIT_AND_RUN', 'RASH', 'Pedestrian', 'Overtake', 'Lane', 'Red Light'] as string[]).map((type) => {
            const label: Record<string, string> = { ALL: 'ALL', HIT_AND_RUN: '🚨 Hit-and-Run', RASH: '⚡ Rash Driving' };
            return (
              <button
                key={type}
                onClick={() => setSelectedViolation(type)}
                className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold border transition ${
                  selectedViolation === type
                    ? type === 'HIT_AND_RUN'
                      ? 'bg-red-950 text-red-300 border-red-600'
                      : type === 'RASH'
                        ? 'bg-orange-950 text-orange-300 border-orange-600'
                        : 'bg-rose-950 text-rose-300 border-rose-600'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800'
                }`}
              >
                {label[type] || type}
              </button>
            );
          })}
        </div>
      </div>

      {/* Safety Incidents & ANPR Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((ev) => (
          <div
            key={ev.id}
            className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden flex flex-col justify-between hover:border-rose-500/50 transition shadow-lg"
          >
            {/* Visual Evidence Frame */}
            <div className="relative aspect-video w-full bg-slate-950 border-b border-slate-800 overflow-hidden group">
              <img
                src={ev.evidence}
                alt={ev.type}
                className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
              />
              <div className="absolute top-2 left-2 flex items-center gap-1.5">
                <span className="font-mono font-bold text-xs bg-slate-900/90 text-rose-400 px-2 py-0.5 rounded border border-slate-700">
                  {ev.id}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-red-950 text-red-400 border border-red-800">
                  {ev.severity}
                </span>
              </div>

              {ev.details?.plateNumber && (
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-yellow-400 text-slate-950 font-black font-mono text-[11px] shadow">
                  {ev.details.plateNumber}
                </div>
              )}

              <div className="absolute bottom-2 right-2">
                <button
                  onClick={() => setModalEvent(ev)}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900/80 hover:bg-rose-600 text-white text-[11px] font-medium backdrop-blur transition"
                >
                  <Eye className="w-3 h-3" />
                  <span>Inspect Frame</span>
                </button>
              </div>
            </div>

            {/* Event Details */}
            <div className="p-4 space-y-2 text-xs flex-1">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm text-white">{ev.type}</h4>
                <span className="text-cyan-400 font-mono font-bold">{ev.confidence}% Conf</span>
              </div>

              <div className="space-y-1 text-slate-400 text-[11px]">
                <div><strong className="text-slate-300">Location:</strong> {ev.locationName || 'Coimbatore Transit Corridor'}</div>
                <div><strong className="text-slate-300">GPS:</strong> {ev.latitude.toFixed(4)}, {ev.longitude.toFixed(4)}</div>
                <div><strong className="text-slate-300">Sensor:</strong> {ev.busId} ({ev.cameraId})</div>
                <div><strong className="text-slate-300">Time:</strong> {ev.timestamp}</div>
              </div>

              {/* ANPR + Incident details badge */}
              {ev.details?.plateNumber && (
                <div className="p-2 rounded bg-slate-950 border border-slate-800 space-y-1 text-[11px] font-mono">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="flex items-center gap-1"><CreditCard className="w-3 h-3 text-yellow-400" /> ANPR Plate:</span>
                    <strong className="text-yellow-300">{ev.details.plateNumber}</strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>OCR Conf:</span>
                    <span className="text-emerald-400">{ev.details.plateConfidence || 91}%</span>
                  </div>
                  {ev.details.speedRecorded && (
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-orange-400" /> Speed:</span>
                      <span className="text-orange-300 font-bold">{ev.details.speedRecorded} km/h</span>
                    </div>
                  )}
                  {ev.details.trackId !== undefined && (
                    <div className="flex items-center justify-between text-slate-400">
                      <span>ByteTrack ID:</span>
                      <span className="text-cyan-400">#{ev.details.trackId}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Action */}
            <div className="p-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-mono text-[11px]">Status: <strong className="text-white">{ev.status}</strong></span>

              <div className="flex items-center gap-1.5">
                {ev.status === 'NEW' && (
                  <button
                    onClick={() => handleStatusChange(ev.id, 'VERIFIED')}
                    className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold transition"
                  >
                    Confirm Alert
                  </button>
                )}
                {ev.status === 'VERIFIED' && (
                  <button
                    onClick={() => handleStatusChange(ev.id, 'ASSIGNED')}
                    className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold transition"
                  >
                    Forward Traffic Police
                  </button>
                )}
                {ev.status === 'ASSIGNED' && (
                  <button
                    onClick={() => handleStatusChange(ev.id, 'RESOLVED')}
                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition"
                  >
                    Mark Handled
                  </button>
                )}
                {ev.status === 'RESOLVED' && (
                  <span className="text-emerald-400 text-[11px] font-mono font-bold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Processed
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Frame Inspection Modal */}
      {modalEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="relative w-full max-w-3xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-rose-400 text-base">{modalEvent.id}</span>
                <span className="font-bold text-white text-base">- {modalEvent.type}</span>
              </div>
              <button
                onClick={() => setModalEvent(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-xl overflow-hidden border border-slate-800">
              <img
                src={modalEvent.evidence}
                alt={modalEvent.type}
                className="w-full h-auto object-contain max-h-[420px] bg-slate-950"
              />
            </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                <span className="text-slate-400 text-[10px] block flex items-center gap-1"><CreditCard className="w-3 h-3" /> PLATE REGISTRATION</span>
                <strong className="text-yellow-400 font-mono text-sm">
                  {modalEvent.details?.plateNumber || 'N/A'}
                </strong>
                {modalEvent.details?.plateConfidence && (
                  <span className="text-emerald-400 text-[10px] block mt-0.5">OCR Conf: {modalEvent.details.plateConfidence}%</span>
                )}
              </div>
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                <span className="text-slate-400 text-[10px] block flex items-center gap-1"><MapPin className="w-3 h-3" /> GPS COORDINATE</span>
                <strong className="text-white font-mono text-[11px]">
                  {modalEvent.latitude.toFixed(5)}, {modalEvent.longitude.toFixed(5)}
                </strong>
                {modalEvent.locationName && (
                  <span className="text-cyan-400 text-[10px] block mt-0.5 truncate">{modalEvent.locationName}</span>
                )}
              </div>
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                <span className="text-slate-400 text-[10px] block flex items-center gap-1"><Zap className="w-3 h-3" /> SPEED / TRACK ID</span>
                <strong className="text-orange-300 font-mono">
                  {modalEvent.details?.speedRecorded ? `${modalEvent.details.speedRecorded} km/h` : '—'}
                </strong>
                {modalEvent.details?.trackId !== undefined && (
                  <span className="text-cyan-400 text-[10px] block mt-0.5">ByteTrack #{modalEvent.details.trackId}</span>
                )}
              </div>
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                <span className="text-slate-400 text-[10px] block">STATUS</span>
                <strong className="text-emerald-400 font-mono">{modalEvent.status}</strong>
                <span className="text-slate-500 text-[10px] block mt-0.5">{modalEvent.assignedDepartment}</span>
              </div>
            </div>

            {/* Incident History Timeline */}
            {modalEvent.history && modalEvent.history.length > 0 && (
              <div className="mt-2 space-y-1">
                <h4 className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Incident Timeline</h4>
                {modalEvent.history.map((h: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] font-mono">
                    <span className="text-slate-500 shrink-0">{h.timestamp}</span>
                    <span className="text-slate-300">{h.action}</span>
                    <span className="text-slate-500 ml-auto shrink-0">[{h.by}]</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
