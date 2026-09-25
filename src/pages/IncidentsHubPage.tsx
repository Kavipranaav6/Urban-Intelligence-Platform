import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ShieldAlert,
  Layers,
  Wrench,
  CheckCircle2,
  Clock,
  Filter,
  Eye,
  Search,
  Building2,
  MessageSquare,
  Shield,
  Activity,
  MapPin,
  ExternalLink,
  X
} from 'lucide-react';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { api } from '../services/api';
import {
  UrbanEvent,
  AlertStatus,
  ConsolidatedRoadIssue,
  RoadConditionSegment
} from '../types';

export const IncidentsHubPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // URL Query Parameters
  const initialCategory = searchParams.get('category') || 'ALL';
  const initialStatus = searchParams.get('status') || 'ALL';

  const [activeCategory, setActiveCategory] = useState<string>(initialCategory);
  const [selectedStatus, setSelectedStatus] = useState<string>(initialStatus);
  const [subViolationFilter, setSubViolationFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Data states
  const [events, setEvents] = useState<UrbanEvent[]>([]);
  const [fusedRoadIssues, setFusedRoadIssues] = useState<ConsolidatedRoadIssue[]>([]);
  const [infrastructureData, setInfrastructureData] = useState<{
    roadSegments: RoadConditionSegment[];
    missingInfrastructure: UrbanEvent[];
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Modals
  const [modalEvent, setModalEvent] = useState<UrbanEvent | null>(null);
  const [activeNoteModal, setActiveNoteModal] = useState<UrbanEvent | null>(null);
  const [noteText, setNoteText] = useState<string>('');

  // Sync category param with URL
  useEffect(() => {
    const cat = searchParams.get('category');
    if (cat && cat !== activeCategory) {
      setActiveCategory(cat);
    }
  }, [searchParams]);

  useEffect(() => {
    async function loadAllData() {
      try {
        const [allEvents, roadIssues, infra] = await Promise.all([
          api.getEvents(),
          api.getRoadIssues(),
          api.getInfrastructure()
        ]);
        setEvents(allEvents);
        setFusedRoadIssues(roadIssues);
        setInfrastructureData(infra);
      } catch (err) {
        console.error('Failed to load incident hub data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadAllData();
  }, []);

  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    setSubViolationFilter('ALL');
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (cat === 'ALL') {
        p.delete('category');
      } else {
        p.set('category', cat);
      }
      return p;
    });
  };

  const handleStatusChange = async (id: string, newStatus: AlertStatus) => {
    try {
      const updated = await api.updateEventStatus(id, newStatus);
      setEvents((prev) => prev.map((ev) => (ev.id === id ? updated : ev)));
      if (modalEvent?.id === id) {
        setModalEvent(updated);
      }
    } catch (err) {
      console.error('Failed to update event status:', err);
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
      setEvents((prev) => prev.map((ev) => (ev.id === activeNoteModal.id ? updated : ev)));
      setActiveNoteModal(null);
      setNoteText('');
    } catch (err) {
      console.error('Failed to save dispatch note:', err);
    }
  };

  // Filtered Events
  const filteredEvents = events.filter((ev) => {
    // Category match
    if (activeCategory === 'ROAD_HAZARD') {
      if (ev.category !== 'ROAD_HAZARD') return false;
    } else if (activeCategory === 'SAFETY') {
      if (ev.category !== 'SAFETY' && ev.category !== 'ANPR') return false;
    } else if (activeCategory === 'INFRASTRUCTURE') {
      const isInfra =
        ev.category === 'INFRASTRUCTURE' ||
        ev.type.toLowerCase().includes('sign') ||
        ev.type.toLowerCase().includes('divider') ||
        ev.type.toLowerCase().includes('zebra') ||
        ev.type.toLowerCase().includes('missing');
      if (!isInfra) return false;
    }

    // Status filter
    if (selectedStatus !== 'ALL' && ev.status !== selectedStatus) {
      return false;
    }

    // Sub-violation filter for Safety
    if (activeCategory === 'SAFETY' && subViolationFilter !== 'ALL') {
      if (subViolationFilter === 'HIT_AND_RUN') {
        if (!ev.type.toLowerCase().includes('hit-and-run') && !ev.id.startsWith('HR-')) return false;
      } else if (subViolationFilter === 'RASH') {
        if (!ev.type.toLowerCase().includes('rash') && !ev.id.startsWith('SF-')) return false;
      } else if (!ev.type.toLowerCase().includes(subViolationFilter.toLowerCase())) {
        return false;
      }
    }

    // Search query
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchId = ev.id.toLowerCase().includes(q);
      const matchType = ev.type.toLowerCase().includes(q);
      const matchLoc = (ev.locationName || '').toLowerCase().includes(q);
      const matchBus = ev.busId.toLowerCase().includes(q);
      const matchPlate = (ev.details?.plateNumber || '').toLowerCase().includes(q);
      if (!matchId && !matchType && !matchLoc && !matchBus && !matchPlate) return false;
    }

    return true;
  });

  // KPI counts
  const totalRoadHazards = events.filter((e) => e.category === 'ROAD_HAZARD').length;
  const totalSafetyAlerts = events.filter((e) => e.category === 'SAFETY' || e.category === 'ANPR').length;
  const totalInfrastructure = events.filter(
    (e) =>
      e.category === 'INFRASTRUCTURE' ||
      e.type.toLowerCase().includes('sign') ||
      e.type.toLowerCase().includes('divider') ||
      e.type.toLowerCase().includes('zebra') ||
      e.type.toLowerCase().includes('missing')
  ).length;
  const pendingTriageCount = events.filter((e) => e.status === 'NEW').length;
  const resolvedCount = events.filter((e) => e.status === 'RESOLVED').length;

  return (
    <div className="space-y-6">
      <Breadcrumbs customTitle="Unified Incident & Hazard Hub" />

      {/* Main Hub Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold text-white tracking-tight">
              Incidents & Hazards Dispatch Hub
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/80 text-xs font-medium">
              Central Dispatch
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Single central dispatch hub consolidating automated road defect detections, pedestrian safety infractions,
            OCR license plate enforcement, and arterial infrastructure health.
          </p>
        </div>

        {/* Top 4 KPI Metrics */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
            <span className="text-slate-400 font-normal">Total: </span>
            <strong className="text-white font-semibold font-mono">{events.length}</strong>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-amber-400">
            <span className="text-slate-400 font-normal">Pending Triage: </span>
            <strong className="font-semibold font-mono">{pendingTriageCount}</strong>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-rose-400">
            <span className="text-slate-400 font-normal">Safety Alerts: </span>
            <strong className="font-semibold font-mono">{totalSafetyAlerts}</strong>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-emerald-400">
            <span className="text-slate-400 font-normal">Resolved: </span>
            <strong className="font-semibold font-mono">{resolvedCount}</strong>
          </div>
        </div>
      </div>

      {/* Primary Category Switcher Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2 rounded-xl bg-slate-900 border border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'ALL', label: `All Incidents (${events.length})`, icon: Filter },
            { id: 'ROAD_HAZARD', label: `Road Defects (${totalRoadHazards})`, icon: AlertTriangle },
            { id: 'SAFETY', label: `Safety & ANPR (${totalSafetyAlerts})`, icon: ShieldAlert },
            { id: 'INFRASTRUCTURE', label: `Infrastructure & Assets (${totalInfrastructure + (infrastructureData?.roadSegments?.length || 0)})`, icon: Building2 }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeCategory === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => handleCategoryChange(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                  isActive
                    ? 'bg-cyan-500 text-slate-950 shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search & Status Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 text-xs">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search ID, road, plate, or bus..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent text-slate-200 placeholder-slate-500 focus:outline-none w-48 text-xs font-sans"
            />
          </div>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-slate-950 text-slate-200 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="NEW">New</option>
            <option value="VERIFIED">Verified</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
        </div>
      </div>

      {/* Sub-Filters for Safety Category */}
      {activeCategory === 'SAFETY' && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
          <span className="text-slate-400 text-xs font-medium mr-1">Safety Sub-Classes:</span>
          {(['ALL', 'HIT_AND_RUN', 'RASH', 'Pedestrian', 'Overtake', 'Bus Lane'] as string[]).map((type) => {
            const labelMap: Record<string, string> = {
              ALL: 'All Safety',
              HIT_AND_RUN: 'Hit-and-Run',
              RASH: 'Rash Driving',
              Pedestrian: 'Pedestrian Near-Miss',
              Overtake: 'Dangerous Overtaking',
              'Bus Lane': 'Bus Lane Encroachment'
            };

            const isSelected = subViolationFilter === type;

            return (
              <button
                key={type}
                onClick={() => setSubViolationFilter(type)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition cursor-pointer ${
                  isSelected
                    ? 'bg-rose-950/90 text-rose-300 border-rose-600'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800'
                }`}
              >
                {labelMap[type] || type}
              </button>
            );
          })}
        </div>
      )}

      {/* Multi-Bus Spatial Event Deduplication Banner */}
      {(activeCategory === 'ALL' || activeCategory === 'ROAD_HAZARD') && fusedRoadIssues.length > 0 && (
        <div className="p-4 rounded-xl bg-slate-900 border border-cyan-800/50 shadow-md space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-200">
                Multi-Bus Spatial Deduplication Engine
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 text-xs font-medium">
              PostGIS Proximity Clustered
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Recurring defect detections within 85 meters recorded across separate buses are automatically consolidated into verified road hazard work-orders.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {fusedRoadIssues.map((issue) => (
              <div key={issue.id} className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-amber-400">{issue.id}</span>
                  <span className="px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 font-medium text-[11px] border border-cyan-800/60">
                    {issue.sightingCount} Sightings
                  </span>
                </div>
                <div className="font-semibold text-white truncate">{issue.type}</div>
                <div className="text-xs text-slate-400 truncate">{issue.roadName}</div>
                <div className="text-[11px] text-emerald-400 font-medium">
                  Buses: <span className="font-mono">{issue.reportingBuses.join(', ')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* REAL-DATA INFRASTRUCTURE HEALTH WIDGET (Folded into Hub) */}
      {(activeCategory === 'ALL' || activeCategory === 'INFRASTRUCTURE') && infrastructureData && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-200">
                Arterial Road Segment Health Ratings
              </h3>
            </div>
            <span className="text-xs text-cyan-400 font-medium">Telemetry Ground Truth</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {infrastructureData.roadSegments.map((seg) => {
              const badgeClass =
                seg.condition === 'CRITICAL'
                  ? 'bg-rose-950/80 text-rose-400 border-rose-800/80'
                  : seg.condition === 'POOR'
                  ? 'bg-amber-950/80 text-amber-400 border-amber-800/80'
                  : seg.condition === 'FAIR'
                  ? 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                  : 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80';

              return (
                <div key={seg.roadId} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-cyan-400">{seg.roadId}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${badgeClass}`}>
                      {seg.condition}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-white truncate" title={seg.roadName}>
                    {seg.roadName}
                  </h4>
                  <div className="text-xs text-slate-400 space-y-0.5">
                    <div>Defect Reports: <strong className="text-white font-mono">{seg.issueCount}</strong></div>
                    <div>Bus Sightings: <strong className="text-slate-300 font-mono">{seg.busSightings}</strong></div>
                    <div className="text-[11px] text-slate-500">Last Survey: {seg.lastSurveyed}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Incident Cards Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-200">
            Active Incidents & Citations ({filteredEvents.length})
          </span>
          <span className="text-xs text-slate-400 font-medium">
            Showing filtered incidents across transit lines
          </span>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="p-12 text-center rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-xs">
            No incidents found matching current filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEvents.map((ev) => {
              const isCritical = ev.severity === 'CRITICAL';
              const isHigh = ev.severity === 'HIGH';

              const severityBadge = isCritical
                ? 'bg-rose-950/80 text-rose-400 border-rose-800/80'
                : isHigh
                ? 'bg-amber-950/80 text-amber-400 border-amber-800/80'
                : 'bg-amber-950/60 text-amber-300 border-amber-800/60';

              return (
                <div
                  key={ev.id}
                  className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden flex flex-col justify-between hover:border-slate-700 transition shadow-sm"
                >
                  {/* Visual Evidence Snapshot */}
                  <div className="relative aspect-video w-full bg-slate-950 border-b border-slate-800 overflow-hidden group">
                    <img
                      src={ev.evidence}
                      alt={ev.type}
                      className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                    />

                    <div className="absolute top-2 left-2 flex items-center gap-1.5">
                      <span className="font-mono font-semibold text-xs bg-slate-900/90 text-amber-400 px-2 py-0.5 rounded border border-slate-700">
                        {ev.id}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${severityBadge}`}>
                        {ev.severity}
                      </span>
                    </div>

                    {/* ANPR Plate Badge */}
                    {ev.details?.plateNumber && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-yellow-400 text-slate-950 font-bold font-mono text-xs shadow">
                        {ev.details.plateNumber}
                      </div>
                    )}

                    <div className="absolute bottom-2 right-2">
                      <button
                        onClick={() => setModalEvent(ev)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900/90 hover:bg-cyan-600 hover:text-slate-950 text-white text-xs font-medium backdrop-blur transition cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect Frame</span>
                      </button>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-4 space-y-2 text-xs flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm text-white truncate max-w-[220px]">
                        {ev.type}
                      </h4>
                      <span className="text-emerald-400 font-mono font-semibold text-xs">{ev.confidence}% Conf</span>
                    </div>

                    <div className="space-y-1 text-slate-400 text-xs">
                      <div>
                        <span className="text-slate-300">Location:</span> {ev.locationName || 'Transit Corridor'}
                      </div>
                      <div>
                        <span className="text-slate-300">GPS:</span> <span className="font-mono text-slate-300">{ev.latitude.toFixed(4)}, {ev.longitude.toFixed(4)}</span>
                      </div>
                      <div>
                        <span className="text-slate-300">Detected By:</span> <span className="font-mono text-cyan-400">{ev.busId}</span> ({ev.cameraId})
                      </div>
                      <div>
                        <span className="text-slate-300">Time:</span> {ev.timestamp}
                      </div>
                      {ev.assignedDepartment && (
                        <div>
                          <span className="text-cyan-400 font-medium">Department:</span> {ev.assignedDepartment}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer: Authority Actions */}
                  <div className="p-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400 text-xs">
                      Status: <strong className="text-white font-medium">{ev.status}</strong>
                    </span>

                    <div className="flex items-center gap-1.5">
                      {ev.status === 'NEW' && (
                        <button
                          onClick={() => handleStatusChange(ev.id, 'VERIFIED')}
                          className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition cursor-pointer"
                        >
                          Verify
                        </button>
                      )}
                      {ev.status === 'VERIFIED' && (
                        <button
                          onClick={() => handleStatusChange(ev.id, 'ASSIGNED')}
                          className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition cursor-pointer"
                        >
                          Dispatch
                        </button>
                      )}
                      {ev.status === 'ASSIGNED' && (
                        <button
                          onClick={() => handleStatusChange(ev.id, 'RESOLVED')}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition cursor-pointer"
                        >
                          Resolve
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setActiveNoteModal(ev);
                          setNoteText(ev.assignedDepartment || '');
                        }}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                        title="Add Dispatch Note"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Frame Evidence Inspection Modal */}
      {modalEvent && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-amber-400">{modalEvent.id}</span>
                <span className="text-white font-semibold text-sm">— {modalEvent.type}</span>
              </div>
              <button
                onClick={() => setModalEvent(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="aspect-video w-full rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                <img src={modalEvent.evidence} alt={modalEvent.type} className="w-full h-full object-cover" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-xs">Severity</span>
                  <strong className="text-rose-400 font-semibold">{modalEvent.severity}</strong>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-xs">Confidence</span>
                  <strong className="text-emerald-400 font-mono font-semibold">{modalEvent.confidence}%</strong>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-xs">Source Bus</span>
                  <strong className="text-cyan-400 font-mono font-semibold">{modalEvent.busId}</strong>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-xs">Status</span>
                  <strong className="text-white font-semibold">{modalEvent.status}</strong>
                </div>
              </div>

              {/* ANPR OCR Details */}
              {modalEvent.details?.plateNumber && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-xs font-medium">Vehicle Registration (ANPR OCR):</span>
                    <span className="px-2 py-0.5 rounded bg-yellow-400 text-slate-950 font-bold font-mono text-xs">
                      {modalEvent.details.plateNumber}
                    </span>
                  </div>
                  <div className="text-slate-400 text-xs leading-relaxed">
                    {modalEvent.details.notes || 'Recorded via edge trajectory tracking and optical character recognition.'}
                  </div>
                </div>
              )}

              {/* Status Update Trigger in Modal */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                <span className="text-slate-400 text-xs">Change Status:</span>
                <div className="flex items-center gap-1.5">
                  {(['NEW', 'VERIFIED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'] as AlertStatus[]).map((st) => (
                    <button
                      key={st}
                      onClick={() => handleStatusChange(modalEvent.id, st)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                        modalEvent.status === st
                          ? 'bg-cyan-500 text-slate-950 font-semibold'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Note / Dispatch Modal */}
      {activeNoteModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm">Assign Department & Work-Order</h3>
              <button onClick={() => setActiveNoteModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <label className="text-slate-300 font-medium">Department / Action Details:</label>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="e.g. Assigned to PWD Road Repair Division Unit 4..."
                className="w-full h-24 p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500 font-sans"
              />
            </div>
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setActiveNoteModal(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleAddNote}
                className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
              >
                Save Assignment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
