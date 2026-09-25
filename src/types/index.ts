export type DetectionCategory = 'ROAD_HAZARD' | 'TRAFFIC' | 'SAFETY' | 'INFRASTRUCTURE' | 'ANPR';

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type AlertStatus = 'NEW' | 'VERIFIED' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED';

export type UserRole = 'ADMIN' | 'TRANSPORT_AUTHORITY' | 'OPERATOR';

export interface BusCamera {
  id: string;
  busId: string;
  position: 'FRONT' | 'REAR' | 'LEFT' | 'RIGHT';
  status: 'ONLINE' | 'OFFLINE' | 'RECORDING';
  fps: number;
  resolution: string;
  detectionsToday: number;
}

export interface Bus {
  id: string;
  routeId: string;
  routeName: string;
  lat: number;
  lng: number;
  speed: number; // km/h
  heading: number; // degrees
  direction: string;
  cameraStatus: 'ALL_ONLINE' | 'DEGRADED' | 'OFFLINE';
  gpsStatus: 'LOCKED' | 'SEARCHING' | 'OFFLINE';
  networkStatus: 'ONLINE_5G' | 'ONLINE_4G' | 'OFFLINE';
  aiStatus: 'ACTIVE' | 'STANDBY' | 'ERROR';
  cameras: BusCamera[];
  offlineQueueCount: number;
  routeWaypoints: [number, number][];
  currentWaypointIndex: number;
  passengers?: number;
  driver?: string;
  lastPing: string;
}

export interface UrbanEvent {
  id: string;
  category: DetectionCategory;
  type: string;
  confidence: number;
  severity: Severity;
  busId: string;
  cameraId: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  evidence: string;
  evidenceThumbnail?: string;
  status: AlertStatus;
  locationName?: string;
  assignedDepartment?: string;
  details?: {
    plateNumber?: string;
    plateConfidence?: number;
    speedRecorded?: number;
    vehicleClass?: string;
    trackId?: number;
    hazardDimensions?: string;
    observationsCount?: number;
    busesObserving?: string[];
    notes?: string;
  };
  history?: {
    timestamp: string;
    action: string;
    by: string;
  }[];
}

export interface ConsolidatedRoadIssue {
  id: string;
  type: string;
  severity: Severity;
  latitude: number;
  longitude: number;
  firstReported: string;
  lastReported: string;
  sightingCount: number;
  reportingBuses: string[];
  confidence: 'High' | 'Medium' | 'Verified';
  status: 'OPEN' | 'SCHEDULED_REPAIR' | 'RESOLVED';
  roadName: string;
  evidence: string;
  dimensions?: string;
}

export interface TrafficMetric {
  totalVehicles: number;
  cars: number;
  buses: number;
  trucks: number;
  motorcycles: number;
  pedestrians: number;
  avgSpeed: number;
  congestionLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  densityScore: number;
  bottleneckCount: number;
}

export interface RouteDelayInfo {
  routeId: string;
  routeName: string;
  scheduledMinutes: number;
  actualMinutes: number;
  delayMinutes: number;
  avgSpeed: number;
  congestion: 'LOW' | 'MEDIUM' | 'HIGH';
  activeBuses: number;
}

export interface RoadConditionSegment {
  roadId: string;
  roadName: string;
  condition: 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';
  issueCount: number;
  lastSurveyed: string;
  busSightings: number;
  coordinates: [number, number][];
}

export interface ODMatrixPoint {
  origin: string;
  destination: string;
  tripCount: number;
  avgTravelTime: number; // mins
  congestionIndex: number;
}

export interface EdgeTrackedObject {
  id: number;
  class: 'car' | 'bus' | 'truck' | 'motorcycle' | 'bicycle' | 'pedestrian' | 'pothole' | 'waterlogging' | 'road_damage' | 'traffic_sign' | 'zebra_crossing' | 'road_divider';
  trackId: number;
  bbox: [number, number, number, number]; // x, y, w, h
  speedKmH: number;
  direction: string;
  confidence: number;
  plateNumber?: string;
  plateConfidence?: number;
  isViolation?: boolean;
  violationReason?: string;
}

export interface UploadedVideoMetadata {
  fileName: string;
  fileSize: string;
  duration: number; // seconds
  durationFormatted: string; // MM:SS
  fps: number;
  totalFrames: number;
  framesAnalyzed: number;
  resolution: string;
}

