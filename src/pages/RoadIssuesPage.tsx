import React, { useEffect, useState } from 'react';
import {
  AlertOctagon,
  Layers,
  Filter,
  CheckCircle,
  Clock,
  MapPin,
  ExternalLink,
  ChevronRight,
  Eye,
  Camera,
  X,
  Search
} from 'lucide-react';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { api } from '../services/api';
import { UrbanEvent, ConsolidatedRoadIssue, Severity, AlertStatus } from '../types';

export const RoadIssuesPage: React.FC = () => {
  const [events, setEvents] = useState<UrbanEvent[]>([]);
  const [fusedIssues, setFusedIssues] = useState<ConsolidatedRoadIssue[]>([]);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [modalEvent, setModalEvent] = useState<UrbanEvent | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [allEvents, consolidated] = await Promise.all([
          api.getEvents({ category: 'ROAD_HAZARD' }),
          api.getRoadIssues()
        ]);
        setEvents(allEvents);
        setFusedIssues(consolidated);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleStatusChange = async (id: string, newStatus: AlertStatus) => {
    try {
      const updated = await api.updateEventStatus(id, newStatus);
      setEvents((prev) => prev.map((e) => (e.id === id ? updated : e)));
      if (modalEvent && modalEvent.id === id) {
        setModalEvent(updated);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredEvents = events.filter((e) => {
    if (selectedSeverity !== 'ALL' && e.severity !== selectedSeverity) return false;
    if (selectedType !== 'ALL' && !e.type.toLowerCase().includes(selectedType.toLowerCase())) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const match =
        e.id.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q) ||
        e.busId.toLowerCase().includes(q) ||
        (e.locationName && e.locationName.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <Breadcrumbs customTitle="Road Surface & Hazard Intelligence" />

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-white tracking-tight">
              ROAD HAZARD & DEFECT INTELLIGENCE
            </h1>

          </div>
          <p className="text-xs text-slate-400 mt-1">
            Automated detection of potholes, waterlogging, alligator cracking, and road wear collected continuously
            by bus camera edge inference.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-400">
            Total Road Defect Reports: <strong>{events.length}</strong>
          </span>
        </div>
      </div>

      {/* Multi-Bus Spatial Event Fusion Highlight Banner (Requirement 17) */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-slate-950 border border-cyan-500/40 shadow-xl">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold font-mono text-cyan-300 uppercase tracking-wider">
              MULTI-BUS EVENT FUSION & DUPLICATE DEDUPLICATION
            </h3>
          </div>
          <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 text-[10px] font-mono font-bold">
            PostGIS Proximity Match Active
          </span>
        </div>

        <p className="text-xs text-slate-300 mt-2 leading-relaxed">
          If multiple buses detect the same pothole within 85 meters on successive trips (e.g.{' '}
          <code className="text-cyan-400">BUS-101</code>, <code className="text-cyan-400">BUS-104</code>,{' '}
          <code className="text-cyan-400">BUS-107</code>), the system automatically clusters them into a single verified road issue.
          This eliminates redundant repair work-orders and increases machine confidence.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          {fusedIssues.map((issue) => (
            <div key={issue.id} className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-amber-400">{issue.id}</span>
                <span className="px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 font-mono font-bold text-[10px] border border-cyan-800">
                  {issue.sightingCount} Sightings
                </span>
              </div>
              <div className="font-semibold text-white">{issue.type}</div>
              <div className="text-[11px] text-slate-400 truncate">{issue.roadName}</div>
              <div className="text-[10px] text-emerald-400 font-medium">
                Confirmed by: {issue.reportingBuses.join(', ')}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by ID (e.g. RD-00127), road, or bus..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 text-slate-200 placeholder-slate-500 rounded-lg px-2.5 py-1.5 border border-slate-800 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Hazard Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-slate-900 text-slate-200 border border-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Hazard Types</option>
            <option value="Pothole">Potholes</option>
            <option value="Waterlogging">Waterlogging</option>
            <option value="Crack">Cracks & Damage</option>
            <option value="Missing">Missing Furniture/Signs</option>
          </select>

          {/* Severity Filter */}
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="bg-slate-900 text-slate-200 border border-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>

      {/* Road Issues Grid / Table */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEvents.map((ev) => {
          const isHigh = ev.severity === 'HIGH' || ev.severity === 'CRITICAL';

          return (
            <div
              key={ev.id}
              className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden flex flex-col justify-between hover:border-cyan-500/50 transition shadow-lg"
            >
              {/* Image Evidence Thumbnail */}
              <div className="relative aspect-video w-full bg-slate-950 border-b border-slate-800 overflow-hidden group">
                <img
                  src={ev.evidence}
                  alt={ev.type}
                  className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                />
                <div className="absolute top-2 left-2 flex items-center gap-1.5">
                  <span className="font-mono font-bold text-xs bg-slate-900/90 text-amber-400 px-2 py-0.5 rounded border border-slate-700">
                    {ev.id}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                      ev.severity === 'CRITICAL' ? 'bg-red-950 text-red-400 border border-red-800' :
                      ev.severity === 'HIGH' ? 'bg-orange-950 text-orange-400 border border-orange-800' :
                      'bg-yellow-950 text-yellow-400 border border-yellow-800'
                    }`}
                  >
                    {ev.severity}
                  </span>
                </div>

                <div className="absolute bottom-2 right-2">
                  <button
                    onClick={() => setModalEvent(ev)}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900/80 hover:bg-cyan-600 text-white text-[11px] font-medium backdrop-blur transition"
                  >
                    <Eye className="w-3 h-3" />
                    <span>Evidence Frame</span>
                  </button>
                </div>
              </div>

              {/* Details Body */}
              <div className="p-4 space-y-2 text-xs flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-white">{ev.type}</h4>
                  <span className="text-emerald-400 font-mono font-bold">{ev.confidence}% Conf</span>
                </div>

                <div className="space-y-1 text-slate-400 text-[11px]">
                  <div><strong className="text-slate-300">Location:</strong> {ev.locationName || 'Urban Transit Route'}</div>
                  <div><strong className="text-slate-300">GPS:</strong> {ev.latitude.toFixed(4)}, {ev.longitude.toFixed(4)}</div>
                  <div><strong className="text-slate-300">Detected By:</strong> {ev.busId} ({ev.cameraId})</div>
                  <div><strong className="text-slate-300">Time:</strong> {ev.timestamp}</div>
                </div>

                {ev.details?.observationsCount && ev.details.observationsCount > 1 && (
                  <div className="p-2 rounded bg-cyan-950/60 border border-cyan-800/80 text-cyan-300 text-[11px] font-semibold">
                    ✓ Confirmed by {ev.details.observationsCount} bus observations
                  </div>
                )}
              </div>

              {/* Card Footer: Authority Workflow Buttons */}
              <div className="p-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400 font-mono text-[11px]">Status: <strong className="text-white">{ev.status}</strong></span>

                <div className="flex items-center gap-1.5">
                  {ev.status === 'NEW' && (
                    <button
                      onClick={() => handleStatusChange(ev.id, 'VERIFIED')}
                      className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-semibold transition"
                    >
                      Verify
                    </button>
                  )}
                  {ev.status === 'VERIFIED' && (
                    <button
                      onClick={() => handleStatusChange(ev.id, 'ASSIGNED')}
                      className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold transition"
                    >
                      Assign PWD
                    </button>
                  )}
                  {ev.status === 'ASSIGNED' && (
                    <button
                      onClick={() => handleStatusChange(ev.id, 'IN_PROGRESS')}
                      className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition"
                    >
                      In Progress
                    </button>
                  )}
                  {ev.status === 'IN_PROGRESS' && (
                    <button
                      onClick={() => handleStatusChange(ev.id, 'RESOLVED')}
                      className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition"
                    >
                      Resolve
                    </button>
                  )}
                  {ev.status === 'RESOLVED' && (
                    <span className="text-emerald-400 text-[11px] font-mono font-bold flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Repaired
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Evidence Full-Frame Modal */}
      {modalEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="relative w-full max-w-3xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-amber-400 text-base">{modalEvent.id}</span>
                <span className="font-bold text-white text-base">- {modalEvent.type}</span>
                <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-400 text-xs font-mono font-bold">
                  PROTOTYPE / DEMO EVIDENCE
                </span>
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
                <span className="text-slate-400 text-[10px] block">REPORTING BUS</span>
                <strong className="text-cyan-400 font-mono">{modalEvent.busId}</strong>
              </div>
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                <span className="text-slate-400 text-[10px] block">CAMERA SENSOR</span>
                <strong className="text-white font-mono">{modalEvent.cameraId}</strong>
              </div>
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                <span className="text-slate-400 text-[10px] block">GPS COORDINATE</span>
                <strong className="text-amber-400 font-mono">
                  {modalEvent.latitude.toFixed(5)}, {modalEvent.longitude.toFixed(5)}
                </strong>
              </div>
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                <span className="text-slate-400 text-[10px] block">SEVERITY / STATUS</span>
                <strong className="text-white">{modalEvent.severity} ({modalEvent.status})</strong>
              </div>
            </div>

            {modalEvent.details?.notes && (
              <div className="p-3 rounded bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
                <strong className="text-slate-400 block mb-1">EDGE AI NOTES:</strong>
                {modalEvent.details.notes}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
