import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { db, generateEvidenceSvg } from './server/mockDb';
import { UrbanEvent, RouteCongestionAnalysis, MultiVideoFleetCongestionSummary } from './src/types';
import { analyzeUploadedVideoFrames, computeRouteCongestion, calculateFleetCongestionSummary } from './server/videoAnalyzer';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Standard express json middleware
  app.use(express.json({ limit: '15mb' }));

  // API Health Check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'UrbanSense AI Central Intelligence Backend',
      version: '1.0.0-prototype',
      timestamp: new Date().toISOString()
    });
  });

  // Python ML Service Health Proxy
  app.get('/api/ml/health', async (req, res) => {
    const mlUrl = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';
    try {
      const response = await fetch(`${mlUrl}/health`);
      if (response.ok) {
        const data = await response.json();
        res.json({ online: true, ...data });
      } else {
        res.json({ online: false, status: 'error', code: response.status });
      }
    } catch (err: any) {
      res.json({ online: false, status: 'offline', message: err.message });
    }
  });

  // Overview Stats
  app.get('/api/stats', (req, res) => {
    res.json(db.getStats());
  });

  // Fleet / Buses
  app.get('/api/buses', (req, res) => {
    res.json(db.buses);
  });

  app.get('/api/buses/:id', (req, res) => {
    const bus = db.buses.find((b) => b.id.toUpperCase() === req.params.id.toUpperCase());
    if (!bus) {
      return res.status(404).json({ error: 'Bus not found' });
    }
    res.json(bus);
  });

  // Simulation controls
  app.get('/api/simulation/status', (req, res) => {
    res.json({ simulationActive: db.simulationActive });
  });

  app.post('/api/simulation/toggle', (req, res) => {
    db.simulationActive = !db.simulationActive;
    res.json({ simulationActive: db.simulationActive });
  });

  app.post('/api/buses/simulate-step', (req, res) => {
    const result = db.stepSimulation();
    res.json(result);
  });

  // Events API
  app.get('/api/events', (req, res) => {
    let filtered = [...db.events];
    const { category, severity, status, busId, search } = req.query;

    if (category && typeof category === 'string' && category !== 'ALL') {
      filtered = filtered.filter((e) => e.category === category);
    }
    if (severity && typeof severity === 'string' && severity !== 'ALL') {
      filtered = filtered.filter((e) => e.severity === severity);
    }
    if (status && typeof status === 'string' && status !== 'ALL') {
      filtered = filtered.filter((e) => e.status === status);
    }
    if (busId && typeof busId === 'string' && busId !== 'ALL') {
      filtered = filtered.filter((e) => e.busId === busId);
    }
    if (search && typeof search === 'string') {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.id.toLowerCase().includes(q) ||
          e.type.toLowerCase().includes(q) ||
          (e.locationName && e.locationName.toLowerCase().includes(q)) ||
          e.busId.toLowerCase().includes(q) ||
          (e.details?.plateNumber && e.details.plateNumber.toLowerCase().includes(q))
      );
    }

    res.json(filtered);
  });

  app.get('/api/events/:id', (req, res) => {
    const ev = db.events.find((e) => e.id.toUpperCase() === req.params.id.toUpperCase());
    if (!ev) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json(ev);
  });

  app.post('/api/events', (req, res) => {
    const eventData: UrbanEvent = req.body;
    if (!eventData.id) {
      eventData.id = `EV-${Math.floor(10000 + Math.random() * 90000)}`;
    }
    if (!eventData.timestamp) {
      eventData.timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    if (!eventData.status) {
      eventData.status = 'NEW';
    }
    if (!eventData.evidence) {
      eventData.evidence = generateEvidenceSvg(
        eventData.type || 'Detection',
        eventData.severity || 'HIGH',
        eventData.busId || 'BUS-103',
        eventData.cameraId || 'CAM-103-FRONT',
        eventData.id
      );
    }

    const result = db.addEvent(eventData);
    res.status(201).json(result);
  });

  // Clear events (for zero-pin recording state)
  app.post('/api/events/clear', (req, res) => {
    db.clearEvents();
    res.json({ success: true, message: 'All events cleared', eventsCount: db.events.length });
  });

  app.post('/api/events/reset', (req, res) => {
    db.resetSeedData();
    res.json({ success: true, message: 'Seed events restored', eventsCount: db.events.length, roadIssuesCount: db.roadIssues.length });
  });

  app.delete('/api/events', (req, res) => {
    db.clearEvents();
    res.json({ success: true, message: 'All events cleared', eventsCount: db.events.length });
  });

  // Update Event / Alert Status
  app.patch('/api/events/:id/status', (req, res) => {
    const { status, department } = req.body;
    const updated = db.updateEventStatus(req.params.id, status, department);
    if (!updated) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json(updated);
  });

  // Road Issues (Consolidated with Multi-bus Sightings)
  app.get('/api/road-issues', (req, res) => {
    res.json(db.roadIssues);
  });

  // Traffic Analytics
  app.get('/api/traffic', (req, res) => {
    res.json({
      metrics: db.trafficMetrics,
      hourly: [
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
      ],
      bottlenecks: [
        { name: 'Gandhipuram Central Cross', level: 'CRITICAL', avgSpeed: 8, queueLengthMeters: 420 },
        { name: 'Lakshmi Mills Junction', level: 'HIGH', avgSpeed: 14, queueLengthMeters: 280 },
        { name: 'Hope College Arterial Meridian', level: 'HIGH', avgSpeed: 16, queueLengthMeters: 250 },
        { name: 'Trichy Road Underpass', level: 'MEDIUM', avgSpeed: 22, queueLengthMeters: 140 }
      ]
    });
  });

  // Safety events
  app.get('/api/safety', (req, res) => {
    const safetyEvents = db.events.filter((e) => e.category === 'SAFETY');
    res.json(safetyEvents);
  });

  // Infrastructure & Road condition maps
  app.get('/api/infrastructure', (req, res) => {
    res.json({
      roadSegments: db.roadSegments,
      missingInfrastructure: db.events.filter((e) => e.category === 'INFRASTRUCTURE')
    });
  });

  // Routes Delay Performance & OD Matrix
  app.get('/api/routes', (req, res) => {
    res.json({
      routeDelays: db.routeDelays,
      odMatrix: db.odMatrix
    });
  });

  // Edge AI Processing Pipeline Simulation Endpoint
  // Implements: Video Input -> OpenCV frame -> YOLO Object Detection -> ByteTrack Tracking -> OCR/ANPR -> Rule-based Trajectory -> Event Creation
  app.post('/api/edge/process', (req, res) => {
    const { busId = 'BUS-103', cameraId = 'CAM-103-FRONT', detectionMode = 'ALL_SURVEILLANCE' } = req.body;
    const bus = db.buses.find((b) => b.id === busId) || db.buses[2];

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Edge simulated detections (YOLOv8 + ByteTrack + OCR)
    const trackedObjects = [
      {
        id: 17,
        class: 'car',
        trackId: 17,
        bbox: [350, 160, 150, 135],
        speedKmH: 48,
        direction: 'North-East',
        confidence: 94.8,
        plateNumber: 'TN 38 AB 1234',
        plateConfidence: 91.2,
        isViolation: true,
        violationReason: 'Dangerous proximity / unsafe lane cut'
      },
      {
        id: 21,
        class: 'car',
        trackId: 21,
        bbox: [120, 210, 110, 95],
        speedKmH: 31,
        direction: 'Northbound',
        confidence: 92.1
      },
      {
        id: 8,
        class: 'pothole',
        trackId: 8,
        bbox: [190, 225, 140, 75],
        speedKmH: 0,
        direction: 'Road Surface',
        confidence: 94.2
      },
      {
        id: 34,
        class: 'pedestrian',
        trackId: 34,
        bbox: [520, 180, 45, 110],
        speedKmH: 4,
        direction: 'Curb Walking',
        confidence: 89.6
      }
    ];

    // Generate structured event
    const newEventId = `RD-${Math.floor(10000 + Math.random() * 90000)}`;
    const event: UrbanEvent = {
      id: newEventId,
      category: 'ROAD_HAZARD',
      type: 'Pothole',
      confidence: 94.2,
      severity: 'HIGH',
      busId: bus.id,
      cameraId: cameraId,
      latitude: bus.lat,
      longitude: bus.lng,
      timestamp: `Today, ${timestamp}`,
      locationName: `${bus.routeName} Segment`,
      status: 'NEW',
      assignedDepartment: 'Highways & PWD Civil Wing',
      evidence: generateEvidenceSvg('Pothole', 'HIGH', bus.id, cameraId, newEventId),
      details: {
        hazardDimensions: '0.9m width x 1.2m length x 8.5cm depth',
        observationsCount: 1,
        busesObserving: [bus.id],
        notes: 'Edge AI YOLOv8 model detected surface pavement depression. ByteTrack confirmed stationary location across 42 consecutive frames.'
      }
    };

    // Store in backend database & perform multi-bus fusion
    const dbResult = db.addEvent(event);

    res.json({
      pipelineStatus: 'COMPLETE',
      mode: 'DEMO AI PROCESSING',
      edgeComputer: 'Mobile Bus On-Board Unit (simulated)',
      frameAnalysis: {
        fps: 29.8,
        latencyMs: 34,
        resolution: '1920x1080',
        detectedObjectsCount: trackedObjects.length
      },
      yoloDetections: ['car', 'car', 'pothole', 'pedestrian'],
      byteTrack: trackedObjects,
      anprOcr: {
        rawText: 'TN38AB1234',
        cleanedPlate: 'TN 38 AB 1234',
        confidence: 91.2,
        stateCode: 'TN (Tamil Nadu)',
        districtRto: '38 (Coimbatore North)'
      },
      generatedEvent: dbResult.event,
      fusedIssue: dbResult.fusedWithConsolidated,
      bandwidthOptimization: {
        rawVideoSize: '450 MB (8 min buffer)',
        transmittedPayloadSize: '14.2 KB (JSON metadata + 1 evidence frame)',
        bandwidthSavedPct: '99.99%'
      }
    });
  });

// GPS CSV parser helper for video upload telemetry
function parseGpsCsv(csvContent: string): Array<{ timestamp_sec: number; latitude: number; longitude: number; locationName?: string }> {
  if (!csvContent || typeof csvContent !== 'string') return [];
  const lines = csvContent.trim().split(/\r?\n/);
  if (lines.length === 0) return [];

  const rawEntries: Array<{ ts: number; lat: number; lng: number }> = [];
  let headerIndex: { ts: number; lat: number; lng: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.startsWith('#')) continue;
    const parts = rawLine.split(',').map((p) => p.trim());
    if (parts.length < 3) continue;

    // Detect header row
    const lowerParts = parts.map((p) => p.toLowerCase());

    // Priority 1: explicit relative elapsed seconds (e.g. Sensor Logger 'seconds_elapsed')
    let tsIdx = lowerParts.findIndex((p) =>
      p === 'seconds_elapsed' ||
      p === 'elapsed_seconds' ||
      p === 'timestamp_sec' ||
      p === 'time_sec' ||
      p === 'elapsed_sec' ||
      p === 'elapsed' ||
      p === 'offset_sec' ||
      p === 'rel_time' ||
      p === 'sec' ||
      p === 'seconds'
    );
    // Priority 2: generic time or timestamp
    if (tsIdx === -1) {
      tsIdx = lowerParts.findIndex((p) =>
        p === 'time' ||
        p === 'timestamp' ||
        p === 'datetime' ||
        p === 'date_time' ||
        p === 't' ||
        p.includes('timestamp') ||
        p.includes('time')
      );
    }

    // Latitude: exact or word boundary, avoid 'altitude' or accuracy headers
    const latIdx = lowerParts.findIndex((p) =>
      p === 'latitude' || p === 'lat' || (p.includes('lat') && !p.includes('alt') && !p.includes('acc'))
    );

    // Longitude: longitude, lng, lon
    const lngIdx = lowerParts.findIndex((p) =>
      p === 'longitude' || p === 'lng' || p === 'lon' || ((p.includes('long') || p.includes('lon')) && !p.includes('acc'))
    );

    if (tsIdx !== -1 && latIdx !== -1 && lngIdx !== -1 && headerIndex === null) {
      headerIndex = { ts: tsIdx, lat: latIdx, lng: lngIdx };
      continue;
    }

    const tCol = headerIndex ? headerIndex.ts : 0;
    const latCol = headerIndex ? headerIndex.lat : 1;
    const lngCol = headerIndex ? headerIndex.lng : 2;

    const rawTsStr = parts[tCol];
    let ts = parseFloat(rawTsStr);
    let lat = parseFloat(parts[latCol]);
    let lng = parseFloat(parts[lngCol]);

    // Support ISO date strings e.g. 2024-05-10T12:00:00Z
    if (isNaN(ts) && rawTsStr && rawTsStr.includes(':')) {
      const parsedDate = Date.parse(rawTsStr);
      if (!isNaN(parsedDate)) {
        ts = parsedDate / 1000;
      }
    }

    // Sanity check lat/lng bounds (swap if misplaced)
    if (!isNaN(lat) && !isNaN(lng)) {
      if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
        const tmp = lat;
        lat = lng;
        lng = tmp;
      }
    }

    if (!isNaN(ts) && !isNaN(lat) && !isNaN(lng)) {
      rawEntries.push({ ts, lat, lng });
    }
  }

  if (rawEntries.length === 0) return [];

  // Sort by timestamp
  rawEntries.sort((a, b) => a.ts - b.ts);

  // Auto-detect epoch timestamps and normalize to 0.0s relative
  const firstTs = rawEntries[0].ts;
  let scale = 1.0;
  let normalizeToZero = false;

  // Nanoseconds epoch (e.g. ~1.79e18 from Sensor Logger 'time' column)
  if (firstTs > 1e14) {
    scale = 1e-9;
    normalizeToZero = true;
  } else if (firstTs > 1e11) {
    // Milliseconds epoch (e.g. ~1.7e12)
    scale = 1e-3;
    normalizeToZero = true;
  } else if (firstTs > 1e7) {
    // Seconds epoch (e.g. ~1.7e9)
    scale = 1.0;
    normalizeToZero = true;
  }

  const results: Array<{ timestamp_sec: number; latitude: number; longitude: number; locationName?: string }> = [];
  const baseTs = normalizeToZero ? firstTs * scale : 0.0;

  for (const entry of rawEntries) {
    const relativeSec = normalizeToZero ? (entry.ts * scale - baseTs) : entry.ts;
    results.push({
      timestamp_sec: Math.max(0, Number(relativeSec.toFixed(2))),
      latitude: Number(entry.lat.toFixed(6)),
      longitude: Number(entry.lng.toFixed(6)),
      locationName: `GPS Telemetry (${entry.lat.toFixed(4)}, ${entry.lng.toFixed(4)})`
    });
  }

  return results;
}