export interface VideoRoadIssueDetection {
  id: string; // e.g. RD-UPLOAD-001
  timestamp: string; // e.g. 00:34
  timestampSec: number;
  type: string; // Pothole, Road Damage, Waterlogging, Road crack, etc.
  confidence: number; // e.g. 91.5
  severity: Severity; // LOW, MEDIUM, HIGH, CRITICAL
  description: string;
  evidenceFrame: string; // Base64 data URL from actual uploaded video
  bbox?: [number, number, number, number];
  latitude?: number;
  longitude?: number;
  locationName?: string;
}

export interface GpsTelemetryPoint {
  timestamp_sec: number;
  latitude: number;
  longitude: number;
  locationName?: string;
}

export interface VideoVehicleCounts {
  uniqueVehicles: number;
  cars: number;
  buses: number;
  trucks: number;
  motorcycles: number;
  bicycles: number;
  pedestrians: number;
}

export interface VideoANPRDetection {
  id: string;
  plateNumber: string; // e.g. "TN 38 AB 1234" or "Number plate detected but unreadable"
  readable: boolean;
  confidence: number;
  timestamp: string; // e.g. 00:52
  timestampSec: number;
  stateOrRegion?: string;
  evidenceFrame: string; // Base64 crop or frame from actual uploaded video
  vehicleClass?: string;
  // Stage 4: Offending vehicle binding
  trackId?: number;
  offendingVehicle?: boolean;
  incidentType?: 'HIT_AND_RUN' | 'RASH_DRIVING';
  latitude?: number;
  longitude?: number;
  locationName?: string;
  speedRecorded?: number;
}

/** Stage 4: Safety incident record for hit-and-run and rash driving */
export interface OffendingVehicleIncident {
  id: string;
  incidentType: 'HIT_AND_RUN' | 'RASH_DRIVING';
  category: 'SAFETY';
  type: string;
  severity: 'CRITICAL' | 'HIGH';
  trackId: number;
  vehicleClass: string;
  confidence: number;
  plateNumber: string;
  rawPlateNumber: string;
  plateConfidence: number;
  isPlateReadable: boolean;
  stateOrRegion: string;
  timestamp: string;
  timestampSec: number;
  timestampFormatted: string;
  realTimestamp: string;
  latitude: number;
  longitude: number;
  locationName: string;
  speedRecorded: number;
  busId: string;
  evidenceFrame: string;
  trajectorySummary: string;
  details: string;
  status: string;
  assignedDepartment: string;
}

export interface SafetyIncidentSummary {
  totalSafetyIncidents: number;
  hitAndRunCount: number;
  rashDrivingCount: number;
  offenderTrackIds: number[];
  incidents: OffendingVehicleIncident[];
}

export interface VideoTrafficAnalysis {
  vehicleCount: number;
  avgVehiclesPerSampledFrame: number;
  vehicleCategories: { category: string; count: number }[];
  trafficDensity: 'VERY_LOW' | 'LOW' | 'MODERATE' | 'MEDIUM' | 'HIGH' | 'SEVERE';
  congestionLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  isReliable: boolean;
  notes?: string;
}

export interface VideoTimelineEvent {
  timestamp: string;
  timestampSec: number;
  category: 'HAZARD' | 'VEHICLE' | 'PEDESTRIAN' | 'ANPR' | 'TRAFFIC' | 'SAFETY';
  title: string;
  details: string;
  confidence: number;
  evidenceFrame?: string;
}

export interface FrameBoundingBox {
  id: string;
  class: 'pothole' | 'car' | 'bus' | 'truck' | 'motorcycle' | 'bicycle' | 'person' | 'anpr' | 'road_damage' | 'waterlogging';
  label: string; // e.g. "POTHOLE 92%", "CAR 96%", "PERSON 88%", "PLATE: KA 01 MJ 8821" or "Plate detected — unreadable"
  confidence: number;
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  width: number; // 0..1 normalized
  height: number; // 0..1 normalized
  color: string;
  plateNumber?: string;
  isReadable?: boolean;
}

export interface VideoFrameAnalysis {
  timestamp: string;
  timestampSec: number;
  frameIndex: number;
  frameDataUrl: string;
  annotatedFrameDataUrl?: string;
  detections: FrameBoundingBox[];
}

export interface SampledFrameData {
  timestamp: string;
  timestampSec: number;
  frameIndex: number;
  frameDataUrl: string;
  detections?: FrameBoundingBox[];
  annotatedFrameDataUrl?: string;
}

