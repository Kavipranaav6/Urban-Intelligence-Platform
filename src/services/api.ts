import {
  Bus,
  UrbanEvent,
  ConsolidatedRoadIssue,
  RouteDelayInfo,
  ODMatrixPoint,
  TrafficMetric,
  RoadConditionSegment,
  UploadedVideoMetadata,
  SampledFrameData,
  UploadedVideoReport,
  RouteCongestionAnalysis,
  MultiVideoFleetCongestionSummary
} from '../types';

export interface OverviewStats {
  totalBuses: number;
  activeBuses: number;
  camerasOnline: number;
  totalCameras: number;
  roadIssuesDetected: number;
  trafficAlerts: number;
  safetyAlerts: number;
  highSeverity: number;
  avgCongestion: string;
  eventsToday: number;
  bandwidthSaved: string;
  edgeProcessingActive: boolean;
}

export interface EdgeProcessResponse {
  pipelineStatus: string;
  mode: string;
  edgeComputer: string;
  frameAnalysis: {
    fps: number;
    latencyMs: number;
    resolution: string;
    detectedObjectsCount: number;
  };
  yoloDetections: string[];
  byteTrack: Array<{
    id: number;
    class: string;
    trackId: number;
    bbox: [number, number, number, number];
    speedKmH: number;
    direction: string;
    confidence: number;
    plateNumber?: string;
    plateConfidence?: number;
    isViolation?: boolean;
    violationReason?: string;
  }>;
  anprOcr: {
    rawText: string;
    cleanedPlate: string;
    confidence: number;
    stateCode: string;
    districtRto: string;
  };
  generatedEvent: UrbanEvent;
  fusedIssue?: ConsolidatedRoadIssue;
  bandwidthOptimization: {
    rawVideoSize: string;
    transmittedPayloadSize: string;
    bandwidthSavedPct: string;
  };
}

