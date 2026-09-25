import {
  Bus,
  UrbanEvent,
  ConsolidatedRoadIssue,
  TrafficMetric,
  RouteDelayInfo,
  RoadConditionSegment,
  ODMatrixPoint
} from '../src/types';

// High-resolution SVG evidence generators for realistic surveillance previews
export function generateEvidenceSvg(
  type: string,
  severity: string,
  busId: string,
  camId: string,
  details: string
): string {
  const isDark = true;
  const bgColor = isDark ? '#0f172a' : '#f8fafc';
  const accentColor =
    severity === 'CRITICAL' ? '#ef4444' :
    severity === 'HIGH' ? '#f97316' :
    severity === 'MEDIUM' ? '#eab308' : '#06b6d4';

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="100%" height="100%">
    <defs>
      <linearGradient id="roadGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1e293b"/>
        <stop offset="100%" stop-color="#090d16"/>
      </linearGradient>
      <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#334155"/>
        <stop offset="100%" stop-color="#1e293b"/>
      </linearGradient>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
      </pattern>
    </defs>
    <!-- Background Horizon & Asphalt Road -->
    <rect width="640" height="150" fill="url(#skyGrad)" />
    <rect y="150" width="640" height="210" fill="url(#roadGrad)" />
    <rect width="640" height="360" fill="url(#grid)" />
    
    <!-- Perspective Road Lines -->
    <polygon points="120,360 280,150 360,150 520,360" fill="#1e293b" opacity="0.6"/>
    <!-- Center Dash -->
    <line x1="320" y1="160" x2="320" y2="185" stroke="#facc15" stroke-width="2" stroke-dasharray="8 6"/>
    <line x1="320" y1="200" x2="320" y2="245" stroke="#facc15" stroke-width="4" stroke-dasharray="12 10"/>
    <line x1="320" y1="265" x2="320" y2="360" stroke="#facc15" stroke-width="6" stroke-dasharray="20 14"/>

    <!-- Simulated Subject Object depending on Detection -->
    ${
      type.toLowerCase().includes('pothole') || type.toLowerCase().includes('crack') || type.toLowerCase().includes('damage')
      ? `<!-- Pothole Defect Area -->
        <ellipse cx="260" cy="270" rx="46" ry="22" fill="#020617" stroke="${accentColor}" stroke-width="3" stroke-dasharray="4 2"/>
        <ellipse cx="262" cy="272" rx="30" ry="12" fill="#000000" opacity="0.9"/>
        <rect x="190" y="225" width="140" height="75" fill="none" stroke="${accentColor}" stroke-width="2"/>
        <rect x="190" y="207" width="140" height="18" fill="${accentColor}" rx="2"/>
        <text x="195" y="220" fill="#000" font-family="monospace" font-size="11" font-weight="bold">${type.toUpperCase()} (94.2%)</text>
        `
      : type.toLowerCase().includes('waterlogging')
      ? `<!-- Waterlogging Zone -->
        <path d="M 210,290 Q 290,260 380,285 T 500,320 L 190,340 Z" fill="#0284c7" fill-opacity="0.5" stroke="${accentColor}" stroke-width="2"/>
        <rect x="200" y="250" width="220" height="85" fill="none" stroke="${accentColor}" stroke-width="2"/>
        <rect x="200" y="232" width="160" height="18" fill="${accentColor}" rx="2"/>
        <text x="205" y="245" fill="#000" font-family="monospace" font-size="11" font-weight="bold">WATERLOGGING</text>
        `
      : type.toLowerCase().includes('rash') || type.toLowerCase().includes('anpr') || type.toLowerCase().includes('vehicle') || type.toLowerCase().includes('lane')
      ? `<!-- Car Silhouette & ANPR bounding box -->
        <rect x="360" y="195" width="130" height="90" rx="8" fill="#3b82f6" opacity="0.8"/>
        <polygon points="380,195 405,170 455,170 475,195" fill="#1d4ed8"/>
        <circle cx="390" cy="285" r="14" fill="#0f172a" stroke="#64748b" stroke-width="3"/>
        <circle cx="460" cy="285" r="14" fill="#0f172a" stroke="#64748b" stroke-width="3"/>
        <!-- License Plate Zoom Box -->
        <rect x="405" y="255" width="45" height="16" fill="#fef08a" stroke="#000" stroke-width="1.5" rx="1"/>
        <text x="408" y="267" fill="#000" font-family="monospace" font-size="8" font-weight="bold">TN38AB1234</text>
        <rect x="350" y="160" width="150" height="135" fill="none" stroke="${accentColor}" stroke-width="2"/>
        <rect x="350" y="142" width="150" height="18" fill="${accentColor}" rx="2"/>
        <text x="355" y="155" fill="#000" font-family="monospace" font-size="10" font-weight="bold">ID #17: 48km/h [ANPR]</text>
        `
      : `<!-- Generic Infrastructure / Pedestrian Detection -->
        <circle cx="210" cy="210" r="12" fill="#f87171"/>
        <line x1="210" y1="222" x2="210" y2="260" stroke="#f87171" stroke-width="4"/>
        <line x1="210" y1="260" x2="198" y2="295" stroke="#f87171" stroke-width="3"/>
        <line x1="210" y1="260" x2="222" y2="295" stroke="#f87171" stroke-width="3"/>
        <rect x="185" y="190" width="55" height="115" fill="none" stroke="${accentColor}" stroke-width="2"/>
        <rect x="185" y="172" width="95" height="18" fill="${accentColor}" rx="2"/>
        <text x="190" y="185" fill="#000" font-family="monospace" font-size="10" font-weight="bold">${type.slice(0, 12)}</text>
        `
    }

    <!-- Edge AI HUD Overlay -->
    <rect x="15" y="15" width="220" height="65" rx="4" fill="rgba(15,23,42,0.85)" stroke="rgba(148,163,184,0.3)" stroke-width="1"/>
    <text x="25" y="32" fill="#38bdf8" font-family="monospace" font-size="11" font-weight="bold">● EDGE AI PROCESSING</text>
    <text x="25" y="48" fill="#e2e8f0" font-family="monospace" font-size="10">${busId} | ${camId}</text>
    <text x="25" y="64" fill="#94a3b8" font-family="monospace" font-size="9">YOLOv8 + ByteTrack + ANPR OCR</text>

    <!-- Stamp in Bottom Right -->
    <rect x="420" y="320" width="205" height="28" rx="3" fill="rgba(15,23,42,0.85)" stroke="rgba(148,163,184,0.3)"/>
    <text x="428" y="338" fill="#cbd5e1" font-family="monospace" font-size="10">EVIDENCE ID: ${details}</text>
    
    <!-- Watermark -->
    <text x="320" y="352" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-family="sans-serif" font-size="9" letter-spacing="1">PROTOTYPE / DEMO BUS CAMERA CAPTURE</text>
  </svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// 8 Transit Buses with real route trajectories across an urban network
export const initialBuses: Bus[] = [
  {
    id: 'BUS-101',
    routeId: 'R-01',
    routeName: 'Route 1 - North-South Express',
    lat: 11.0168,
    lng: 76.9558,
    speed: 38,
    heading: 45,
    direction: 'Northbound',
    cameraStatus: 'ALL_ONLINE',
    gpsStatus: 'LOCKED',
    networkStatus: 'ONLINE_5G',
    aiStatus: 'ACTIVE',
    offlineQueueCount: 0,
    currentWaypointIndex: 0,
    driver: 'R. Selvam',
    passengers: 42,
    lastPing: '2s ago',
    cameras: [
      { id: 'CAM-101-FRONT', busId: 'BUS-101', position: 'FRONT', status: 'ONLINE', fps: 30, resolution: '1080p @ 30FPS', detectionsToday: 142 },
      { id: 'CAM-101-REAR', busId: 'BUS-101', position: 'REAR', status: 'ONLINE', fps: 30, resolution: '1080p @ 30FPS', detectionsToday: 65 },
      { id: 'CAM-101-LEFT', busId: 'BUS-101', position: 'LEFT', status: 'ONLINE', fps: 25, resolution: '720p @ 25FPS', detectionsToday: 89 },
      { id: 'CAM-101-RIGHT', busId: 'BUS-101', position: 'RIGHT', status: 'ONLINE', fps: 25, resolution: '720p @ 25FPS', detectionsToday: 104 }
    ],
    routeWaypoints: [
      [11.0168, 76.9558],
      [11.0210, 76.9602],
      [11.0255, 76.9645],
      [11.0310, 76.9680],
      [11.0350, 76.9720],
      [11.0290, 76.9660],
      [11.0220, 76.9590]
    ]
  },
  {
    id: 'BUS-102',
    routeId: 'R-04',
    routeName: 'Route 4 - City Loop South',
    lat: 10.9985,
    lng: 76.9632,
    speed: 29,
    heading: 130,
    direction: 'Southeast',
    cameraStatus: 'ALL_ONLINE',
    gpsStatus: 'LOCKED',
    networkStatus: 'ONLINE_5G',
    aiStatus: 'ACTIVE',
    offlineQueueCount: 0,
    currentWaypointIndex: 1,
    driver: 'K. Murugan',
    passengers: 36,
    lastPing: '1s ago',
    cameras: [
      { id: 'CAM-102-FRONT', busId: 'BUS-102', position: 'FRONT', status: 'ONLINE', fps: 30, resolution: '1080p @ 30FPS', detectionsToday: 118 },
      { id: 'CAM-102-REAR', busId: 'BUS-102', position: 'REAR', status: 'ONLINE', fps: 30, resolution: '1080p @ 30FPS', detectionsToday: 41 },
      { id: 'CAM-102-LEFT', busId: 'BUS-102', position: 'LEFT', status: 'ONLINE', fps: 25, resolution: '720p @ 25FPS', detectionsToday: 73 },
      { id: 'CAM-102-RIGHT', busId: 'BUS-102', position: 'RIGHT', status: 'ONLINE', fps: 25, resolution: '720p @ 25FPS', detectionsToday: 80 }
    ],
    routeWaypoints: [
      [10.9940, 76.9580],
      [10.9985, 76.9632],
      [11.0030, 76.9690],
      [11.0080, 76.9740],
      [11.0020, 76.9670]
    ]
  },
  {
    id: 'BUS-103',
    routeId: 'R-12',
    routeName: 'Route 12 - Airport Arterial Corridor',
    lat: 11.0082,
    lng: 76.9845,
    speed: 44,
    heading: 90,
    direction: 'Eastbound',
    cameraStatus: 'ALL_ONLINE',
    gpsStatus: 'LOCKED',
    networkStatus: 'ONLINE_5G',
    aiStatus: 'ACTIVE',
    offlineQueueCount: 0,
    currentWaypointIndex: 0,
    driver: 'M. Anand',
    passengers: 55,
    lastPing: 'Just now',
    cameras: [
      { id: 'CAM-103-FRONT', busId: 'BUS-103', position: 'FRONT', status: 'ONLINE', fps: 30, resolution: '1080p @ 30FPS', detectionsToday: 215 },
      { id: 'CAM-103-REAR', busId: 'BUS-103', position: 'REAR', status: 'ONLINE', fps: 30, resolution: '1080p @ 30FPS', detectionsToday: 88 },
      { id: 'CAM-103-LEFT', busId: 'BUS-103', position: 'LEFT', status: 'ONLINE', fps: 25, resolution: '720p @ 25FPS', detectionsToday: 130 },
      { id: 'CAM-103-RIGHT', busId: 'BUS-103', position: 'RIGHT', status: 'ONLINE', fps: 25, resolution: '720p @ 25FPS', detectionsToday: 147 }
    ],
    routeWaypoints: [
      [11.0082, 76.9845],
      [11.0120, 76.9920],
      [11.0180, 77.0010],
      [11.0250, 77.0120],
      [11.0320, 77.0250],
      [11.0220, 77.0050],
      [11.0100, 76.9870]
    ]
  },
  {
    id: 'BUS-104',
    routeId: 'R-12',
    routeName: 'Route 12 - Airport Arterial Corridor',
    lat: 11.0118,
    lng: 76.9915,
    speed: 35,
    heading: 85,
    direction: 'Eastbound',
    cameraStatus: 'ALL_ONLINE',
    gpsStatus: 'LOCKED',
    networkStatus: 'ONLINE_5G',
    aiStatus: 'ACTIVE',
    offlineQueueCount: 0,
    currentWaypointIndex: 1,
    driver: 'S. Rajesh',
    passengers: 48,
    lastPing: '2s ago',
    cameras: [
      { id: 'CAM-104-FRONT', busId: 'BUS-104', position: 'FRONT', status: 'ONLINE', fps: 30, resolution: '1080p @ 30FPS', detectionsToday: 194 },
      { id: 'CAM-104-REAR', busId: 'BUS-104', position: 'REAR', status: 'ONLINE', fps: 30, resolution: '1080p @ 30FPS', detectionsToday: 72 },
      { id: 'CAM-104-LEFT', busId: 'BUS-104', position: 'LEFT', status: 'ONLINE', fps: 25, resolution: '720p @ 25FPS', detectionsToday: 110 },
      { id: 'CAM-104-RIGHT', busId: 'BUS-104', position: 'RIGHT', status: 'ONLINE', fps: 25, resolution: '720p @ 25FPS', detectionsToday: 125 }
    ],
    routeWaypoints: [
      [11.0082, 76.9845],
      [11.0118, 76.9915],
      [11.0180, 77.0010],
      [11.0250, 77.0120],
      [11.0320, 77.0250]
    ]
  },
  {
    id: 'BUS-105',
    routeId: 'R-07',
    routeName: 'Route 7 - Tech Park Ring',
    lat: 11.0295,
    lng: 76.9420,
    speed: 24,
    heading: 210,
    direction: 'Southwest',
    cameraStatus: 'ALL_ONLINE',
    gpsStatus: 'LOCKED',
    networkStatus: 'ONLINE_4G',
    aiStatus: 'ACTIVE',
    offlineQueueCount: 0,
    currentWaypointIndex: 2,
    driver: 'V. Prakash',
    passengers: 39,
    lastPing: '3s ago',
    cameras: [
      { id: 'CAM-105-FRONT', busId: 'BUS-105', position: 'FRONT', status: 'ONLINE', fps: 30, resolution: '1080p @ 30FPS', detectionsToday: 160 },
      { id: 'CAM-105-REAR', busId: 'BUS-105', position: 'REAR', status: 'ONLINE', fps: 30, resolution: '1080p @ 30FPS', detectionsToday: 60 },
      { id: 'CAM-105-LEFT', busId: 'BUS-105', position: 'LEFT', status: 'ONLINE', fps: 25, resolution: '720p @ 25FPS', detectionsToday: 95 },
      { id: 'CAM-105-RIGHT', busId: 'BUS-105', position: 'RIGHT', status: 'ONLINE', fps: 25, resolution: '720p @ 25FPS', detectionsToday: 102 }
    ],
    routeWaypoints: [
      [11.0380, 76.9350],
      [11.0340, 76.9380],
      [11.0295, 76.9420],
      [11.0220, 76.9490],
      [11.0150, 76.9550]
    ]
  },
  {
    id: 'BUS-106',
    routeId: 'R-02',
    routeName: 'Route 2 - University Link',
    lat: 11.0420,
    lng: 76.9850,
    speed: 31,
    heading: 320,
    direction: 'Northwest',
    cameraStatus: 'DEGRADED', // 1 camera standby
    gpsStatus: 'LOCKED',
    networkStatus: 'ONLINE_5G',
    aiStatus: 'ACTIVE',
    offlineQueueCount: 0,
    currentWaypointIndex: 0,
    driver: 'J. David',
    passengers: 61,
    lastPing: '1s ago',
    cameras: [
      { id: 'CAM-106-FRONT', busId: 'BUS-106', position: 'FRONT', status: 'ONLINE', fps: 30, resolution: '1080p @ 30FPS', detectionsToday: 175 },
      { id: 'CAM-106-REAR', busId: 'BUS-106', position: 'REAR', status: 'ONLINE', fps: 30, resolution: '1080p @ 30FPS', detectionsToday: 55 },
      { id: 'CAM-106-LEFT', busId: 'BUS-106', position: 'LEFT', status: 'OFFLINE', fps: 0, resolution: 'Offline', detectionsToday: 12 },
      { id: 'CAM-106-RIGHT', busId: 'BUS-106', position: 'RIGHT', status: 'ONLINE', fps: 25, resolution: '720p @ 25FPS', detectionsToday: 88 }
    ],
    routeWaypoints: [
      [11.0420, 76.9850],
      [11.0480, 76.9780],
      [11.0540, 76.9710],
      [11.0600, 76.9650],
      [11.0490, 76.9750]
    ]
  },
  {
    id: 'BUS-107',
    routeId: 'R-12',
    routeName: 'Route 12 - Airport Arterial Corridor',
    lat: 11.0112,
    lng: 76.9912,
    speed: 39,
    heading: 88,
    direction: 'Eastbound',
    cameraStatus: 'ALL_ONLINE',
    gpsStatus: 'LOCKED',
    networkStatus: 'ONLINE_5G',
    aiStatus: 'ACTIVE',
    offlineQueueCount: 0,
    currentWaypointIndex: 0,
    driver: 'T. Kumar',
    passengers: 44,
    lastPing: 'Just now',
    cameras: [
      { id: 'CAM-107-FRONT', busId: 'BUS-107', position: 'FRONT', status: 'ONLINE', fps: 30, resolution: '1080p @ 30FPS', detectionsToday: 198 },
      { id: 'CAM-107-REAR', busId: 'BUS-107', position: 'REAR', status: 'ONLINE', fps: 30, resolution: '1080p @ 30FPS', detectionsToday: 69 },
      { id: 'CAM-107-LEFT', busId: 'BUS-107', position: 'LEFT', status: 'ONLINE', fps: 25, resolution: '720p @ 25FPS', detectionsToday: 112 },
      { id: 'CAM-107-RIGHT', busId: 'BUS-107', position: 'RIGHT', status: 'ONLINE', fps: 25, resolution: '720p @ 25FPS', detectionsToday: 134 }
    ],
    routeWaypoints: [
      [11.0082, 76.9845],
      [11.0112, 76.9912],
      [11.0180, 77.0010],
      [11.0250, 77.0120],
      [11.0320, 77.0250]
    ]
  },
  {
    id: 'BUS-108',
    routeId: 'R-15',
    routeName: 'Route 15 - Industrial Feeder',
    lat: 10.9850,
    lng: 76.9450,
    speed: 0,
    heading: 0,
    direction: 'Stationary / Depot',
    cameraStatus: 'ALL_ONLINE',
    gpsStatus: 'LOCKED',
    networkStatus: 'ONLINE_4G',
    aiStatus: 'STANDBY',
    offlineQueueCount: 0,
    currentWaypointIndex: 0,
    driver: 'A. Francis',
    passengers: 0,
    lastPing: '15s ago',
    cameras: [
      { id: 'CAM-108-FRONT', busId: 'BUS-108', position: 'FRONT', status: 'ONLINE', fps: 30, resolution: '1080p @ 30FPS', detectionsToday: 45 },
      { id: 'CAM-108-REAR', busId: 'BUS-108', position: 'REAR', status: 'ONLINE', fps: 30, resolution: '1080p @ 30FPS', detectionsToday: 20 },
      { id: 'CAM-108-LEFT', busId: 'BUS-108', position: 'LEFT', status: 'ONLINE', fps: 25, resolution: '720p @ 25FPS', detectionsToday: 31 },
      { id: 'CAM-108-RIGHT', busId: 'BUS-108', position: 'RIGHT', status: 'ONLINE', fps: 25, resolution: '720p @ 25FPS', detectionsToday: 29 }
    ],
    routeWaypoints: [
      [10.9850, 76.9450],
      [10.9890, 76.9500],
      [10.9940, 76.9560],
      [11.0000, 76.9620]
    ]
  }
];

// Initial events
export const initialEvents: UrbanEvent[] = [
  {
    id: 'RD-00127',
    category: 'ROAD_HAZARD',
    type: 'Pothole',
    confidence: 94.2,
    severity: 'HIGH',
    busId: 'BUS-103',
    cameraId: 'CAM-103-FRONT',
    latitude: 11.0115,
    longitude: 76.9918,
    timestamp: 'Today, 10:42:15 AM',
    locationName: 'Avinashi Road near Hope College Flyover',
    status: 'VERIFIED',
    assignedDepartment: 'Highways & PWD Civil Wing',
    evidence: generateEvidenceSvg('Pothole', 'HIGH', 'BUS-103', 'CAM-103-FRONT', 'EV-00127'),
    details: {
      hazardDimensions: '0.8m width x 1.1m length x 9cm depth',
      observationsCount: 3,
      busesObserving: ['BUS-101', 'BUS-104', 'BUS-107'],
      notes: 'Deep edge spalling along primary transit lane. High risk of bus tire blowout.'
    },
    history: [
      { timestamp: '10:42:15 AM', action: 'Detected by Edge AI', by: 'BUS-103 Edge Computer' },
      { timestamp: '10:48:30 AM', action: 'Multi-bus fusion linked sighting', by: 'Central PostGIS Engine' },
      { timestamp: '11:05:00 AM', action: 'Verified as HIGH priority', by: 'Transport Authority' }
    ]
  },
  {
    id: 'SF-00482',
    category: 'SAFETY',
    type: 'Potential Rash Driving',
    confidence: 91.5,
    severity: 'CRITICAL',
    busId: 'BUS-103',
    cameraId: 'CAM-103-FRONT',
    latitude: 11.0082,
    longitude: 76.9845,
    timestamp: 'Today, 10:39:48 AM',
    locationName: 'Lakshmi Mills Junction',
    status: 'ASSIGNED',
    assignedDepartment: 'City Traffic Police Enactment Unit',
    evidence: generateEvidenceSvg('rash', 'CRITICAL', 'BUS-103', 'CAM-103-FRONT', 'EV-00482'),
    details: {
      plateNumber: 'TN 38 AB 1234',
      plateConfidence: 93.5,
      speedRecorded: 82, // km/h in 40 km/h zone
      vehicleClass: 'Sedan (Blue) — Offending Vehicle #17',
      trackId: 17,
      notes: 'Trajectory crossed bus right-of-way with dangerous lateral cut (<0.6m clearance). ByteTrack ID #17 maintained across 28 frames. ANPR OCR confidence 93.5%. GPS locked: 11.0082°N, 76.9845°E.'
    },
    history: [
      { timestamp: '10:39:48 AM', action: 'ByteTrack alert triggered — Offending Vehicle #17', by: 'BUS-103 Edge AI' },
      { timestamp: '10:41:00 AM', action: 'ANPR plate OCR captured: TN 38 AB 1234 (93.5% conf)', by: 'Local Edge ANPR Engine' },
      { timestamp: '10:44:00 AM', action: 'Escalated to Traffic Police', by: 'Duty Dispatcher' }
    ]
  },
  {
    id: 'HR-00109',
    category: 'SAFETY',
    type: 'Hit-and-Run Incident',
    confidence: 96.0,
    severity: 'CRITICAL',
    busId: 'BUS-104',
    cameraId: 'CAM-104-FRONT',
    latitude: 11.0168,
    longitude: 76.9678,
    timestamp: 'Today, 10:52:16 AM',
    locationName: 'Gandhipuram Central Cross',
    status: 'NEW',
    assignedDepartment: 'Highway Patrol & Emergency Services',
    evidence: generateEvidenceSvg('rash', 'CRITICAL', 'BUS-104', 'CAM-104-FRONT', 'HR-00109'),
    details: {
      plateNumber: 'TN 38 CH 9042',
      plateConfidence: 89.2,
      speedRecorded: 78,
      vehicleClass: 'Hatchback (White) — Offending Vehicle #24',
      trackId: 24,
      notes: 'CRITICAL: Offending vehicle #24 (TN 38 CH 9042) involved in pedestrian curb collision at Gandhipuram Cross at 10:52:16 AM and fled scene at ~78 km/h. Emergency medical & traffic police intercept dispatched. GPS: 11.0168°N, 76.9678°E. ANPR confidence: 89.2%.'
    },
    history: [
      { timestamp: '10:52:16 AM', action: 'Collision incident flagged — curb proximity impact', by: 'BUS-104 Edge AI' },
      { timestamp: '10:52:18 AM', action: 'Offending vehicle flee trajectory confirmed — #24 accelerating away', by: 'BUS-104 ByteTrack' },
      { timestamp: '10:52:45 AM', action: 'ANPR OCR: TN 38 CH 9042 (89.2% confidence)', by: 'Local Edge ANPR Engine' },
      { timestamp: '10:55:00 AM', action: 'Emergency alert forwarded to Highway Patrol & Traffic Police', by: 'Duty Dispatcher' }
    ]
  },
  {
    id: 'RD-00128',
    category: 'ROAD_HAZARD',
    type: 'Waterlogging',
    confidence: 89.0,
    severity: 'MEDIUM',
    busId: 'BUS-102',
    cameraId: 'CAM-102-LEFT',
    latitude: 10.9985,
    longitude: 76.9632,
    timestamp: 'Today, 09:55:10 AM',
    locationName: 'Trichy Road Subway Approach',
    status: 'IN_PROGRESS',
    assignedDepartment: 'Municipal Stormwater Drainage',
    evidence: generateEvidenceSvg('waterlogging', 'MEDIUM', 'BUS-102', 'CAM-102-LEFT', 'EV-00128'),
    details: {
      hazardDimensions: 'Approx 15m pool spanning 1.5 lanes',
      observationsCount: 2,
      busesObserving: ['BUS-102', 'BUS-108'],
      notes: 'Standing water slowing commuter traffic to <15 km/h.'
    }
  },
  {
    id: 'TR-00301',
    category: 'TRAFFIC',
    type: 'Traffic Bottleneck',
    confidence: 96.0,
    severity: 'HIGH',
    busId: 'BUS-101',
    cameraId: 'CAM-101-FRONT',
    latitude: 11.0255,
    longitude: 76.9645,
    timestamp: 'Today, 10:15:22 AM',
    locationName: 'Gandhipuram Central Cross',
    status: 'NEW',
    assignedDepartment: 'Traffic Signal Control Operations',
    evidence: generateEvidenceSvg('traffic', 'HIGH', 'BUS-101', 'CAM-101-FRONT', 'EV-00301'),
    details: {
      speedRecorded: 6,
      vehicleClass: 'Multi-vehicle Congestion',
      notes: 'Queuing detected over 300 meters. Edge AI counted 54 vehicles/min exceeding corridor threshold.'
    }
  },
  {
    id: 'SF-00483',
    category: 'SAFETY',
    type: 'Dangerous Pedestrian Proximity',
    confidence: 88.4,
    severity: 'HIGH',
    busId: 'BUS-105',
    cameraId: 'CAM-105-RIGHT',
    latitude: 11.0295,
    longitude: 76.9420,
    timestamp: 'Today, 09:30:14 AM',
    locationName: 'Government College Bus Stop',
    status: 'VERIFIED',
    assignedDepartment: 'Pedestrian Safety Board',
    evidence: generateEvidenceSvg('pedestrian', 'HIGH', 'BUS-105', 'CAM-105-RIGHT', 'EV-00483'),
    details: {
      trackId: 42,
      notes: 'School students standing beyond curb edge due to missing guardrail barrier.'
    }
  },
  {
    id: 'IF-00089',
    category: 'INFRASTRUCTURE',
    type: 'Missing Road Divider',
    confidence: 93.0,
    severity: 'MEDIUM',
    busId: 'BUS-104',
    cameraId: 'CAM-104-FRONT',
    latitude: 11.0180,
    longitude: 77.0010,
    timestamp: 'Today, 08:20:05 AM',
    locationName: 'Sitra Road Median Break',
    status: 'NEW',
    assignedDepartment: 'Urban Road Infrastructure',
    evidence: generateEvidenceSvg('divider', 'MEDIUM', 'BUS-104', 'CAM-104-FRONT', 'EV-00089'),
    details: {
      notes: 'Broken median concrete sections causing hazardous illegal U-turns.'
    }
  },
  {
    id: 'IF-00090',
    category: 'INFRASTRUCTURE',
    type: 'Damaged Traffic Signboard',
    confidence: 87.5,
    severity: 'LOW',
    busId: 'BUS-106',
    cameraId: 'CAM-106-FRONT',
    latitude: 11.0420,
    longitude: 76.9850,
    timestamp: 'Today, 07:45:00 AM',
    locationName: 'Saravanampatti Tech Junction',
    status: 'RESOLVED',
    assignedDepartment: 'Signage Maintenance Wing',
    evidence: generateEvidenceSvg('sign', 'LOW', 'BUS-106', 'CAM-106-FRONT', 'EV-00090'),
    details: {
      notes: 'Bent overhead school zone speed limit board; replacement scheduled.'
    }
  }
];

// Consolidated Road Issues (Multi-bus fused)
export const initialConsolidatedIssues: ConsolidatedRoadIssue[] = [
  {
    id: 'RD-00127',
    type: 'Pothole',
    severity: 'HIGH',
    latitude: 11.0115,
    longitude: 76.9918,
    firstReported: '08:14 AM',
    lastReported: '10:42 AM',
    sightingCount: 3,
    reportingBuses: ['BUS-101', 'BUS-104', 'BUS-107'],
    confidence: 'High',
    status: 'SCHEDULED_REPAIR',
    roadName: 'Avinashi Road (Near Hope College Flyover)',
    dimensions: '0.8m x 1.1m (9cm depth)',
    evidence: generateEvidenceSvg('Pothole', 'HIGH', 'BUS-103', 'CAM-103-FRONT', 'RD-00127')
  },
  {
    id: 'RD-00128',
    type: 'Waterlogging',
    severity: 'MEDIUM',
    latitude: 10.9985,
    longitude: 76.9632,
    firstReported: '07:30 AM',
    lastReported: '09:55 AM',
    sightingCount: 2,
    reportingBuses: ['BUS-102', 'BUS-108'],
    confidence: 'Medium',
    status: 'OPEN',
    roadName: 'Trichy Road Subway Approach',
    dimensions: '15m standing water (depth 12cm)',
    evidence: generateEvidenceSvg('Waterlogging', 'MEDIUM', 'BUS-102', 'CAM-102-LEFT', 'RD-00128')
  },
  {
    id: 'RD-00130',
    type: 'Damaged Road & Alligator Cracking',
    severity: 'HIGH',
    latitude: 11.0250,
    longitude: 76.9640,
    firstReported: 'Yesterday',
    lastReported: 'Today 09:10 AM',
    sightingCount: 5,
    reportingBuses: ['BUS-101', 'BUS-102', 'BUS-105', 'BUS-106', 'BUS-107'],
    confidence: 'Verified',
    status: 'OPEN',
    roadName: 'Cross Cut Road Main Commercial Stretch',
    dimensions: '30m continuous surface degradation',
    evidence: generateEvidenceSvg('Crack', 'HIGH', 'BUS-101', 'CAM-101-FRONT', 'RD-00130')
  },
  {
    id: 'RD-00131',
    type: 'Missing Zebra Crossing',
    severity: 'MEDIUM',
    latitude: 11.0340,
    longitude: 76.9720,
    firstReported: 'Yesterday',
    lastReported: 'Today 08:40 AM',
    sightingCount: 3,
    reportingBuses: ['BUS-101', 'BUS-106', 'BUS-107'],
    confidence: 'Verified',
    status: 'OPEN',
    roadName: 'Peelamedu High School Junction',
    dimensions: 'Faded pedestrian crosswalk marking',
    evidence: generateEvidenceSvg('Zebra', 'MEDIUM', 'BUS-106', 'CAM-106-FRONT', 'RD-00131')
  }
];

// Road Condition Segments (for road quality map)
export const initialRoadSegments: RoadConditionSegment[] = [
  {
    roadId: 'SEG-1',
    roadName: 'Avinashi Road Arterial (Hope College to SITRA)',
    condition: 'POOR',
    issueCount: 4,
    lastSurveyed: '5 mins ago',
    busSightings: 14,
    coordinates: [
      [11.0080, 76.9840],
      [11.0115, 76.9918],
      [11.0180, 77.0010],
      [11.0250, 77.0120]
    ]
  },
  {
    roadId: 'SEG-2',
    roadName: 'Trichy Road Expressway',
    condition: 'FAIR',
    issueCount: 2,
    lastSurveyed: '12 mins ago',
    busSightings: 9,
    coordinates: [
      [10.9940, 76.9580],
      [10.9985, 76.9632],
      [11.0030, 76.9690]
    ]
  },
  {
    roadId: 'SEG-3',
    roadName: 'Mettupalayam Highway North',
    condition: 'GOOD',
    issueCount: 0,
    lastSurveyed: '18 mins ago',
    busSightings: 8,
    coordinates: [
      [11.0420, 76.9850],
      [11.0480, 76.9780],
      [11.0540, 76.9710],
      [11.0600, 76.9650]
    ]
  },
  {
    roadId: 'SEG-4',
    roadName: 'Cross Cut Road & Gandhipuram Core',
    condition: 'CRITICAL',
    issueCount: 6,
    lastSurveyed: '2 mins ago',
    busSightings: 22,
    coordinates: [
      [11.0168, 76.9558],
      [11.0210, 76.9602],
      [11.0255, 76.9645]
    ]
  }
];

// Route Delay Performance
export const initialRouteDelays: RouteDelayInfo[] = [
  {
    routeId: 'R-12',
    routeName: 'Route 12 (Central Bus Stand ⇄ Coimbatore Airport)',
    scheduledMinutes: 42,
    actualMinutes: 51,
    delayMinutes: 9,
    avgSpeed: 28.5,
    congestion: 'HIGH',
    activeBuses: 3
  },
  {
    routeId: 'R-01',
    routeName: 'Route 1 (North Terminal ⇄ South Junction)',
    scheduledMinutes: 55,
    actualMinutes: 62,
    delayMinutes: 7,
    avgSpeed: 24.2,
    congestion: 'HIGH',
    activeBuses: 2
  },
  {
    routeId: 'R-04',
    routeName: 'Route 4 (City Ring Road Loop)',
    scheduledMinutes: 38,
    actualMinutes: 41,
    delayMinutes: 3,
    avgSpeed: 32.0,
    congestion: 'MEDIUM',
    activeBuses: 1
  },
  {
    routeId: 'R-02',
    routeName: 'Route 2 (University ⇄ IT Corridor)',
    scheduledMinutes: 45,
    actualMinutes: 46,
    delayMinutes: 1,
    avgSpeed: 36.8,
    congestion: 'LOW',
    activeBuses: 1
  },
  {
    routeId: 'R-07',
    routeName: 'Route 7 (West End ⇄ Tech Park)',
    scheduledMinutes: 50,
    actualMinutes: 54,
    delayMinutes: 4,
    avgSpeed: 27.4,
    congestion: 'MEDIUM',
    activeBuses: 1
  }
];

// Origin-Destination Matrix Data
export const initialODMatrix: ODMatrixPoint[] = [
  { origin: 'Central Bus Stand', destination: 'Airport Terminal', tripCount: 1240, avgTravelTime: 51, congestionIndex: 78 },
  { origin: 'Gandhipuram Terminal', destination: 'Tidel Park SEZ', tripCount: 1890, avgTravelTime: 38, congestionIndex: 82 },
  { origin: 'Railway Station', destination: 'Saravanampatti Tech Hub', tripCount: 1420, avgTravelTime: 44, congestionIndex: 65 },
  { origin: 'Ukkadam Junction', destination: 'Singanallur Hub', tripCount: 980, avgTravelTime: 29, congestionIndex: 54 },
  { origin: 'Saibaba Colony', destination: 'Peelamedu College Zone', tripCount: 870, avgTravelTime: 33, congestionIndex: 60 }
];

// Real-time Traffic metrics
export const initialTrafficMetrics: TrafficMetric = {
  totalVehicles: 14820,
  cars: 6210,
  buses: 1140,
  trucks: 1830,
  motorcycles: 4620,
  pedestrians: 1020,
  avgSpeed: 31.4,
  congestionLevel: 'MEDIUM',
  densityScore: 68,
  bottleneckCount: 4
};

// Hourly Traffic Trend
export const hourlyTrafficTrends = [
  { time: '06:00', vehicles: 2100, avgSpeed: 44, congestion: 20 },
  { time: '07:00', vehicles: 4500, avgSpeed: 38, congestion: 42 },
  { time: '08:00', vehicles: 9800, avgSpeed: 24, congestion: 78 },
  { time: '09:00', vehicles: 13200, avgSpeed: 19, congestion: 89 },
  { time: '10:00', vehicles: 11400, avgSpeed: 23, congestion: 75 },
  { time: '11:00', vehicles: 8900, avgSpeed: 31, congestion: 58 },
  { time: '12:00', vehicles: 8200, avgSpeed: 33, congestion: 52 },
  { time: '13:00', vehicles: 8600, avgSpeed: 32, congestion: 54 },
  { time: '14:00', vehicles: 9100, avgSpeed: 30, congestion: 59 },
  { time: '15:00', vehicles: 10400, avgSpeed: 27, congestion: 68 },
  { time: '16:00', vehicles: 12100, avgSpeed: 22, congestion: 82 },
  { time: '17:00', vehicles: 14800, avgSpeed: 18, congestion: 92 },
  { time: '18:00', vehicles: 15400, avgSpeed: 17, congestion: 95 },
  { time: '19:00', vehicles: 13800, avgSpeed: 20, congestion: 86 },
  { time: '20:00', vehicles: 9400, avgSpeed: 29, congestion: 62 },
  { time: '21:00', vehicles: 6100, avgSpeed: 38, congestion: 38 }
];

// Check SEED_DATA / SEED_EVENTS environment variables. If set to 'false', start with empty events & road issues.
const isSeedDisabled = process.env.SEED_DATA === 'false' || process.env.SEED_EVENTS === 'false';

// In-memory Database Store
class UrbanSenseDatabase {
  public buses: Bus[] = [...initialBuses];
  public events: UrbanEvent[] = isSeedDisabled ? [] : [...initialEvents];
  public roadIssues: ConsolidatedRoadIssue[] = isSeedDisabled ? [] : [...initialConsolidatedIssues];
  public roadSegments: RoadConditionSegment[] = [...initialRoadSegments];
  public routeDelays: RouteDelayInfo[] = [...initialRouteDelays];
  public odMatrix: ODMatrixPoint[] = [...initialODMatrix];
  public trafficMetrics: TrafficMetric = { ...initialTrafficMetrics };
  public simulationActive: boolean = false;
  public offlineSimulatedQueue: UrbanEvent[] = [];

  public clearEvents(): void {
    this.events = [];
    this.roadIssues = [];
  }

  public resetSeedData(): void {
    this.events = [...initialEvents];
    this.roadIssues = [...initialConsolidatedIssues];
  }

  // Spatial distance calculation (Euclidean approximation for city grid meters)
  private getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  // Multi-Bus Event Fusion logic (PostGIS spatial match concept)
  public addEvent(event: UrbanEvent): { event: UrbanEvent; fusedWithConsolidated?: ConsolidatedRoadIssue } {
    this.events.unshift(event);

    // If it's a road hazard (pothole, crack, waterlogging, etc.), perform spatial duplicate fusion
    if (event.category === 'ROAD_HAZARD' || event.type.toLowerCase().includes('pothole') || event.type.toLowerCase().includes('waterlogging')) {
      const matchRadiusMeters = 85; // 85 meters cluster tolerance
      const existing = this.roadIssues.find(
        (issue) =>
          issue.type.toLowerCase() === event.type.toLowerCase() &&
          this.getDistanceMeters(issue.latitude, issue.longitude, event.latitude, event.longitude) < matchRadiusMeters
      );

      if (existing) {
        // Multi-bus fusion! Increment sightings
        existing.sightingCount += 1;
        existing.lastReported = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (!existing.reportingBuses.includes(event.busId)) {
          existing.reportingBuses.push(event.busId);
        }
        existing.confidence = existing.sightingCount >= 3 ? 'Verified' : 'High';
        
        // Link to event
        if (!event.details) event.details = {};
        event.details.observationsCount = existing.sightingCount;
        event.details.busesObserving = [...existing.reportingBuses];
        event.details.notes = `Confirmed by multiple bus observations (${existing.sightingCount} sightings: ${existing.reportingBuses.join(', ')})`;

        return { event, fusedWithConsolidated: existing };
      } else {
        // Create new consolidated issue
        const newConsolidated: ConsolidatedRoadIssue = {
          id: event.id,
          type: event.type,
          severity: event.severity,
          latitude: event.latitude,
          longitude: event.longitude,
          firstReported: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          lastReported: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          sightingCount: 1,
          reportingBuses: [event.busId],
          confidence: 'Medium',
          status: 'OPEN',
          roadName: event.locationName || 'Monitored Transit Route',
          dimensions: event.details?.hazardDimensions || 'Active surface defect',
          evidence: event.evidence
        };
        this.roadIssues.unshift(newConsolidated);
        return { event, fusedWithConsolidated: newConsolidated };
      }
    }

    return { event };
  }

  // Simulation tick: move buses along predefined route waypoints
  public stepSimulation(): { movedBuses: Bus[]; generatedEvent?: UrbanEvent } {
    let generatedEvent: UrbanEvent | undefined;

    this.buses = this.buses.map((bus) => {
      if (bus.speed === 0 && bus.routeWaypoints.length <= 1) return bus;

      const waypoints = bus.routeWaypoints;
      const nextIdx = (bus.currentWaypointIndex + 1) % waypoints.length;
      const targetPoint = waypoints[nextIdx];
      const currentPoint: [number, number] = [bus.lat, bus.lng];

      // Interpolate small delta towards target
      const stepFactor = 0.08;
      const newLat = currentPoint[0] + (targetPoint[0] - currentPoint[0]) * stepFactor;
      const newLng = currentPoint[1] + (targetPoint[1] - currentPoint[1]) * stepFactor;

      // Calculate distance to next target
      const dist = this.getDistanceMeters(newLat, newLng, targetPoint[0], targetPoint[1]);
      const newIndex = dist < 25 ? nextIdx : bus.currentWaypointIndex;

      // Minor speed fluctuation
      const speedFluctuation = Math.floor(Math.random() * 7) - 3;
      const newSpeed = Math.max(15, Math.min(55, bus.speed + speedFluctuation));

      return {
        ...bus,
        lat: Number(newLat.toFixed(6)),
        lng: Number(newLng.toFixed(6)),
        speed: newSpeed,
        currentWaypointIndex: newIndex,
        lastPing: 'Just now'
      };
    });

    // Random stochastic detection generation during simulation (low probability)
    if (Math.random() < 0.15) {
      const activeBuses = this.buses.filter((b) => b.aiStatus === 'ACTIVE' && b.speed > 0);
      const chosenBus = activeBuses[Math.floor(Math.random() * activeBuses.length)] || this.buses[2];
      const randomTypes: Array<{ type: string; cat: UrbanEvent['category']; sev: UrbanEvent['severity']; details: string }> = [
        { type: 'Pothole', cat: 'ROAD_HAZARD', sev: 'HIGH', details: 'Surface pavement collapse' },
        { type: 'Traffic Bottleneck', cat: 'TRAFFIC', sev: 'MEDIUM', details: 'Corridor speed drop <18 km/h' },
        { type: 'Dangerous Pedestrian Proximity', cat: 'SAFETY', sev: 'HIGH', details: 'Curb intrusion near bus stop' },
        { type: 'Road Crack', cat: 'ROAD_HAZARD', sev: 'MEDIUM', details: 'Longitudinal joint separation' }
      ];
      const selected = randomTypes[Math.floor(Math.random() * randomTypes.length)];
      const eventId = `EV-${Math.floor(10000 + Math.random() * 90000)}`;

      const newEv: UrbanEvent = {
        id: eventId,
        category: selected.cat,
        type: selected.type,
        confidence: Number((86 + Math.random() * 12).toFixed(1)),
        severity: selected.sev,
        busId: chosenBus.id,
        cameraId: chosenBus.cameras[0].id,
        latitude: chosenBus.lat,
        longitude: chosenBus.lng,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        locationName: `${chosenBus.routeName} Corridor`,
        status: 'NEW',
        assignedDepartment: selected.cat === 'ROAD_HAZARD' ? 'Road Works Maintenance' : 'Traffic Management Control',
        evidence: generateEvidenceSvg(selected.type, selected.sev, chosenBus.id, chosenBus.cameras[0].id, eventId),
        details: {
          notes: selected.details,
          speedRecorded: chosenBus.speed
        }
      };

      this.addEvent(newEv);
      generatedEvent = newEv;
    }

    return { movedBuses: this.buses, generatedEvent };
  }

  // Update alert / event status
  public updateEventStatus(id: string, status: UrbanEvent['status'], department?: string): UrbanEvent | null {
    const ev = this.events.find((e) => e.id === id);
    if (!ev) return null;
    ev.status = status;
    if (department) ev.assignedDepartment = department;

    if (!ev.history) ev.history = [];
    ev.history.push({
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      action: `Status updated to ${status}${department ? ` (Assigned to ${department})` : ''}`,
      by: 'Transport Authority Operator'
    });

    // If matching consolidated issue, sync status
    const issue = this.roadIssues.find((i) => i.id === id);
    if (issue) {
      if (status === 'RESOLVED') issue.status = 'RESOLVED';
      else if (status === 'ASSIGNED' || status === 'IN_PROGRESS') issue.status = 'SCHEDULED_REPAIR';
    }

    return ev;
  }

  // Stats summary for Overview Dashboard
  public getStats() {
    const totalBuses = this.buses.length;
    const activeBuses = this.buses.filter((b) => b.aiStatus === 'ACTIVE' && b.speed > 0).length;
    let camerasOnline = 0;
    this.buses.forEach((b) => {
      camerasOnline += b.cameras.filter((c) => c.status === 'ONLINE').length;
    });

    const roadIssuesDetected = this.events.filter((e) => e.category === 'ROAD_HAZARD').length;
    const trafficAlerts = this.events.filter((e) => e.category === 'TRAFFIC').length;
    const safetyAlerts = this.events.filter((e) => e.category === 'SAFETY').length;
    const highSeverity = this.events.filter((e) => e.severity === 'HIGH' || e.severity === 'CRITICAL').length;
    const eventsToday = this.events.length;

    return {
      totalBuses,
      activeBuses,
      camerasOnline,
      totalCameras: totalBuses * 4,
      roadIssuesDetected,
      trafficAlerts,
      safetyAlerts,
      highSeverity,
      avgCongestion: '68%',
      eventsToday,
      bandwidthSaved: '99.4%',
      edgeProcessingActive: true
    };
  }
}

export const db = new UrbanSenseDatabase();
