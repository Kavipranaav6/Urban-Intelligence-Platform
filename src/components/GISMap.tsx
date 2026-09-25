import React, { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import { Bus, UrbanEvent, ConsolidatedRoadIssue } from '../types';

// Fix Leaflet default icon paths broken by bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface GISMapProps {
  buses?: Bus[];
  events?: UrbanEvent[];
  roadIssues?: ConsolidatedRoadIssue[];
  selectedBusId?: string;
  selectedEventId?: string;
  onSelectBus?: (bus: Bus) => void;
  onSelectEvent?: (event: UrbanEvent) => void;
  showHeatmap?: boolean;
  activeLayers?: {
    roadIssues: boolean;
    traffic: boolean;
    safety: boolean;
    infrastructure: boolean;
    buses: boolean;
  };
  center?: [number, number];
  zoom?: number;
  height?: string;
  tileLayer?: 'street' | 'satellite' | 'osm' | 'topo' | 'dark';
  autoFitBounds?: boolean;
  // Congestion-coloured routes from multi-video dashboard
  congestionRoutes?: Array<{
    busId: string;
    waypoints: [number, number][];
    congestionLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    routeName: string;
    densityScore: number;
  }>;
}

// ─── Colour helpers ───────────────────────────────────────────────────────────
const CONGESTION_COLOURS: Record<string, string> = {
  LOW:      '#16a34a',
  MEDIUM:   '#d97706',
  HIGH:     '#ea580c',
  CRITICAL: '#dc2626',
};

const SEVERITY_COLOURS: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#eab308',
  LOW:      '#06b6d4',
};

const CATEGORY_ICON: Record<string, string> = {
  ROAD_HAZARD:    '\uD83D\uDD73',
  TRAFFIC:        '\uD83D\uDEA6',
  SAFETY:         '\uD83D\uDEE1',
  INFRASTRUCTURE: '\uD83D\uDD27',
  ANPR:           '\uD83D\uDCF7',
};

export const TILE_LAYERS: Record<string, {
  name: string;
  url: string;
  subdomains: string;
  maxZoom: number;
  attribution: string;
  fallbackUrl?: string;
}> = {
  street: {
    name: 'Real Street Map',
    url: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    subdomains: '0123',
    maxZoom: 20,
    attribution: '\u00a9 Google Maps \u00b7 Real Street Map',
    fallbackUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  },
  satellite: {
    name: 'Real Satellite (Hybrid)',
    url: 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    subdomains: '0123',
    maxZoom: 20,
    attribution: '\u00a9 Google Satellite \u00b7 High-Res Imagery',
    fallbackUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  },
  osm: {
    name: 'OpenStreetMap Standard',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    maxZoom: 19,
    attribution: '\u00a9 OpenStreetMap contributors',
  },
  topo: {
    name: 'Terrain / Topographic',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    subdomains: '',
    maxZoom: 19,
    attribution: '\u00a9 Esri \u00b7 USGS Topo',
  },
  dark: {
    name: 'Tactical Dark',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    subdomains: '',
    maxZoom: 16,
    attribution: '\u00a9 Esri Canvas Tactical',
  },
};

