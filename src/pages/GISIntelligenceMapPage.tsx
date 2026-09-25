import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Layers,
  MapPin,
  Eye,
  AlertTriangle,
  Bus as BusIcon,
  Flame,
  ShieldAlert,
  Camera,
  Wrench,
  X,
  Search,
  Satellite,
  Map as MapIcon,
  Moon,
  RefreshCw,
  Activity,
  Navigation,
  Zap,
  Radio,
} from 'lucide-react';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { GISMap } from '../components/GISMap';
import { api } from '../services/api';
import { useApp } from '../context/AppContext';
import { UrbanEvent, Bus } from '../types';

type TileLayerKey = 'street' | 'satellite' | 'osm' | 'dark';

const TILE_OPTIONS: { key: TileLayerKey; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { key: 'street',    label: 'Real Street', Icon: MapIcon   },
  { key: 'satellite', label: 'Satellite',   Icon: Satellite },
  { key: 'osm',       label: 'OpenStreet',  Icon: Navigation },
  { key: 'dark',      label: 'Dark',        Icon: Moon      },
];

export const GISIntelligenceMapPage: React.FC = () => {
  const { buses } = useApp();

  const [events,         setEvents]         = useState<UrbanEvent[]>([]);
  const [selectedEvent,  setSelectedEvent]  = useState<UrbanEvent | null>(null);
  const [selectedBus,    setSelectedBus]    = useState<Bus | null>(null);
  const [showHeatmap,    setShowHeatmap]    = useState(true);
  const [tileLayer,      setTileLayer]      = useState<TileLayerKey>('street');
  const [searchQuery,    setSearchQuery]    = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [isRefreshing,   setIsRefreshing]   = useState(false);
  const [mapCenter,      setMapCenter]      = useState<[number, number]>([11.0168, 76.97]);
  const [mapZoom,        setMapZoom]        = useState(13);

  const [layers, setLayers] = useState({
    buses:          true,
    roadIssues:     true,
    traffic:        true,
    safety:         true,
    anpr:           true,
    infrastructure: true,
  });

  // ── Fetch events ──
  const fetchEvents = useCallback(() => {
    setIsRefreshing(true);
    api.getEvents()
      .then(setEvents)
      .catch(console.error)
      .finally(() => setIsRefreshing(false));
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // ── Auto-refresh every 20 seconds ──
  useEffect(() => {
    const timer = setInterval(fetchEvents, 20_000);
    return () => clearInterval(timer);
  }, [fetchEvents]);

  // ── Filtered events ──
  const filteredEvents = events.filter((e) => {
    if (severityFilter !== 'ALL' && e.severity !== severityFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        e.type.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q)   ||
        e.busId.toLowerCase().includes(q) ||
        (e.locationName ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // ── Focus on bus ──
  const focusBus = (bus: Bus) => {
    setSelectedBus(bus);
    setSelectedEvent(null);
    setMapCenter([bus.lat, bus.lng]);
    setMapZoom(15);
  };

  // ── Focus on event ──
  const focusEvent = (ev: UrbanEvent) => {
    setSelectedEvent(ev);
    setSelectedBus(null);
    setMapCenter([ev.latitude, ev.longitude]);
    setMapZoom(16);
  };

  // ── Survey events (from uploaded video & GPS CSV) ──
  const surveyEvents = events.filter(
    (e) =>
      e.cameraId === 'CAM-UPLOAD-FEED' ||
      e.category === 'ANPR' ||
      (e.locationName && (e.locationName.includes('Telemetry') || e.locationName.includes('Survey') || e.locationName.includes('Uploaded')))
  );

  const focusSurvey = () => {
    if (surveyEvents.length > 0) {
      setSelectedBus(null);
      setSelectedEvent(surveyEvents[0]);
      setMapCenter([surveyEvents[0].latitude, surveyEvents[0].longitude]);
      setMapZoom(16);
    }
  };

  // Automatically center on survey route when survey events exist (e.g. Pollachi GPS CSV)
  const hasAutoCenteredSurvey = useRef(false);
  useEffect(() => {
    if (!hasAutoCenteredSurvey.current && surveyEvents.length > 0) {
      hasAutoCenteredSurvey.current = true;
      setMapCenter([surveyEvents[0].latitude, surveyEvents[0].longitude]);
      setMapZoom(15);
    }
  }, [surveyEvents]);

  // ── Stats ──
  const critical = events.filter((e) => e.severity === 'CRITICAL').length;
  const high     = events.filter((e) => e.severity === 'HIGH').length;
  const moving   = buses.filter((b) => b.speed > 0).length;

  return (
    <div className="space-y-3">
      <Breadcrumbs customTitle="GIS Command & Geospatial Intelligence" />

      {/* ── Top control bar ── */}
      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">

        {/* Left: Title + stats */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-white text-xs">
              Centralized GIS Authority Map
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" />
              {moving} Live Buses
            </span>
            {critical > 0 && (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-800/80 text-xs font-medium">
                <AlertTriangle className="w-3 h-3" />
                {critical} Critical
              </span>
            )}
            {high > 0 && (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/80 text-xs font-medium">
                {high} High
              </span>
            )}
            {surveyEvents.length > 0 && (
              <button
                type="button"
                onClick={focusSurvey}
                className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-yellow-400 text-slate-950 font-semibold text-xs hover:bg-yellow-300 transition shadow-sm cursor-pointer"
                title="Pan directly to the uploaded video GPS survey area and ANPR pins"
              >
                <MapPin className="w-3 h-3" />
                <span>Survey Route ({surveyEvents.length} pins)</span>
              </button>
            )}
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex flex-wrap items-center gap-2">

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search events..."
              className="pl-6 pr-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-600 text-xs focus:outline-none focus:border-cyan-500 w-40"
            />
          </div>

          {/* Severity filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs focus:outline-none focus:border-cyan-500"
          >
            {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Tile layer switcher */}
          <div className="flex rounded-lg overflow-hidden border border-slate-700">
            {TILE_OPTIONS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setTileLayer(key)}
                title={`Switch to ${label} map`}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-mono transition-all ${
                  tileLayer === key
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>

          {/* Layer toggles */}
          {[
            { key: 'buses',          Icon: BusIcon,       label: 'Buses',   colour: 'cyan'    },
            { key: 'roadIssues',     Icon: AlertTriangle, label: 'Hazards', colour: 'orange'  },
            { key: 'safety',         Icon: ShieldAlert,   label: 'Safety',  colour: 'rose'    },
            { key: 'anpr',           Icon: Camera,        label: 'ANPR',    colour: 'emerald' },
            { key: 'infrastructure', Icon: Wrench,        label: 'Infra',   colour: 'blue'    },
          ].map(({ key, Icon, label, colour }) => (
            <button
              key={key}
              onClick={() => setLayers({ ...layers, [key]: !layers[key as keyof typeof layers] })}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border font-mono transition text-[11px] ${
                layers[key as keyof typeof layers]
                  ? `bg-${colour}-950 text-${colour}-300 border-${colour}-700`
                  : 'bg-slate-950 text-slate-500 border-slate-800'
              }`}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}

          {/* Heatmap toggle */}
          <button
            onClick={() => setShowHeatmap(!showHeatmap)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border font-mono transition text-[11px] ${
              showHeatmap ? 'bg-red-950 text-red-300 border-red-700' : 'bg-slate-950 text-slate-500 border-slate-800'
            }`}
          >
            <Flame className="w-3 h-3" />
            Heatmap
          </button>

          {/* Refresh */}
          <button
            onClick={fetchEvents}
            disabled={isRefreshing}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition text-[11px] font-mono disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Main map + sidebars ── */}
      <div className="flex gap-3" style={{ height: 660 }}>

        {/* ── Left sidebar: Bus Fleet ── */}
        <div className="w-56 flex-shrink-0 flex flex-col gap-2 overflow-hidden">
          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
            <div className="flex items-center gap-1.5 mb-2.5">
              <BusIcon className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-mono font-bold text-[10px] uppercase tracking-widest text-slate-400">Fleet Tracker</span>
            </div>
            <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: 590 }}>
              {buses.map((bus) => {
                const isSelected = selectedBus?.id === bus.id;
                const statusColour =
                  bus.aiStatus === 'ACTIVE'   ? '#22c55e' :
                  bus.aiStatus === 'STANDBY'  ? '#eab308' : '#ef4444';

                return (
                  <button
                    key={bus.id}
                    onClick={() => focusBus(bus)}
                    className={`text-left p-2 rounded-lg border transition-all text-xs group ${
                      isSelected
                        ? 'bg-cyan-950 border-cyan-700 text-cyan-200'
                        : 'bg-slate-800/60 border-slate-700/50 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono font-bold text-[11px]" style={{ color: isSelected ? '#7dd3fc' : '#38bdf8' }}>
                        {bus.id}
                      </span>
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: statusColour }} />
                        <span className="text-[9px] font-mono" style={{ color: statusColour }}>{bus.aiStatus}</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">{bus.routeName.split(' - ')[1]}</div>
                    <div className="flex items-center gap-2 mt-1 text-[10px]">
                      <span className="flex items-center gap-0.5">
                        <Navigation className="w-2.5 h-2.5" style={{ color: bus.speed > 0 ? '#22c55e' : '#64748b' }} />
                        {bus.speed} km/h
                      </span>
                      <span className="text-slate-500">{bus.direction}</span>
                    </div>
                    {bus.passengers && (
                      <div className="text-[9px] text-slate-500 mt-0.5">👥 {bus.passengers} passengers</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Main Map ── */}
        <div className="relative flex-1 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
          <GISMap
            buses={buses}
            events={filteredEvents}
            selectedBusId={selectedBus?.id}
            selectedEventId={selectedEvent?.id}
            onSelectBus={focusBus}
            onSelectEvent={focusEvent}
            showHeatmap={showHeatmap}
            activeLayers={layers}
            center={mapCenter}
            zoom={mapZoom}
            height="100%"
            tileLayer={tileLayer}
            autoFitBounds={surveyEvents.length > 0}
          />

          {/* ── Selected Bus flyout ── */}
          {selectedBus && (
            <div className="absolute top-4 left-4 z-[600] w-72 rounded-xl bg-slate-900/95 backdrop-blur-md border border-cyan-500/40 shadow-2xl p-4 text-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <BusIcon className="w-4 h-4 text-cyan-400" />
                  <span className="font-mono font-bold text-cyan-400">{selectedBus.id}</span>
                  <span className="font-semibold text-white">{selectedBus.routeName.split(' - ')[1]}</span>
                </div>
                <button onClick={() => setSelectedBus(null)} className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {[
                  { l: 'Speed',    v: `${selectedBus.speed} km/h` },
                  { l: 'Direction', v: selectedBus.direction },
                  { l: 'GPS',       v: selectedBus.gpsStatus },
                  { l: 'Network',   v: selectedBus.networkStatus.replace('_', ' ') },
                  { l: 'Cameras',   v: selectedBus.cameraStatus.replace(/_/g, ' ') },
                  { l: 'Edge AI',   v: selectedBus.aiStatus },
                  { l: 'Driver',    v: selectedBus.driver ?? 'N/A' },
                  { l: 'Passengers', v: selectedBus.passengers?.toString() ?? '—' },
                ].map(({ l, v }) => (
                  <div key={l}>
                    <div className="text-slate-500">{l}</div>
                    <div className="text-white font-semibold">{v}</div>
                  </div>
                ))}
              </div>
              <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-800">
                GPS {selectedBus.lat.toFixed(5)}, {selectedBus.lng.toFixed(5)} · Ping {selectedBus.lastPing}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    window.location.hash = '';
                    window.location.href = `/cameras?busId=${selectedBus.id}&cameraId=${selectedBus.cameras[0]?.id}`;
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-[11px] transition"
                >
                  📷 View Camera Feed
                </button>
              </div>
            </div>
          )}

          {/* ── Selected Event flyout ── */}
          {selectedEvent && (
            <div className="absolute top-4 left-4 z-[600] w-80 rounded-xl bg-slate-900/95 backdrop-blur-md border border-cyan-500/50 shadow-2xl p-4 text-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-amber-400">{selectedEvent.id}</span>
                  <span className="font-bold text-white">{selectedEvent.type}</span>
                </div>
                <button onClick={() => setSelectedEvent(null)} className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="aspect-video w-full rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
                <img src={selectedEvent.evidence} alt={selectedEvent.type} className="w-full h-full object-cover" />
              </div>

              <div className="space-y-1 text-slate-300 font-mono text-[11px]">
                <div><strong className="text-slate-400">Category:</strong> {selectedEvent.category}</div>
                <div><strong className="text-slate-400">Severity:</strong>{' '}
                  <span className={`font-bold ${
                    selectedEvent.severity === 'CRITICAL' ? 'text-red-400' :
                    selectedEvent.severity === 'HIGH'     ? 'text-orange-400' :
                    selectedEvent.severity === 'MEDIUM'   ? 'text-yellow-400' : 'text-cyan-400'
                  }`}>{selectedEvent.severity}</span>
                </div>
                <div><strong className="text-slate-400">Confidence:</strong> {selectedEvent.confidence}%</div>
                <div><strong className="text-slate-400">Reporting Bus:</strong> {selectedEvent.busId} ({selectedEvent.cameraId})</div>
                <div><strong className="text-slate-400">GPS:</strong> {selectedEvent.latitude.toFixed(5)}, {selectedEvent.longitude.toFixed(5)}</div>
                <div><strong className="text-slate-400">Time:</strong> {selectedEvent.timestamp}</div>
                {selectedEvent.details?.plateNumber && (
                  <div className="text-amber-300">ANPR: {selectedEvent.details.plateNumber}</div>
                )}
                {selectedEvent.details?.observationsCount && selectedEvent.details.observationsCount > 1 && (
                  <div className="px-2 py-1 rounded bg-cyan-950/80 text-cyan-300 text-[10px] border border-cyan-800/60">
                    ✓ Confirmed by {selectedEvent.details.observationsCount} bus observations
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <span className="text-slate-400 text-[10px]">Status: {selectedEvent.status}</span>
                <button
                  onClick={() => {
                    api.updateEventStatus(selectedEvent.id, 'VERIFIED').then((updated) => {
                      setSelectedEvent(updated);
                      setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
                    });
                  }}
                  className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-[11px] transition"
                >
                  ✓ Verify Event
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right sidebar: Live Event Feed ── */}
        <div className="w-60 flex-shrink-0 flex flex-col gap-2 overflow-hidden">
          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-mono font-bold text-[10px] uppercase tracking-widest text-slate-400">Live Event Feed</span>
              </div>
              <span className="text-[9px] font-mono text-slate-600">{filteredEvents.length} events</span>
            </div>

            <div className="flex flex-col gap-1.5 overflow-y-auto flex-1">
              {filteredEvents.slice(0, 30).map((ev) => {
                const isSelected = ev.id === selectedEvent?.id;
                const severityColour =
                  ev.severity === 'CRITICAL' ? '#ef4444' :
                  ev.severity === 'HIGH'     ? '#f97316' :
                  ev.severity === 'MEDIUM'   ? '#eab308' : '#06b6d4';

                return (
                  <button
                    key={ev.id}
                    onClick={() => focusEvent(ev)}
                    className={`text-left p-2 rounded-lg border transition-all group ${
                      isSelected
                        ? 'bg-amber-950/60 border-amber-700/70 text-amber-200'
                        : 'bg-slate-800/50 border-slate-700/40 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[9px]" style={{ color: severityColour }}>
                        {ev.severity}
                      </span>
                      <span className="font-mono text-[9px] text-slate-600">{ev.busId}</span>
                    </div>
                    <div className="text-[10px] font-semibold text-white truncate">{ev.type}</div>
                    <div className="text-[9px] text-slate-500 truncate">{ev.locationName ?? ev.category}</div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[9px] text-slate-600">{ev.confidence}% conf.</span>
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: severityColour, boxShadow: `0 0 4px ${severityColour}88` }}
                      />
                    </div>
                  </button>
                );
              })}
              {filteredEvents.length === 0 && (
                <div className="text-center py-8 text-slate-600 text-xs">
                  <MapPin className="w-6 h-6 mx-auto mb-2 opacity-30" />
                  No events match filter
                </div>
              )}
            </div>
          </div>

          {/* ── Mini stats ── */}
          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
            <div className="font-mono font-bold text-[9px] uppercase tracking-widest text-slate-600 mb-1.5">City Summary</div>
            {[
              { label: 'Total Events', value: events.length, colour: '#94a3b8' },
              { label: 'Critical',     value: critical,       colour: '#ef4444' },
              { label: 'High',         value: high,           colour: '#f97316' },
              { label: 'Buses Active', value: moving,         colour: '#22c55e' },
            ].map(({ label, value, colour }) => (
              <div key={label} className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">{label}</span>
                <span className="font-mono font-bold" style={{ color: colour }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