export const api = {
  // ML Service Health
  async getMlServiceHealth(): Promise<{ online: boolean; device_info?: any; model?: string }> {
    try {
      const res = await fetch('/api/ml/health');
      if (!res.ok) return { online: false };
      return res.json();
    } catch {
      return { online: false };
    }
  },

  // Stats
  async getStats(): Promise<OverviewStats> {
    const res = await fetch('/api/stats');
    if (!res.ok) throw new Error('Failed to fetch overview stats');
    return res.json();
  },

  // Buses
  async getBuses(): Promise<Bus[]> {
    const res = await fetch('/api/buses');
    if (!res.ok) throw new Error('Failed to fetch buses');
    return res.json();
  },

  async getBus(id: string): Promise<Bus> {
    const res = await fetch(`/api/buses/${id}`);
    if (!res.ok) throw new Error(`Failed to fetch bus ${id}`);
    return res.json();
  },

  // Simulation
  async getSimulationStatus(): Promise<{ simulationActive: boolean }> {
    const res = await fetch('/api/simulation/status');
    return res.json();
  },

  async toggleSimulation(): Promise<{ simulationActive: boolean }> {
    const res = await fetch('/api/simulation/toggle', { method: 'POST' });
    return res.json();
  },

  async simulateStep(): Promise<{ movedBuses: Bus[]; generatedEvent?: UrbanEvent }> {
    const res = await fetch('/api/buses/simulate-step', { method: 'POST' });
    return res.json();
  },

  // Events
  async getEvents(params?: { category?: string; severity?: string; status?: string; busId?: string; search?: string }): Promise<UrbanEvent[]> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val) searchParams.append(key, val);
      });
    }
    const res = await fetch(`/api/events?${searchParams.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch events');
    return res.json();
  },

  async getEvent(id: string): Promise<UrbanEvent> {
    const res = await fetch(`/api/events/${id}`);
    if (!res.ok) throw new Error(`Failed to fetch event ${id}`);
    return res.json();
  },

  async createEvent(event: Partial<UrbanEvent>): Promise<{ event: UrbanEvent; fusedWithConsolidated?: ConsolidatedRoadIssue }> {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });
    if (!res.ok) throw new Error('Failed to create event');
    return res.json();
  },

  async updateEventStatus(id: string, status: UrbanEvent['status'], department?: string): Promise<UrbanEvent> {
    const res = await fetch(`/api/events/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, department })
    });
    if (!res.ok) throw new Error(`Failed to update status for ${id}`);
    return res.json();
  },

  // Road Issues (Multi-bus fused)
  async getRoadIssues(): Promise<ConsolidatedRoadIssue[]> {
    const res = await fetch('/api/road-issues');
    if (!res.ok) throw new Error('Failed to fetch road issues');
    return res.json();
  },

  // Traffic
  async getTraffic(): Promise<{
    metrics: TrafficMetric;
    hourly: Array<{ time: string; vehicles: number; avgSpeed: number; congestion: number }>;
    bottlenecks: Array<{ name: string; level: string; avgSpeed: number; queueLengthMeters: number }>;
  }> {
    const res = await fetch('/api/traffic');
    if (!res.ok) throw new Error('Failed to fetch traffic metrics');
    return res.json();
  },

  // Safety
  async getSafetyEvents(): Promise<UrbanEvent[]> {
    const res = await fetch('/api/safety');
    if (!res.ok) throw new Error('Failed to fetch safety events');
    return res.json();
  },

  // Infrastructure
  async getInfrastructure(): Promise<{
    roadSegments: RoadConditionSegment[];
    missingInfrastructure: UrbanEvent[];
  }> {
    const res = await fetch('/api/infrastructure');
    if (!res.ok) throw new Error('Failed to fetch infrastructure info');
    return res.json();
  },

  // Routes Delay & OD Matrix
  async getRoutes(): Promise<{
    routeDelays: RouteDelayInfo[];
    odMatrix: ODMatrixPoint[];
  }> {
    const res = await fetch('/api/routes');
    if (!res.ok) throw new Error('Failed to fetch route analytics');
    return res.json();
  },

  // Edge AI Processing (Demo)
  async runEdgeAI(busId: string, cameraId: string): Promise<EdgeProcessResponse> {
    const res = await fetch('/api/edge/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ busId, cameraId })
    });
    if (!res.ok) throw new Error('Failed to execute Edge AI inference');
    return res.json();
  },

  // Uploaded Video AI Analysis (Real Dynamic Processing)
  async analyzeUploadedVideo(
    videoMetadata: UploadedVideoMetadata,
    sampledFrames: SampledFrameData[],
    busId?: string,
    gpsCsvContent?: string
  ): Promise<{ report: UploadedVideoReport; ingestedEvents: UrbanEvent[] }> {
    const res = await fetch('/api/video/analyze-frames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoMetadata, sampledFrames, busId, gpsCsvContent })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let errorMsg = `HTTP ${res.status}: Failed to analyze video frames`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error || parsed.message) errorMsg = parsed.error || parsed.message;
      } catch (_) {
        if (errText && errText.length < 200) errorMsg = errText;
      }
      throw new Error(errorMsg);
    }
    return res.json();
  },

  // Batch Multi-Video Analysis (e.g. 4 videos mapped to 4 buses & routes for traffic congestion)
  async analyzeMultiVideos(
    slots: Array<{
      slotId: number;
      busId: string;
      videoMetadata: UploadedVideoMetadata;
      sampledFrames: SampledFrameData[];
      gpsCsvContent?: string;
    }>
  ): Promise<{
    success: boolean;
    results: Array<{
      slotId: number;
      busId: string;
      routeId: string;
      routeName: string;
      report: UploadedVideoReport;
      congestionAnalysis: RouteCongestionAnalysis;
    }>;
    fleetSummary: MultiVideoFleetCongestionSummary;
  }> {
    const res = await fetch('/api/video/analyze-multi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slots })
    });
    if (!res.ok) throw new Error('Failed to analyze multi-video batch');
    return res.json();
  },

  // Run Complete Live Demo Story
  async runFullLiveDemo(): Promise<{
    success: boolean;
    message: string;
    event: UrbanEvent;
    fusedIssue?: ConsolidatedRoadIssue;
    stats: OverviewStats;
  }> {
    const res = await fetch('/api/demo/run-full-flow', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to execute live demo pipeline');
    return res.json();
  }
};