// ─── Bus SVG marker factory ───────────────────────────────────────────────────
function buildBusMarkerHtml(bus: Bus, isSelected: boolean): string {
  const speed  = Math.round(bus.speed);
  const online = bus.cameraStatus === 'ALL_ONLINE';
  const moving = bus.speed > 0;

  const ring    = moving    ? `<div style="position:absolute;inset:-6px;border-radius:50%;background:rgba(56,189,248,0.25);animation:busping 1.8s ease-out infinite;pointer-events:none;"></div>` : '';
  const selRing = isSelected ? `<div style="position:absolute;inset:-3px;border-radius:6px;border:2px solid #38bdf8;animation:busping 1.4s ease-out infinite;pointer-events:none;"></div>` : '';

  return `
<div style="position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer;">
  ${ring}${selRing}
  <div style="
    display:flex;align-items:center;gap:4px;
    padding:3px 7px;border-radius:5px;
    font:700 11px/1.3 monospace;
    letter-spacing:0.04em;
    box-shadow:0 4px 14px rgba(0,0,0,0.6);
    background:${isSelected ? '#38bdf8' : 'rgba(15,23,42,0.94)'};
    color:${isSelected ? '#0f172a' : '#38bdf8'};
    border:1.5px solid ${isSelected ? '#e0f2fe' : 'rgba(56,189,248,0.4)'};
  ">
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <rect x="3" y="3" width="18" height="18" rx="4"/>
      <path d="M7 8h10"/>
      <circle cx="7" cy="16" r="1.5"/>
      <circle cx="17" cy="16" r="1.5"/>
    </svg>
    ${bus.id}
    <span style="font-size:9px;opacity:0.75;">${speed}km/h</span>
    <span style="width:5px;height:5px;border-radius:50%;background:${online ? '#22c55e' : '#f97316'};flex-shrink:0;"></span>
  </div>
</div>`;
}

// ─── Event marker factory ─────────────────────────────────────────────────────
function buildEventMarkerHtml(ev: UrbanEvent, isSelected: boolean): string {
  const colour = SEVERITY_COLOURS[ev.severity] ?? '#eab308';
  const icon   = CATEGORY_ICON[ev.category]   ?? '\u26A0';
  const pulse  = isSelected
    ? `<div style="position:absolute;inset:-4px;border-radius:50%;background:${colour}44;animation:busping 1.2s ease-out infinite;"></div>`
    : '';

  return `
<div style="position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer;">
  ${pulse}
  <div style="
    width:28px;height:28px;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    font-size:13px;
    background:rgba(15,23,42,0.92);
    border:2px solid ${colour};
    box-shadow:0 2px 8px rgba(0,0,0,0.5), 0 0 10px ${colour}88;
    ${isSelected ? `outline:3px solid ${colour};outline-offset:2px;` : ''}
  ">${icon}</div>
</div>`;
}

// ─── Popup templates ──────────────────────────────────────────────────────────
function buildBusPopup(bus: Bus): string {
  const netColour =
    bus.networkStatus === 'ONLINE_5G' ? '#22c55e' :
    bus.networkStatus === 'ONLINE_4G' ? '#eab308' : '#ef4444';

  return `
<div style="background:#0f172a;color:#f1f5f9;font:13px/1.5 system-ui,sans-serif;padding:14px 16px;width:270px;border-radius:8px;">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.08);">
    <span style="font:700 13px monospace;color:#38bdf8;">${bus.id}</span>
    <span style="font:600 10px monospace;background:#0c4a6e;color:#7dd3fc;padding:2px 7px;border-radius:4px;">MOBILE EDGE UNIT</span>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;color:#94a3b8;">
    <span>\uD83D\uDEE3 <b style="color:#e2e8f0;">${(bus.routeName.split(' - ')[1] || bus.routeName).slice(0, 22)}</b></span>
    <span>\uD83D\uDE80 <b style="color:#e2e8f0;">${bus.speed} km/h ${bus.direction}</b></span>
    <span>\uD83D\uDCE1 <b style="color:${netColour};">${bus.networkStatus.replace('_', ' ')}</b></span>
    <span>\uD83D\uDEF0 <b style="color:#22c55e;">${bus.gpsStatus}</b></span>
    <span>\uD83D\uDC64 Driver: <b style="color:#e2e8f0;">${bus.driver ?? 'N/A'}</b></span>
    <span>\uD83D\uDC65 PAX: <b style="color:#e2e8f0;">${bus.passengers ?? '--'}</b></span>
    <span>\uD83D\uDCF7 Cams: <b style="color:${bus.cameraStatus === 'ALL_ONLINE' ? '#22c55e' : '#f97316'};">${bus.cameraStatus.replace(/_/g, ' ')}</b></span>
    <span>\u26A1 Edge AI: <b style="color:#22c55e;">${bus.aiStatus}</b></span>
  </div>
  <div style="margin-top:8px;font:10px monospace;color:#475569;">
    GPS ${bus.lat.toFixed(5)}, ${bus.lng.toFixed(5)} \u00b7 Ping ${bus.lastPing}
  </div>
</div>`;
}

