import React, { useEffect, useState } from 'react';
import {
  Bell,
  AlertTriangle,
  ShieldAlert,
  Wrench,
  CheckCircle2,
  Clock,
  Filter,
  FileText,
  Trash2,
  Building2,
  ExternalLink,
  MessageSquare
} from 'lucide-react';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { api } from '../services/api';
import { UrbanEvent, AlertStatus, Severity, DetectionCategory } from '../types';

export const AlertsPage: React.FC = () => {
  const [alerts, setAlerts] = useState<UrbanEvent[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [activeNoteModal, setActiveNoteModal] = useState<UrbanEvent | null>(null);
  const [noteText, setNoteText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    try {
      const data = await api.getEvents();
      setAlerts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (id: string, newStatus: AlertStatus) => {
    try {
      const updated = await api.updateEventStatus(id, newStatus);
      setAlerts((prev) => prev.map((a) => (a.id === id ? updated : a)));
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddNote = async () => {
    if (!activeNoteModal || !noteText.trim()) return;
    try {
      const updated = await api.updateEventStatus(
        activeNoteModal.id,
        activeNoteModal.status,
        noteText
      );
      setAlerts((prev) => prev.map((a) => (a.id === activeNoteModal.id ? updated : a)));
      setActiveNoteModal(null);
      setNoteText('');
    } catch (err) {
      console.error(err);
    }
  };

  const filtered = alerts.filter((a) => {
    if (selectedStatus !== 'ALL' && a.status !== selectedStatus) return false;
    if (selectedCategory !== 'ALL' && a.category !== selectedCategory) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <Breadcrumbs customTitle="Authority Alerts & Work-Orders" />

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-white tracking-tight">
              CENTRAL AUTHORITY ALERT MANAGEMENT
            </h1>

          </div>
          <p className="text-xs text-slate-400 mt-1">
            Triage, verify, and dispatch road defect tickets, traffic police summons, and municipal repair crews.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-amber-400">
            Pending Triage: <strong>{alerts.filter((a) => a.status === 'NEW').length}</strong>
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-emerald-400">
            Resolved: <strong>{alerts.filter((a) => a.status === 'RESOLVED').length}</strong>
          </span>
        </div>
      </div>

      {/* Filter Row */}
      <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400 font-medium">Category:</span>
          {['ALL', 'ROAD_HAZARD', 'TRAFFIC', 'SAFETY', 'INFRASTRUCTURE'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-lg font-mono text-xs transition ${
                selectedCategory === cat
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-700 font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {cat.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium">Status:</span>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-slate-900 text-slate-200 border border-slate-800 rounded-lg px-2.5 py-1 focus:outline-none focus:border-cyan-500 font-mono"
          >
            <option value="ALL">All Statuses</option>
            <option value="NEW">NEW</option>
            <option value="VERIFIED">VERIFIED</option>
            <option value="ASSIGNED">ASSIGNED</option>
            <option value="IN_PROGRESS">IN PROGRESS</option>
            <option value="RESOLVED">RESOLVED</option>
            <option value="DISMISSED">DISMISSED</option>
          </select>
        </div>
      </div>

      {/* Alerts Table */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 font-mono text-[10px] uppercase">
              <tr>
                <th className="py-3 px-4">Alert ID</th>
                <th className="py-3 px-4">Severity</th>
                <th className="py-3 px-4">Event Description</th>
                <th className="py-3 px-4">Source Bus</th>
                <th className="py-3 px-4">GPS / Location</th>
                <th className="py-3 px-4">Current Status</th>
                <th className="py-3 px-4 text-right">Authority Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filtered.map((alert) => (
                <tr key={alert.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-3 px-4 font-mono font-bold text-amber-400">{alert.id}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        alert.severity === 'CRITICAL' ? 'bg-red-950 text-red-400 border border-red-800' :
                        alert.severity === 'HIGH' ? 'bg-orange-950 text-orange-400 border border-orange-800' :
                        alert.severity === 'MEDIUM' ? 'bg-yellow-950 text-yellow-400 border border-yellow-800' :
                        'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {alert.severity}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-white">{alert.type}</div>
                    <div className="text-[11px] text-slate-400">Conf: {alert.confidence}%</div>
                    {alert.details?.notes && (
                      <div className="text-[10px] text-cyan-400 italic mt-0.5 max-w-xs truncate">
                        "{alert.details.notes}"
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-300">
                    <div>{alert.busId}</div>
                    <div className="text-[10px] text-slate-500">{alert.cameraId}</div>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                    <div>{alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)}</div>
                    <div className="text-[10px] text-slate-500 truncate max-w-[140px] font-sans">
                      {alert.locationName}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        alert.status === 'NEW' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                        alert.status === 'VERIFIED' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                        alert.status === 'ASSIGNED' ? 'bg-blue-950 text-blue-300 border border-blue-800' :
                        alert.status === 'IN_PROGRESS' ? 'bg-purple-950 text-purple-300 border border-purple-800' :
                        alert.status === 'RESOLVED' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                        'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {alert.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {alert.status === 'NEW' && (
                        <button
                          onClick={() => handleStatusUpdate(alert.id, 'VERIFIED')}
                          className="px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-[11px] transition"
                        >
                          Verify
                        </button>
                      )}

                      {alert.status === 'VERIFIED' && (
                        <button
                          onClick={() => handleStatusUpdate(alert.id, 'ASSIGNED')}
                          className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-[11px] transition"
                        >
                          Assign Dept
                        </button>
                      )}

                      {alert.status === 'ASSIGNED' && (
                        <button
                          onClick={() => handleStatusUpdate(alert.id, 'IN_PROGRESS')}
                          className="px-2 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium text-[11px] transition"
                        >
                          Start Work
                        </button>
                      )}

                      {alert.status === 'IN_PROGRESS' && (
                        <button
                          onClick={() => handleStatusUpdate(alert.id, 'RESOLVED')}
                          className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px] transition"
                        >
                          Resolve
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setActiveNoteModal(alert);
                          setNoteText(alert.details?.notes || '');
                        }}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                        title="Add Authority Notes"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleStatusUpdate(alert.id, 'DISMISSED')}
                        className="p-1 rounded bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 transition"
                        title="Dismiss (False Positive)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Authority Note Modal */}
      {activeNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-5 space-y-3">
            <h3 className="font-bold text-white text-sm">
              Add Authority Dispatch Notes ({activeNoteModal.id})
            </h3>
            <textarea
              rows={4}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="e.g. Assigned to PWD Road Crew Team 3 for emergency cold-mix patching within 24h..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setActiveNoteModal(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleAddNote}
                className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white"
              >
                Save Dispatch Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