function interpolateGpsPoint(
  timestampSec: number,
  gpsTrace: Array<{ timestamp_sec: number; latitude: number; longitude: number; locationName?: string }>
): { latitude: number; longitude: number; locationName: string } {
  if (!gpsTrace || gpsTrace.length === 0) {
    return { latitude: 11.0168, longitude: 76.97, locationName: 'Coimbatore Municipal Area' };
  }
  if (gpsTrace.length === 1 || timestampSec <= gpsTrace[0].timestamp_sec) {
    return {
      latitude: gpsTrace[0].latitude,
      longitude: gpsTrace[0].longitude,
      locationName: gpsTrace[0].locationName || `GPS (${gpsTrace[0].latitude.toFixed(4)}, ${gpsTrace[0].longitude.toFixed(4)})`
    };
  }
  const last = gpsTrace[gpsTrace.length - 1];
  if (timestampSec >= last.timestamp_sec) {
    return {
      latitude: last.latitude,
      longitude: last.longitude,
      locationName: last.locationName || `GPS (${last.latitude.toFixed(4)}, ${last.longitude.toFixed(4)})`
    };
  }
  for (let i = 0; i < gpsTrace.length - 1; i++) {
    const p1 = gpsTrace[i];
    const p2 = gpsTrace[i + 1];
    if (p1.timestamp_sec <= timestampSec && timestampSec <= p2.timestamp_sec) {
      const span = p2.timestamp_sec - p1.timestamp_sec;
      const alpha = span > 0 ? (timestampSec - p1.timestamp_sec) / span : 0;
      const lat = Number((p1.latitude + alpha * (p2.latitude - p1.latitude)).toFixed(6));
      const lng = Number((p1.longitude + alpha * (p2.longitude - p1.longitude)).toFixed(6));
      return {
        latitude: lat,
        longitude: lng,
        locationName: p1.locationName || `GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`
      };
    }
  }
  return {
    latitude: last.latitude,
    longitude: last.longitude,
    locationName: last.locationName || `GPS (${last.latitude.toFixed(4)}, ${last.longitude.toFixed(4)})`
  };
}

  // Uploaded Video AI Analysis Endpoint
  // Receives extracted video metadata and sampled base64 frames from real client video
  app.post('/api/video/analyze-frames', async (req, res) => {
    try {
      const { videoMetadata, sampledFrames, ingestToGis = true, busId = 'BUS-103', gpsCsvContent, gpsTrace } = req.body;
      if (!videoMetadata || !sampledFrames || !Array.isArray(sampledFrames)) {
        return res.status(400).json({ error: 'Missing videoMetadata or sampledFrames array' });
      }

      let parsedGpsTrace = Array.isArray(gpsTrace) ? gpsTrace : [];
      if (typeof gpsCsvContent === 'string' && gpsCsvContent.trim()) {
        const fromCsv = parseGpsCsv(gpsCsvContent);
        if (fromCsv.length > 0) {
          parsedGpsTrace = fromCsv;
        }
      }

      const report = await analyzeUploadedVideoFrames(videoMetadata, sampledFrames, busId, parsedGpsTrace);

      // Ingest detected road issues into GIS database with actual evidence frame from the uploaded video
      const bus = db.buses.find((b) => b.id === busId) || db.buses[0];
      if (parsedGpsTrace.length > 0) {
        bus.lat = parsedGpsTrace[0].latitude;
        bus.lng = parsedGpsTrace[0].longitude;
        bus.routeWaypoints = parsedGpsTrace.map((pt) => [pt.latitude, pt.longitude] as [number, number]);
        bus.routeName = `Route - ${parsedGpsTrace[0].locationName || 'GPS Survey Corridor'}`;
      }
      const ingestedEvents: UrbanEvent[] = [];

      if (ingestToGis && report.roadIssues && report.roadIssues.length > 0) {
        report.roadIssues.forEach((issue) => {
          let issueLat = (issue as any).latitude;
          let issueLng = (issue as any).longitude;
          let issueLoc = (issue as any).locationName;

          if (parsedGpsTrace.length > 0) {
            const gpsPt = interpolateGpsPoint(issue.timestampSec || 0, parsedGpsTrace);
            issueLat = gpsPt.latitude;
            issueLng = gpsPt.longitude;
            issueLoc = gpsPt.locationName;
            (issue as any).latitude = issueLat;
            (issue as any).longitude = issueLng;
            (issue as any).locationName = issueLoc;
          } else {
            issueLat = issueLat || Number((bus.lat + (Math.random() - 0.5) * 0.004).toFixed(6));
            issueLng = issueLng || Number((bus.lng + (Math.random() - 0.5) * 0.004).toFixed(6));
            issueLoc = issueLoc || `Uploaded Video Survey (${videoMetadata.fileName})`;
          }

          const newEvent: UrbanEvent = {
            id: issue.id,
            category: 'ROAD_HAZARD',
            type: issue.type,
            confidence: issue.confidence,
            severity: issue.severity,
            busId: bus.id,
            cameraId: 'CAM-UPLOAD-FEED',
            latitude: issueLat,
            longitude: issueLng,
            timestamp: `Video Time ${issue.timestamp}`,
            locationName: issueLoc,
            status: 'NEW',
            assignedDepartment: 'Highways & PWD Civil Wing',
            evidence: issue.evidenceFrame, // ACTUAL frame from uploaded video!
            details: {
              hazardDimensions: 'Visual detection from uploaded footage',
              observationsCount: 1,
              busesObserving: [bus.id],
              notes: `${issue.description} [Inference: ${report.inferenceEngine}]`
            }
          };

          const addRes = db.addEvent(newEvent);
          ingestedEvents.push(addRes.event);
        });
      }

      // Ingest detected offending vehicle safety incidents (Hit-and-Run / Rash Driving)
      const safetyIncidents = (report as any).safetyIncidents || [];
      if (ingestToGis && safetyIncidents.length > 0) {
        safetyIncidents.forEach((inc: any) => {
          const isRash = inc.incidentType === 'RASH_DRIVING' || (inc.type && inc.type.toLowerCase().includes('rash'));
          let eventId = inc.id || (isRash ? `RASH-${inc.trackId ?? String(Date.now()).slice(-4)}` : `SF-${inc.trackId ?? String(Date.now()).slice(-4)}`);
          if (isRash && !eventId.startsWith('RASH-')) {
            eventId = `RASH-${inc.trackId ?? String(Date.now()).slice(-4)}`;
          }

          let incLat = inc.latitude;
          let incLng = inc.longitude;
          let incLoc = inc.locationName;

          if (parsedGpsTrace.length > 0) {
            const gpsPt = interpolateGpsPoint(inc.timestampSec || 0, parsedGpsTrace);
            incLat = gpsPt.latitude;
            incLng = gpsPt.longitude;
            incLoc = gpsPt.locationName;
            inc.latitude = incLat;
            inc.longitude = incLng;
            inc.locationName = incLoc;
          } else {
            incLat = incLat || Number((bus.lat + (Math.random() - 0.5) * 0.003).toFixed(6));
            incLng = incLng || Number((bus.lng + (Math.random() - 0.5) * 0.003).toFixed(6));
            incLoc = incLoc || `Uploaded Video — ${videoMetadata.fileName}`;
          }

          const safetyEvent: UrbanEvent = {
            id: eventId,
            category: 'SAFETY',
            type: inc.type || (isRash ? 'Potential Rash Driving' : 'Hit-and-Run Incident'),
            confidence: Number((inc.confidence || 93.5).toFixed(1)),
            severity: inc.severity || (isRash ? 'HIGH' : 'CRITICAL'),
            busId: inc.busId || bus.id,
            cameraId: 'CAM-UPLOAD-FEED',
            latitude: incLat,
            longitude: incLng,
            timestamp: `Video Time ${inc.timestamp || '00:00'}`,
            locationName: incLoc,
            status: 'NEW',
            assignedDepartment: 'City Traffic Police Enactment Unit',
            evidence: inc.evidenceFrame || generateEvidenceSvg('rash', inc.severity || 'CRITICAL', bus.id, 'CAM-UPLOAD-FEED', eventId),
            details: {
              plateNumber: inc.plateNumber || undefined,
              plateConfidence: inc.plateConfidence ? Number(inc.plateConfidence.toFixed(1)) : undefined,
              speedRecorded: inc.speedRecorded,
              vehicleClass: inc.vehicleClass,
              trackId: inc.trackId,
              notes: inc.details || `Offending vehicle tracked and ANPR-extracted from uploaded video footage. [Inference: ${report.inferenceEngine}]`
            },
            history: [
              { timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), action: `${inc.type || 'Safety Incident'} detected (${eventId})`, by: 'ByteTrack + Incident Detection Stage 4' }
            ]
          };

          const addRes = db.addEvent(safetyEvent);
          ingestedEvents.push(addRes.event);
        });
      }

      // Ingest resolved ANPR plate reads as distinct ANPR-xxxx pins with cross-track reconciliation
      const rawAnprResults = (report as any).anprResults || [];
      if (ingestToGis && rawAnprResults.length > 0) {
        // Filter to readable ANPR plate reads or visual plate candidate crops
        const readableAnpr = rawAnprResults.filter((anpr: any) => {
          return anpr.readable || Boolean(anpr.evidenceFrame) || (anpr.plateNumber && !anpr.plateNumber.toLowerCase().includes('unreadable') && anpr.confidence > 25);
        });

        // Cross-track candidate duplicate matcher: checks if two plate strings share state, district, and 4-digit number with series distance <= 1
        const areCandidateDuplicatePlates = (p1: string, p2: string): boolean => {
          if (!p1 || !p2) return false;
          const clean1 = p1.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
          const clean2 = p2.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
          if (clean1 === clean2) return true;
          const m1 = clean1.match(/^([A-Z]{2})([0-9]{1,2})([A-Z]{1,3})([0-9]{4})$/);
          const m2 = clean2.match(/^([A-Z]{2})([0-9]{1,2})([A-Z]{1,3})([0-9]{4})$/);
          if (m1 && m2) {
            const [, s1, d1, ser1, n1] = m1;
            const [, s2, d2, ser2, n2] = m2;
            if (s1 === s2 && parseInt(d1, 10) === parseInt(d2, 10) && n1 === n2) {
              if (ser1.length === ser2.length) {
                let diffs = 0;
                for (let k = 0; k < ser1.length; k++) {
                  if (ser1[k] !== ser2[k]) diffs++;
                }
                return diffs <= 1;
              }
            }
          }
          return false;
        };

        // Cross-track reconciliation: Detect duplicates within short time window and close GPS proximity
        const suppressedIndices = new Set<number>();
        const reconciledAnpr: any[] = [];

        for (let i = 0; i < readableAnpr.length; i++) {
          if (suppressedIndices.has(i)) continue;
          let primary = { ...readableAnpr[i] };
          let pLat = primary.latitude;
          let pLng = primary.longitude;

          if (parsedGpsTrace.length > 0) {
            const gpsPt = interpolateGpsPoint(primary.timestampSec || 0, parsedGpsTrace);
            pLat = gpsPt.latitude;
            pLng = gpsPt.longitude;
            primary.latitude = pLat;
            primary.longitude = pLng;
            primary.locationName = gpsPt.locationName;
          } else {
            pLat = pLat || Number((bus.lat + ((primary.timestampSec || 1) * 0.000035)).toFixed(6));
            pLng = pLng || Number((bus.lng + ((primary.timestampSec || 1) * 0.000042)).toFixed(6));
          }

          for (let j = i + 1; j < readableAnpr.length; j++) {
            if (suppressedIndices.has(j)) continue;
            const cand = readableAnpr[j];
            let cLat = cand.latitude;
            let cLng = cand.longitude;

            if (parsedGpsTrace.length > 0) {
              const gpsPt = interpolateGpsPoint(cand.timestampSec || 0, parsedGpsTrace);
              cLat = gpsPt.latitude;
              cLng = gpsPt.longitude;
              cand.latitude = cLat;
              cand.longitude = cLng;
              cand.locationName = gpsPt.locationName;
            } else {
              cLat = cLat || Number((bus.lat + ((cand.timestampSec || 1) * 0.000035)).toFixed(6));
              cLng = cLng || Number((bus.lng + ((cand.timestampSec || 1) * 0.000042)).toFixed(6));
            }

            // Approximate spatial distance in meters
            const dMeters = Math.sqrt(Math.pow((cLat - pLat) * 111000, 2) + Math.pow((cLng - pLng) * 109000, 2));
            const timeDelta = Math.abs((primary.timestampSec || 0) - (cand.timestampSec || 0));

            if (dMeters <= 75 && timeDelta <= 20 && areCandidateDuplicatePlates(primary.plateNumber, cand.plateNumber)) {
              console.log(`[server.ts] Cross-track reconciliation: Merging duplicate ANPR tracks #${cand.trackId} and #${primary.trackId} ('${cand.plateNumber}' & '${primary.plateNumber}')`);
              // Combined evidence consensus:
              const plates = [primary.plateNumber, cand.plateNumber];
              const nlPlate = plates.find((p: string) => p && p.includes('NL'));
              if (nlPlate) {
                primary.plateNumber = nlPlate;
              }
              const classes = [primary.vehicleClass, cand.vehicleClass];
              if (classes.some((c: string) => c && c.toLowerCase().includes('car'))) {
                primary.vehicleClass = 'Car';
              }
              if (cand.evidenceFrame && cand.confidence > primary.confidence) {
                primary.evidenceFrame = cand.evidenceFrame;
              }
              primary.confidence = Number((((primary.confidence || 75.0) + (cand.confidence || 75.0)) / 2).toFixed(1));
              primary.totalVotes = (primary.totalVotes || 1) + (cand.totalVotes || 1);
              primary.mergedTrackIds = [primary.trackId, cand.trackId];
              primary.reconciled = true;
              suppressedIndices.add(j);
            }
          }
          reconciledAnpr.push(primary);
        }

        reconciledAnpr.forEach((anpr: any) => {
          const anprId = `ANPR-${anpr.trackId ?? String(Date.now()).slice(-4)}`;
          // Avoid duplicate ID if already added
          if (ingestedEvents.some((e) => e.id === anprId)) return;

          let lat = anpr.latitude;
          let lng = anpr.longitude;
          let locName = anpr.locationName;

          if (parsedGpsTrace.length > 0) {
            const gpsPt = interpolateGpsPoint(anpr.timestampSec || 0, parsedGpsTrace);
            lat = gpsPt.latitude;
            lng = gpsPt.longitude;
            locName = gpsPt.locationName;
            anpr.latitude = lat;
            anpr.longitude = lng;
            anpr.locationName = locName;
          } else {
            lat = lat || Number((bus.lat + ((anpr.timestampSec || 1) * 0.000035)).toFixed(6));
            lng = lng || Number((bus.lng + ((anpr.timestampSec || 1) * 0.000042)).toFixed(6));
            locName = locName || `Transit Corridor Telemetry (${videoMetadata.fileName})`;
          }

          const mergedInfo = anpr.mergedTrackIds ? ` (Reconciled from ByteTrack tracks #${anpr.mergedTrackIds.join(' & #')})` : '';
          const isVerified = anpr.readable || (anpr.plateNumber && !anpr.plateNumber.toLowerCase().includes('unreadable') && anpr.confidence >= 50);

          const anprEvent: UrbanEvent = {
            id: anprId,
            category: 'ANPR',
            type: isVerified ? 'ANPR Vehicle Identification' : 'Vehicle Plate Region Observed',
            confidence: Number((anpr.confidence || (isVerified ? 85.0 : 45.0)).toFixed(1)),
            severity: 'LOW',
            busId: bus.id,
            cameraId: 'CAM-UPLOAD-FEED',
            latitude: lat,
            longitude: lng,
            timestamp: `Video Time ${anpr.timestamp || '00:00'}`,
            locationName: locName,
            status: isVerified ? 'VERIFIED' : 'NEW',
            assignedDepartment: 'Regional Transport Authority (RTO)',
            evidence: anpr.evidenceFrame || generateEvidenceSvg('anpr', 'LOW', bus.id, 'CAM-UPLOAD-FEED', anprId),
            details: {
              plateNumber: anpr.plateNumber,
              plateConfidence: Number((anpr.confidence || 85.0).toFixed(1)),
              vehicleClass: anpr.vehicleClass || 'Vehicle',
              trackId: anpr.trackId,
              notes: `Automated ANPR registration capture: ${anpr.plateNumber} (${anpr.confidence}% OCR confidence, ${anpr.stateOrRegion || 'HSRP Standard'})${mergedInfo} [Inference: ${report.inferenceEngine}]`
            },
            history: [
              { timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), action: `License plate identified: ${anpr.plateNumber} (${anpr.confidence}% conf)${mergedInfo}`, by: 'Babblu2821 ALPR + Cross-Track Reconciliation' }
            ]
          };

          const addRes = db.addEvent(anprEvent);
          ingestedEvents.push(addRes.event);
        });
      }

      res.json({
        report,
        ingestedEvents
      });
    } catch (err: any) {
      console.error('Failed to analyze uploaded video frames:', err);
      res.status(500).json({ error: err.message || 'Video analysis failed' });
    }
  });

  // Batch Multi-Video Analysis Endpoint (e.g. 4 videos mapped to 4 buses and routes)
  app.post('/api/video/analyze-multi', async (req, res) => {
    try {
      const { slots = [] } = req.body;
      if (!Array.isArray(slots) || slots.length === 0) {
        return res.status(400).json({ error: 'Missing or empty slots array' });
      }

      const results: Array<{
        slotId: number;
        busId: string;
        routeId: string;
        routeName: string;
        report: any;
        congestionAnalysis: RouteCongestionAnalysis;
      }> = [];

      const routeAnalyses: RouteCongestionAnalysis[] = [];

      for (const slot of slots) {
        const { slotId = 1, busId = 'BUS-101', videoMetadata, sampledFrames, gpsCsvContent, gpsTrace } = slot;
        if (!videoMetadata || !sampledFrames || !Array.isArray(sampledFrames)) {
          continue;
        }

        let parsedGpsTrace = Array.isArray(gpsTrace) ? gpsTrace : [];
        if (typeof gpsCsvContent === 'string' && gpsCsvContent.trim()) {
          const fromCsv = parseGpsCsv(gpsCsvContent);
          if (fromCsv.length > 0) {
            parsedGpsTrace = fromCsv;
          }
        }

        // Run AI vision inference on the frames with parsed GPS telemetry
        const report = await analyzeUploadedVideoFrames(videoMetadata, sampledFrames, busId, parsedGpsTrace);

        // Find the mapped bus and route
        const bus = db.buses.find((b) => b.id === busId) || db.buses[0];

        // If GPS trace is attached, update bus waypoints and current location from the real route
        if (parsedGpsTrace.length > 0) {
          bus.lat = parsedGpsTrace[0].latitude;
          bus.lng = parsedGpsTrace[0].longitude;
          bus.routeWaypoints = parsedGpsTrace.map((pt) => [pt.latitude, pt.longitude] as [number, number]);
        }

        // Compute route-specific vehicle density & congestion
        const congestion = computeRouteCongestion(slotId, bus.id, bus.routeId, bus.routeName, report);
        routeAnalyses.push(congestion);

        // Update database route delays and bus telemetry
        bus.speed = congestion.avgOperatingSpeedKmH;
        const matchingRouteDelay = db.routeDelays.find((rd) => rd.routeId === bus.routeId || rd.routeName.includes(bus.routeName.split('-')[0].trim()));
        if (matchingRouteDelay) {
          matchingRouteDelay.delayMinutes = congestion.estimatedDelayMinutes;
          matchingRouteDelay.actualMinutes = matchingRouteDelay.scheduledMinutes + congestion.estimatedDelayMinutes;
          matchingRouteDelay.avgSpeed = congestion.avgOperatingSpeedKmH;
          matchingRouteDelay.congestion = congestion.congestionLevel === 'CRITICAL' ? 'HIGH' : congestion.congestionLevel;
        }

        results.push({
          slotId,
          busId: bus.id,
          routeId: bus.routeId,
          routeName: bus.routeName,
          report,
          congestionAnalysis: congestion
        });
      }

      const fleetSummary = calculateFleetCongestionSummary(routeAnalyses);

      res.json({
        success: true,
        results,
        fleetSummary
      });
    } catch (err: any) {
      console.error('Failed to analyze multi-video batch:', err);
      res.status(500).json({ error: err.message || 'Multi-video analysis failed' });
    }
  });

  // End-to-End Live Demo Flow Runner
  app.post('/api/demo/run-full-flow', (req, res) => {
    const bus = db.buses.find((b) => b.id === 'BUS-103') || db.buses[0];
    const eventId = `RD-${Math.floor(10000 + Math.random() * 90000)}`;

    const event: UrbanEvent = {
      id: eventId,
      category: 'ROAD_HAZARD',
      type: 'Pothole',
      confidence: 95.4,
      severity: 'HIGH',
      busId: bus.id,
      cameraId: 'CAM-103-FRONT',
      latitude: bus.lat,
      longitude: bus.lng,
      timestamp: `Today, ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
      locationName: 'Avinashi Road near Hope College Flyover',
      status: 'NEW',
      assignedDepartment: 'Highways & PWD Civil Wing',
      evidence: generateEvidenceSvg('Pothole', 'HIGH', bus.id, 'CAM-103-FRONT', eventId),
      details: {
        hazardDimensions: '0.85m width x 1.15m length x 9cm depth',
        observationsCount: 1,
        busesObserving: [bus.id],
        notes: 'End-to-end demo trigger: Detected by Edge AI on BUS-103 front camera. Multi-bus spatial fusion engine verified coordinates.'
      }
    };

    const addResult = db.addEvent(event);

    res.json({
      success: true,
      message: 'End-to-End Edge-to-Authority Intelligence Flow executed successfully',
      event: addResult.event,
      fusedIssue: addResult.fusedWithConsolidated,
      stats: db.getStats()
    });
  });

  // Vite middleware for development vs Production dist serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`UrbanSense AI server running on http://localhost:${PORT}`);
  });
}

startServer();