export interface TrackSummary {
  track_id: number;
  class: string;
  trajectory: { frameIndex: number; centerX: number; centerY: number }[];
  relativeMotionScore: number;
}

export interface TrackingReport {
  tracker: string;
  activeVehicles: number;
  activeVehiclesAvg: number;
  uniqueVehiclesSeen: number;
  vehicleCounts: { car: number; motorcycle: number; bus: number; truck: number };
  trafficDensity: 'LOW' | 'MEDIUM' | 'HIGH';
  congestionLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  relativeMotionScorePixels: number;
  roiConfig: { x_min: number; y_min: number; x_max: number; y_max: number };
  limitations: string;
}

export interface HazardIncidentRecord {
  id: string;
  type: string; // 'pothole' | 'waterlogging' | 'road_damage' | 'traffic_sign' | string
  confidence: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  timestamp: number;
  timestampFormatted?: string;
  frameIndex: number;
  bboxPixels: [number, number, number, number];
  center: [number, number];
  busId: string;
  status: 'NEW' | 'ACKNOWLEDGED' | 'RESOLVED';
  evidenceFrameDataUrl?: string;
  location: {
    latitude: number | null;
    longitude: number | null;
  };
  observationCount?: number;
  lastSeenTimestamp?: number;
  lastSeenFrameIndex?: number;
}

export interface VideoHazardsReport {
  hazardModelAvailable: boolean;
  modelPath?: string | null;
  totalDetected: number;
  activeIncidents: number;
  byType: {
    pothole: number;
    waterlogging: number;
    road_damage: number;
    traffic_sign: number;
  };
  bySeverity: {
    high: number;
    medium: number;
    low: number;
  };
  incidents: HazardIncidentRecord[];
}

export interface UploadedVideoReport {
  id: string;
  mode: 'UPLOADED VIDEO ANALYSIS';
  // Stage 2: engine string includes ByteTrack info; use string not a narrow union
  inferenceEngine: string;
  isRealModelInference: boolean;
  generatedAt: string;
  processingTimeMs: number;
  video: UploadedVideoMetadata;
  roadIssues: VideoRoadIssueDetection[];
  vehicleCounts: VideoVehicleCounts;
  trafficAnalysis: VideoTrafficAnalysis;
  anprResults: VideoANPRDetection[];
  detectionTimeline: VideoTimelineEvent[];
  summary: string;
  sampledFrames: SampledFrameData[];
  processedFrames: VideoFrameAnalysis[];
  // Stage 2 optional fields (absent in Stage 1 Gemini path)
  tracking?: TrackingReport;
  tracks?: TrackSummary[];
  // Stage 3 optional fields
  hazards?: VideoHazardsReport;
  // Stage 4 optional fields: offending vehicle incidents & ANPR
  safetyIncidents?: OffendingVehicleIncident[];
  safetySummary?: SafetyIncidentSummary;
}

export interface MultiVideoSlot {
  slotId: number; // 1, 2, 3, 4
  assignedBusId: string;
  assignedRouteId: string;
  assignedRouteName: string;
  videoFile: File | null;
  videoUrl: string | null;
  gpsCsvFile?: File | null;
  gpsCsvContent?: string | null;
  videoMetadata?: UploadedVideoMetadata;
  status: 'IDLE' | 'LOADING' | 'EXTRACTING' | 'ANALYZING' | 'COMPLETED' | 'ERROR';
  progress: number;
  report: UploadedVideoReport | null;
  congestionAnalysis?: RouteCongestionAnalysis;
  errorMessage?: string;
}

export interface RouteCongestionAnalysis {
  slotId: number;
  busId: string;
  routeId: string;
  routeName: string;
  corridorName: string;
  totalVehicles: number;
  vehiclesPerFrameAvg: number;
  vehicleBreakdown: {
    cars: number;
    buses: number;
    trucks: number;
    motorcycles: number;
    bicycles: number;
    pedestrians: number;
  };
  congestionLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  densityScore: number; // 0 to 100
  avgOperatingSpeedKmH: number;
  estimatedDelayMinutes: number;
  bottleneckDetected: boolean;
  bottleneckLocation?: string;
  recommendedAction: string;
}

export interface MultiVideoFleetCongestionSummary {
  totalVideosAnalyzed: number;
  totalVehiclesDetected: number;
  avgCityCongestionScore: number;
  overallCongestionLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  highestCongestionRoute: string;
  criticalBottlenecksCount: number;
  routesAnalyzed: RouteCongestionAnalysis[];
  timestamp: string;
}