function buildEventPopup(ev: UrbanEvent): string {
  const colour  = SEVERITY_COLOURS[ev.severity] ?? '#eab308';
  const catIcon = CATEGORY_ICON[ev.category]    ?? '\u26A0';
  const obsNote = ev.details?.observationsCount && ev.details.observationsCount > 1
    ? `<div style="margin-top:4px;padding:4px 7px;background:#164e63;border-radius:4px;color:#7dd3fc;font-size:10px;">\u2713 Confirmed by ${ev.details.observationsCount} buses</div>`
    : '';
  const plateNote = ev.details?.plateNumber
    ? `<div style="margin-top:4px;padding:4px 7px;background:#1e1b4b;border-radius:4px;color:#facc15;font-size:11px;font-family:monospace;font-weight:bold;border:1px solid #4338ca;">ANPR: ${ev.details.plateNumber} (${ev.confidence}% conf)</div>`
    : '';
  const evidenceImg = ev.evidence
    ? `<div style="margin-top:8px;border-radius:6px;overflow:hidden;border:1px solid rgba(255,255,255,0.15);max-height:120px;background:#020617;display:flex;align-items:center;justify-content:center;">
        <img src="${ev.evidence}" style="width:100%;max-height:120px;object-fit:cover;" alt="Evidence" />
       </div>`
    : '';

  return `
<div style="background:#0f172a;color:#f1f5f9;font:13px/1.5 system-ui,sans-serif;padding:14px 16px;width:280px;border-radius:8px;">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.08);">
    <span style="font:700 12px monospace;color:#fbbf24;">${ev.id}</span>
    <span style="font:700 10px monospace;background:${colour}22;color:${colour};padding:2px 7px;border-radius:4px;border:1px solid ${colour}55;">${ev.severity}</span>
  </div>
  <div style="font:600 14px sans-serif;color:#fff;margin-bottom:6px;">${catIcon} ${ev.type}</div>
  <div style="font-size:11px;color:#94a3b8;display:grid;gap:4px;">
    <span>\uD83C\uDFAF Confidence: <b style="color:#e2e8f0;">${ev.confidence}%</b></span>
    <span>\uD83D\uDE8C Reported by: <b style="color:#38bdf8;">${ev.busId}</b> (${ev.cameraId})</span>
    <span>\uD83D\uDDD3 ${ev.timestamp}</span>
    <span>\uD83D\uDCCD ${ev.locationName ?? `${ev.latitude.toFixed(4)}, ${ev.longitude.toFixed(4)}`}</span>
    ${obsNote}${plateNote}
  </div>
  ${evidenceImg}
  <div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.07);font:10px monospace;color:#475569;">
    Status: ${ev.status} \u00b7 ${ev.assignedDepartment ?? 'Unassigned'}
  </div>
</div>`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export const GISMap: React.FC<GISMapProps> = ({
  buses = [],
  events = [],
  roadIssues = [],
  selectedBusId,
  selectedEventId,
  onSelectBus,
  onSelectEvent,
  showHeatmap = false,
  activeLayers = { roadIssues: true, traffic: true, safety: true, infrastructure: true, buses: true },
  center = [11.0168, 76.97],
  zoom = 13,
  height = '100%',
  tileLayer: tileLayerKey = 'street',
  autoFitBounds = false,
  congestionRoutes = [],
}) => {
  const [activeLayerKey, setActiveLayerKey] = React.useState<string>(tileLayerKey || 'street');

  useEffect(() => {
    if (tileLayerKey) setActiveLayerKey(tileLayerKey);
  }, [tileLayerKey]);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef  = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routesLayerRef  = useRef<L.LayerGroup | null>(null);
  const heatmapLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef    = useRef<L.TileLayer | null>(null);
  const busMarkersRef   = useRef<Map<string, L.Marker>>(new Map());
  const busAnimRef      = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // ── Survey events filter ──
  const surveyEvents = events.filter(
    (e) =>
      e.cameraId === 'CAM-UPLOAD-FEED' ||
      e.category === 'ANPR' ||
      (e.locationName && (e.locationName.includes('Telemetry') || e.locationName.includes('Survey') || e.locationName.includes('Uploaded')))
  );

  // ── Fit survey bounding box ──
  const fitSurveyBounds = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const points: [number, number][] = [];

    // Prioritize survey events and congestion routes
    if (surveyEvents.length > 0) {
      surveyEvents.forEach((e) => points.push([e.latitude, e.longitude]));
    } else if (events.length > 0) {
      events.forEach((e) => points.push([e.latitude, e.longitude]));
    }

    if (congestionRoutes.length > 0) {
      congestionRoutes.forEach((cr) => cr.waypoints.forEach((wp) => points.push(wp)));
    }

    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
    }
  }, [surveyEvents, events, congestionRoutes]);

  // ── Fit fleet & events bounding box ──
  const fitFleetBounds = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const points: [number, number][] = [];
    buses.forEach((b) => {
      if (typeof b.lat === 'number' && typeof b.lng === 'number') points.push([b.lat, b.lng]);
    });
    events.forEach((e) => {
      if (typeof e.latitude === 'number' && typeof e.longitude === 'number') points.push([e.latitude, e.longitude]);
    });
    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 16 });
    } else {
      map.setView([center[0], center[1]], zoom, { animate: true });
    }
  }, [buses, events, center, zoom]);

  // Auto-fit bounds on mount or when requested
  useEffect(() => {
    if (autoFitBounds && (surveyEvents.length > 0 || congestionRoutes.length > 0)) {
      const timer = setTimeout(fitSurveyBounds, 250);
      return () => clearTimeout(timer);
    }
  }, [autoFitBounds, surveyEvents.length, congestionRoutes.length, fitSurveyBounds]);

  // ── Inject keyframe CSS once ──
  useEffect(() => {
    const styleId = 'gismap-keyframes';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes busping {
          0%   { transform:scale(0.9); opacity:0.8; }
          70%  { transform:scale(2);   opacity:0;   }
          100% { transform:scale(2.2); opacity:0;   }
        }
        .gis-popup .leaflet-popup-content-wrapper { padding:0!important; overflow:hidden; border-radius:10px; }
        .gis-popup .leaflet-popup-content { margin:0!important; }
        .gis-popup .leaflet-popup-tip-container { display:none; }
        .leaflet-custom-tooltip {
          background:rgba(15,23,42,0.95)!important;
          border:1px solid rgba(56,189,248,0.25)!important;
          color:#f1f5f9!important;
          border-radius:6px!important;
          font-size:11px!important;
          padding:4px 8px!important;
          box-shadow:0 4px 12px rgba(0,0,0,0.5)!important;
        }
        .leaflet-custom-tooltip::before { display:none!important; }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // ── Initialise map once ──
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [center[0], center[1]],
      zoom,
      zoomControl: false,
      attributionControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const tileConf = TILE_LAYERS[activeLayerKey] ?? TILE_LAYERS.street;
    const tile = L.tileLayer(tileConf.url, {
      maxZoom: tileConf.maxZoom || 20,
      subdomains: tileConf.subdomains,
      attribution: tileConf.attribution,
    }).addTo(map);

    if (tileConf.fallbackUrl) {
      tile.on('tileerror', (error) => {
        const tileEl = (error as any).tile as HTMLImageElement;
        const coords = (error as any).coords;
        if (tileEl && coords && !tileEl.dataset.retried) {
          tileEl.dataset.retried = 'true';
          tileEl.src = tileConf.fallbackUrl!
            .replace('{z}', String(coords.z))
            .replace('{x}', String(coords.x))
            .replace('{y}', String(coords.y))
            .replace('{s}', 'a');
        }
      });
    }

    L.control.attribution({
      position: 'bottomleft',
      prefix: '<span style="font-size:9px;opacity:0.4;">\u00a9 OpenStreetMap \u00b7 Real World GIS</span>'
    }).addTo(map);

    const routesLayer  = L.layerGroup().addTo(map);
    const heatmapLayer = L.layerGroup().addTo(map);
    const markersLayer = L.layerGroup().addTo(map);

    mapInstanceRef.current  = map;
    tileLayerRef.current    = tile;
    routesLayerRef.current  = routesLayer;
    heatmapLayerRef.current = heatmapLayer;
    markersLayerRef.current = markersLayer;

    // Trigger invalidation to ensure full render
    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      busAnimRef.current.forEach(clearInterval);
      busAnimRef.current.clear();
      busMarkersRef.current.clear();
      map.remove();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Resize Observer for map container ──
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const observer = new ResizeObserver(() => {
      mapInstanceRef.current?.invalidateSize();
    });
    observer.observe(mapContainerRef.current);
    return () => observer.disconnect();
  }, []);

  // ── Swap tile layer when activeLayerKey changes ──
  useEffect(() => {
    const map  = mapInstanceRef.current;
    const prev = tileLayerRef.current;
    if (!map) return;
    if (prev) {
      map.removeLayer(prev);
    }
    const tileConf = TILE_LAYERS[activeLayerKey] ?? TILE_LAYERS.street;
    const newTile  = L.tileLayer(tileConf.url, {
      maxZoom: tileConf.maxZoom || 20,
      subdomains: tileConf.subdomains,
      attribution: tileConf.attribution,
    });

    if (tileConf.fallbackUrl) {
      newTile.on('tileerror', (error) => {
        const tileEl = (error as any).tile as HTMLImageElement;
        const coords = (error as any).coords;
        if (tileEl && coords && !tileEl.dataset.retried) {
          tileEl.dataset.retried = 'true';
          tileEl.src = tileConf.fallbackUrl!
            .replace('{z}', String(coords.z))
            .replace('{x}', String(coords.x))
            .replace('{y}', String(coords.y))
            .replace('{s}', 'a');
        }
      });
    }

    newTile.addTo(map);
    newTile.bringToBack();
    tileLayerRef.current = newTile;
  }, [activeLayerKey]);

  // ── Centre / zoom changes ──
  useEffect(() => {
    mapInstanceRef.current?.setView([center[0], center[1]], zoom, { animate: true });
  }, [center[0], center[1], zoom]);

  // ── Smooth bus animation ──
  const animateBus = useCallback((busId: string, marker: L.Marker, toLat: number, toLng: number) => {
    const prev = busAnimRef.current.get(busId);
    if (prev) clearInterval(prev);

    const start = marker.getLatLng();
    const steps = 40;
    let   step  = 0;

    const timer = setInterval(() => {
      step++;
      const t = step / steps;
      marker.setLatLng([
        start.lat + (toLat - start.lat) * t,
        start.lng + (toLng - start.lng) * t,
      ]);
      if (step >= steps) {
        clearInterval(timer);
        busAnimRef.current.delete(busId);
      }
    }, 25);

    busAnimRef.current.set(busId, timer);
  }, []);

  // ── Main render pass ──
  useEffect(() => {
    const map     = mapInstanceRef.current;
    const markers = markersLayerRef.current;
    const routes  = routesLayerRef.current;
    const heatmap = heatmapLayerRef.current;
    if (!map || !markers || !routes || !heatmap) return;

    routes.clearLayers();
    heatmap.clearLayers();

    // ── 1. Route polylines ──
    if (congestionRoutes.length > 0) {
      congestionRoutes.forEach((cr) => {
        const colour = CONGESTION_COLOURS[cr.congestionLevel];
        const weight = cr.congestionLevel === 'CRITICAL' ? 7 : cr.congestionLevel === 'HIGH' ? 5 : 4;
        // Glow under-line
        L.polyline(cr.waypoints, { color: colour, weight: weight + 5, opacity: 0.12 }).addTo(routes);
        // Main line
        const poly = L.polyline(cr.waypoints, {
          color: colour, weight,
          opacity: 0.9,
          dashArray: cr.congestionLevel === 'LOW' ? undefined : '10 6',
        });
        poly.bindTooltip(
          `<b style="color:${colour}">${cr.congestionLevel}</b> \u00b7 ${cr.routeName}<br/>Density: ${cr.densityScore.toFixed(0)}%`,
          { className: 'leaflet-custom-tooltip', sticky: true }
        );
        routes.addLayer(poly);
      });
    } else if (activeLayers.buses) {
      buses.forEach((bus) => {
        if (!bus.routeWaypoints || bus.routeWaypoints.length < 2) return;
        const sel = bus.id === selectedBusId;
        L.polyline(bus.routeWaypoints, {
          color:     sel ? '#0284c7' : '#2563eb',
          weight:    sel ? 5 : 3,
          opacity:   sel ? 0.95 : 0.7,
          dashArray: sel ? '8 4' : undefined,
        }).addTo(routes);
      });
    }

    // ── 2. Dynamic Heatmap Circles (Incident Density Clustering) ──
    if (showHeatmap && events.length > 0) {
      // Spatial distance calculation (Haversine in meters)
      const getDistMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371e3;
        const p1 = (lat1 * Math.PI) / 180;
        const p2 = (lat2 * Math.PI) / 180;
        const dp = ((lat2 - lat1) * Math.PI) / 180;
        const dl = ((lon2 - lon1) * Math.PI) / 180;
        const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };

      const clusterRadiusMeters = 150; // 150m spatial cluster window
      interface EventCluster {
        lat: number;
        lng: number;
        events: UrbanEvent[];
        label: string;
      }
      const clusters: EventCluster[] = [];

      events.forEach((ev) => {
        let matched = false;
        for (const c of clusters) {
          if (getDistMeters(c.lat, c.lng, ev.latitude, ev.longitude) <= clusterRadiusMeters) {
            c.events.push(ev);
            // Dynamic centroid update
            c.lat = c.events.reduce((s, e) => s + e.latitude, 0) / c.events.length;
            c.lng = c.events.reduce((s, e) => s + e.longitude, 0) / c.events.length;
            matched = true;
            break;
          }
        }
        if (!matched) {
          clusters.push({
            lat: ev.latitude,
            lng: ev.longitude,
            events: [ev],
            label: ev.locationName || 'Incident Cluster',
          });
        }
      });

      // Severity weight multipliers: CRITICAL > HIGH > MEDIUM > LOW
      const severityWeights: Record<string, number> = {
        CRITICAL: 1.0,
        HIGH: 0.8,
        MEDIUM: 0.5,
        LOW: 0.25,
      };

      clusters.forEach((c) => {
        const sevSum = c.events.reduce((sum, e) => sum + (severityWeights[e.severity] ?? 0.5), 0);
        const avgSev = sevSum / c.events.length;
        // Intensity is driven by event volume and average severity
        const volumeScore = Math.min(1.0, c.events.length / 3);
        const intensity = Math.min(0.95, Math.max(0.35, avgSev * 0.55 + volumeScore * 0.45));
        const radius = Math.min(280, Math.max(100, 110 + c.events.length * 25));

        const colour =
          intensity > 0.75 ? '#ef4444' :
          intensity > 0.55 ? '#f97316' :
          intensity > 0.40 ? '#eab308' : '#22c55e';

        L.circle([c.lat, c.lng], {
          radius: radius * 1.4,
          color: colour,
          fillColor: colour,
          fillOpacity: 0.05,
          weight: 0,
        }).addTo(heatmap);

        L.circle([c.lat, c.lng], {
          radius,
          color: colour,
          fillColor: colour,
          fillOpacity: 0.22,
          weight: 1.5,
          dashArray: '5 3',
        }).bindTooltip(
          `<b>${c.label}</b><br/>Incidents: ${c.events.length} (${c.events.map(e => e.type).slice(0, 2).join(', ')}${c.events.length > 2 ? '...' : ''})<br/>Density Intensity: ${(intensity * 100).toFixed(0)}%`,
          { className: 'leaflet-custom-tooltip' }
        ).addTo(heatmap);
      });
    }

    // ── 3. Bus markers (persistent + animated) ──
    if (activeLayers.buses) {
      const seenBusIds = new Set<string>();

      buses.forEach((bus) => {
        seenBusIds.add(bus.id);
        const isSelected = bus.id === selectedBusId;
        const html  = buildBusMarkerHtml(bus, isSelected);
        const icon  = L.divIcon({ html, className: '', iconSize: [95, 32], iconAnchor: [47, 16] });

        const existing = busMarkersRef.current.get(bus.id);
        if (existing) {
          existing.setIcon(icon);
          animateBus(bus.id, existing, bus.lat, bus.lng);
        } else {
          const marker = L.marker([bus.lat, bus.lng], { icon, zIndexOffset: isSelected ? 1000 : 500 });
          marker.on('click', () => onSelectBus?.(bus));
          marker.bindPopup(buildBusPopup(bus), { maxWidth: 290, className: 'gis-popup' });
          markers.addLayer(marker);
          busMarkersRef.current.set(bus.id, marker);
        }
      });

      // Remove stale bus markers
      busMarkersRef.current.forEach((marker, busId) => {
        if (!seenBusIds.has(busId)) {
          markers.removeLayer(marker);
          busMarkersRef.current.delete(busId);
        }
      });
    }

    // ── 4. Event markers ──
    // Remove old event markers (not bus markers)
    markers.eachLayer((layer) => {
      if (!busMarkersRef.current.has((layer as any)._busId)) {
        // Check if it's not a bus marker
        const isBus = Array.from(busMarkersRef.current.values()).includes(layer as L.Marker);
        if (!isBus) markers.removeLayer(layer);
      }
    });

    events.forEach((ev) => {
      if (ev.category === 'ROAD_HAZARD'    && !activeLayers.roadIssues)    return;
      if (ev.category === 'TRAFFIC'        && !activeLayers.traffic)        return;
      if (ev.category === 'SAFETY'         && !activeLayers.safety)         return;
      if (ev.category === 'INFRASTRUCTURE' && !activeLayers.infrastructure) return;
      if (ev.category === 'ANPR'           && (activeLayers as any).anpr === false) return;

      const isSelected = ev.id === selectedEventId;
      const html = buildEventMarkerHtml(ev, isSelected);
      const icon = L.divIcon({ html, className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
      const marker = L.marker([ev.latitude, ev.longitude], { icon, zIndexOffset: isSelected ? 900 : 200 });
      marker.on('click', () => onSelectEvent?.(ev));
      marker.bindPopup(buildEventPopup(ev), { maxWidth: 300, className: 'gis-popup' });
      markers.addLayer(marker);
    });

  }, [buses, events, selectedBusId, selectedEventId, activeLayers, showHeatmap, congestionRoutes, animateBus]);

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'relative', width: '100%', height,
      overflow: 'hidden', borderRadius: 12,
      border: '1px solid rgba(30,41,59,0.8)',
      background: '#090d16',
    }}>
      <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />

      {/* ── Real Map Quick Switcher Bar (Top Left) ── */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 500,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'rgba(15,23,42,0.92)',
          backdropFilter: 'blur(14px)',
          border: '1px solid rgba(56,189,248,0.25)',
          borderRadius: 8,
          padding: '3px 4px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#38bdf8',
            padding: '0 6px',
            fontFamily: 'monospace',
          }}
        >
          REAL MAP:
        </span>
        {[
          { key: 'street', label: 'Street', icon: '\uD83D\uDDFA\uFE0F' },
          { key: 'satellite', label: 'Satellite', icon: '\uD83D\uDEF0\uFE0F' },
          { key: 'osm', label: 'OSM', icon: '\uD83C\uDF10' },
          { key: 'dark', label: 'Dark', icon: '\uD83C\uDF19' },
        ].map(({ key, label, icon }) => {
          const isActive = activeLayerKey === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveLayerKey(key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 11,
                fontFamily: 'system-ui, sans-serif',
                fontWeight: isActive ? 700 : 500,
                border: 'none',
                cursor: 'pointer',
                background: isActive ? '#0284c7' : 'transparent',
                color: isActive ? '#ffffff' : '#94a3b8',
                transition: 'all 0.15s ease',
              }}
              title={`Switch to ${label} map`}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          );
        })}
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />
        <button
          type="button"
          onClick={fitFleetBounds}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            borderRadius: 6,
            fontSize: 11,
            fontFamily: 'system-ui, sans-serif',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            background: 'rgba(56,189,248,0.12)',
            color: '#38bdf8',
            transition: 'all 0.15s ease',
          }}
          title="Fit fleet and hazards into view"
        >
          ⌖ Fleet View
        </button>
        {surveyEvents.length > 0 && (
          <button
            type="button"
            onClick={fitSurveyBounds}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 9px',
              borderRadius: 6,
              fontSize: 11,
              fontFamily: 'system-ui, sans-serif',
              fontWeight: 700,
              border: '1px solid rgba(250,204,21,0.5)',
              cursor: 'pointer',
              background: 'rgba(234,179,8,0.2)',
              color: '#facc15',
              transition: 'all 0.15s ease',
            }}
            title="Auto-center on uploaded video survey & ANPR plates"
          >
            🎯 Survey Focus ({surveyEvents.length})
          </button>
        )}
      </div>

      {/* ── Legend ── */}
      <div style={{
        position: 'absolute', top: 12, right: 12, zIndex: 500,
        background: 'rgba(15,23,42,0.92)', backdropFilter: 'blur(14px)',
        border: '1px solid rgba(56,189,248,0.15)', borderRadius: 10,
        padding: '10px 13px', fontSize: 11, color: '#94a3b8',
        boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', gap: 6,
        pointerEvents: 'none',
      }}>
        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 5, marginBottom: 2 }}>
          GIS Intelligence Layer
        </div>
        {[
          { colour: '#38bdf8', label: `Active Buses (${buses.filter(b => b.speed > 0).length})`,                  rect: true },
          { colour: '#f97316', label: `Road Hazards (${events.filter(e => e.category === 'ROAD_HAZARD').length})`, rect: false },
          { colour: '#ef4444', label: `Safety (${events.filter(e => e.category === 'SAFETY').length})`,            rect: false },
          { colour: '#eab308', label: `Traffic (${events.filter(e => e.category === 'TRAFFIC').length})`,          rect: false },
          { colour: '#3b82f6', label: `Infrastructure (${events.filter(e => e.category === 'INFRASTRUCTURE').length})`, rect: false },
        ].map(({ colour, label, rect }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{
              width: 8, height: 8, flexShrink: 0,
              background: colour, borderRadius: rect ? 3 : '50%',
              boxShadow: `0 0 5px ${colour}88`,
            }} />
            <span>{label}</span>
          </div>
        ))}
        {congestionRoutes.length > 0 && (
          <div style={{ marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
            <div style={{ fontWeight: 700, color: '#64748b', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Traffic Congestion</div>
            {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((lvl) => (
              <div key={lvl} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                <div style={{ width: 18, height: 4, borderRadius: 2, background: CONGESTION_COLOURS[lvl] }} />
                <span>{lvl}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Live status badge ── */}
      <div style={{
        position: 'absolute', bottom: 38, right: 12, zIndex: 500,
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'rgba(15,23,42,0.88)', backdropFilter: 'blur(8px)',
        border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8,
        padding: '5px 10px', fontSize: 10, color: '#4ade80',
        fontFamily: 'monospace', fontWeight: 700,
        pointerEvents: 'none',
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%', background: '#22c55e',
          boxShadow: '0 0 6px #22c55e', animation: 'busping 1.5s ease-out infinite',
        }} />
        LIVE \u00b7 {buses.length} UNITS TRACKED
      </div>
    </div>
  );
};
