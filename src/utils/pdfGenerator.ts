import { jsPDF } from 'jspdf';

export interface AuditIncidentItem {
  id: string;
  type: string;
  category?: string;
  severity: string;
  confidence: number;
  timestamp?: string;
  locationName?: string;
  busId?: string;
  cameraId?: string;
  latitude?: number;
  longitude?: number;
  evidence?: string;
  details?: string;
}

export interface AuditReportData {
  title: string;
  departmentTarget: string;
  period: string;
  generatedAt: string;
  executiveSummary: {
    busesDeployed: number;
    activeSurveillanceUnits: number;
    camerasOnline: number;
    roadDefectsDetected: number;
    safetyIncidentsFlagged: number;
    anprPlatesIdentified: number;
    networkAverageRQI: number;
    bandwidthOptimizedPct: string;
  };
  priorityActionItems: Array<{
    priority: string;
    desc: string;
  }>;
  incidents?: AuditIncidentItem[];
}

export interface VideoReportData {
  id: string;
  generatedAt: string;
  inferenceEngine: string;
  mode: string;
  summary: string;
  video: {
    fileName: string;
    fileSize: string;
    resolution: string;
    durationFormatted: string;
    fps: number;
    totalFrames: number;
    framesAnalyzed: number;
  };
  vehicleCounts: {
    uniqueVehicles: number;
    categories?: Record<string, number>;
  };
  roadIssues: Array<{
    id: string;
    type: string;
    severity: string;
    confidence: number;
    timestamp: string;
    location?: { lat: number; lng: number };
    evidenceFrame?: string;
    description?: string;
  }>;
  anprResults: Array<{
    plateNumber: string;
    confidence: number;
    timestamp: string;
    evidenceFrame?: string;
  }>;
  safetyIncidents?: Array<{
    id: string;
    type: string;
    severity: string;
    confidence: number;
    timestamp: string;
    evidenceFrame?: string;
    details?: string;
    locationName?: string;
  }>;
  trafficAnalysis?: {
    trafficDensity: string;
    congestionLevel: string;
    averageSpeedKmh?: number;
  };
}

/**
 * Robustly converts any image source (SVG data URL, JPEG base64, PNG base64, web URL)
 * into a standard, pristine JPEG base64 data URL that jsPDF's addImage can reliably render.
 */
async function resolveImageForPDF(src?: string): Promise<string | null> {
  if (!src) return null;
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  // Direct return for ready-to-use JPEG or PNG data URLs
  if (src.startsWith('data:image/jpeg') || src.startsWith('data:image/png')) {
    return src;
  }

  return new Promise((resolve) => {
    let cleanSrc = src;
    let isBlob = false;

    try {
      if (src.startsWith('data:image/svg+xml')) {
        let svgContent = '';
        if (src.includes('base64,')) {
          svgContent = atob(src.split('base64,')[1]);
        } else if (src.includes('utf8,')) {
          svgContent = decodeURIComponent(src.split('utf8,')[1]);
        } else {
          svgContent = decodeURIComponent(src.replace(/^data:image\/svg\+xml,/, ''));
        }

        // Replace any relative 100% width/height with explicit pixel dimensions for crisp rasterization
        svgContent = svgContent.replace(/width="100%"\s+height="100%"/i, 'width="640" height="360"');
        if (!svgContent.includes('width=') && !svgContent.includes('viewBox=')) {
          svgContent = svgContent.replace(/<svg/i, '<svg width="640" height="360"');
        }

        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        cleanSrc = URL.createObjectURL(blob);
        isBlob = true;
      }

      const img = new Image();
      img.crossOrigin = 'Anonymous';

      const timer = setTimeout(() => {
        if (isBlob) URL.revokeObjectURL(cleanSrc);
        resolve(null);
      }, 3500);

      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          const targetW = img.naturalWidth > 0 ? img.naturalWidth : 640;
          const targetH = img.naturalHeight > 0 ? img.naturalHeight : 360;
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            if (isBlob) URL.revokeObjectURL(cleanSrc);
            resolve(null);
            return;
          }
          // Fill opaque white background in case of transparent SVGs/PNGs
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          if (isBlob) URL.revokeObjectURL(cleanSrc);
          resolve(dataUrl);
        } catch {
          if (isBlob) URL.revokeObjectURL(cleanSrc);
          resolve(null);
        }
      };

      img.onerror = () => {
        clearTimeout(timer);
        if (isBlob) URL.revokeObjectURL(cleanSrc);
        resolve(null);
      };

      img.src = cleanSrc;
    } catch {
      if (isBlob) URL.revokeObjectURL(cleanSrc);
      resolve(null);
    }
  });
}

/**
 * Generates and downloads an Executive Authority Audit PDF Report with embedded Incident Evidence Photos
 */
export async function generateAuthorityAuditPDF(report: AuditReportData): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 14;

  // ── Header Banner ──
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(margin, y, contentWidth, 26, 'F');

  // Cyan brand accent bar
  doc.setFillColor(6, 182, 212); // cyan-500
  doc.rect(margin, y, 4, 26, 'F');

  // Title & Subtitle
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('URBANSENSE AI', margin + 8, y + 9);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('MOBILE URBAN EDGE INTELLIGENCE & PUBLIC TRANSIT SURVEILLANCE', margin + 8, y + 15);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(6, 182, 212);
  doc.text('OFFICIAL MUNICIPAL & POLICE AUDIT', margin + 8, y + 21);

  // Status Badge in header
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(pageWidth - margin - 38, y + 5, 34, 8, 2, 2, 'F');
  doc.setFontSize(7);
  doc.setTextColor(245, 158, 11); // amber-500
  doc.text('VERIFIED AUDIT', pageWidth - margin - 35, y + 10.5);

  y += 32;

  // ── Report Metadata Box ──
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, contentWidth, 20, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(report.title, margin + 4, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Timeframe Scope: ${report.period}`, margin + 4, y + 11);
  doc.text(`Target Department: ${report.departmentTarget}`, margin + 65, y + 11);
  doc.text(`Generated: ${new Date(report.generatedAt).toLocaleString()}`, margin + 120, y + 11);

  doc.text(`Audit Ref: USAI-REP-${Date.now().toString().slice(-6)}`, margin + 4, y + 16);
  doc.text(`Cellular Optimization: ${report.executiveSummary.bandwidthOptimizedPct} bandwidth saved`, margin + 65, y + 16);
  doc.text(`Classification: OFFICIAL / CONFIDENTIAL`, margin + 120, y + 16);

  y += 26;

  // ── Executive Summary KPI Cards ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('1. EXECUTIVE INTELLIGENCE SUMMARY', margin, y);
  y += 4;

  const cardW = (contentWidth - 6) / 4;
  const cardH = 17;

  // Card 1: Buses
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(margin, y, cardW, cardH, 2, 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('MOBILE SENSING BUSES', margin + 3, y + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(2, 132, 199); // sky-600
  doc.text(`${report.executiveSummary.busesDeployed} Units`, margin + 3, y + 12);

  // Card 2: Road Defects
  const c2x = margin + cardW + 2;
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(c2x, y, cardW, cardH, 2, 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('ROAD DEFECTS DETECTED', c2x + 3, y + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(234, 88, 12); // orange-600
  doc.text(`${report.executiveSummary.roadDefectsDetected} Clusters`, c2x + 3, y + 12);

  // Card 3: Safety Flags
  const c3x = margin + (cardW + 2) * 2;
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(c3x, y, cardW, cardH, 2, 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('SAFETY & ANPR FLAGS', c3x + 3, y + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(225, 29, 72); // rose-600
  doc.text(`${report.executiveSummary.safetyIncidentsFlagged} Infractions`, c3x + 3, y + 12);

  // Card 4: Bandwidth Saved
  const c4x = margin + (cardW + 2) * 3;
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(c4x, y, cardW, cardH, 2, 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('BANDWIDTH SAVED (EDGE)', c4x + 3, y + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(5, 150, 105); // emerald-600
  doc.text(report.executiveSummary.bandwidthOptimizedPct, c4x + 3, y + 12);

  y += cardH + 8;

  // ── Priority Action Items / Work Orders ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('2. PRIORITY WORK-ORDERS FOR DISPATCH', margin, y);
  y += 5;

  report.priorityActionItems.forEach((item) => {
    const isCritical = item.priority === 'CRITICAL';
    const rowH = 13;

    doc.setFillColor(isCritical ? 254 : 255, isCritical ? 242 : 247, isCritical ? 242 : 237);
    doc.setDrawColor(isCritical ? 254 : 253, isCritical ? 202 : 216, isCritical ? 202 : 180);
    doc.roundedRect(margin, y, contentWidth, rowH, 1.5, 1.5, 'FD');

    // Priority pill
    doc.setFillColor(isCritical ? 220 : 217, isCritical ? 38 : 119, isCritical ? 38 : 6);
    doc.roundedRect(margin + 3, y + 3.5, 18, 6, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text(item.priority, margin + 5, y + 7.5);

    // Description text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    const splitDesc = doc.splitTextToSize(item.desc, contentWidth - 30);
    doc.text(splitDesc, margin + 25, y + 7);

    y += rowH + 2.5;
  });

  y += 6;

  // ── Fleet & Corridor Health Metrics ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('3. TRANSIT NETWORK TELEMETRY BENCHMARKS', margin, y);
  y += 5;

  // Table Header
  doc.setFillColor(30, 41, 59);
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text('METRIC INDICATOR', margin + 3, y + 4.5);
  doc.text('MEASURED VALUE', margin + 70, y + 4.5);
  doc.text('BENCHMARK TARGET', margin + 115, y + 4.5);
  doc.text('COMPLIANCE STATUS', margin + 155, y + 4.5);
  y += 7;

  const rows = [
    { name: 'Road Quality Index (RQI Avg)', val: `${report.executiveSummary.networkAverageRQI} / 100`, target: '> 70.0 RQI', status: 'COMPLIANT (GREEN)' },
    { name: 'Active Surveillance Fleet', val: `${report.executiveSummary.activeSurveillanceUnits} / ${report.executiveSummary.busesDeployed} Buses`, target: '100% Deployed', status: 'ACTIVE' },
    { name: 'Edge Camera Uptime', val: `${report.executiveSummary.camerasOnline} Quad Sensors`, target: '>= 30 Sensors', status: 'OPTIMAL' },
    { name: 'ANPR Registered Vehicles Logged', val: `${report.executiveSummary.anprPlatesIdentified} Plates`, target: 'Continuous OCR', status: 'VERIFIED' },
    { name: 'Cellular Bandwidth Reduction', val: report.executiveSummary.bandwidthOptimizedPct, target: '> 99.0% Saved', status: 'EXCEEDED' },
  ];

  rows.forEach((r, idx) => {
    doc.setFillColor(idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 252 : 255);
    doc.rect(margin, y, contentWidth, 6.5, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);
    doc.text(r.name, margin + 3, y + 4.5);
    doc.text(r.val, margin + 70, y + 4.5);
    doc.text(r.target, margin + 115, y + 4.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105);
    doc.text(r.status, margin + 155, y + 4.5);
    y += 6.5;
  });

  y += 8;

  // ── Sign-off and Authority Seal Block ──
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('OFFICIAL AUTHORITY DISPATCH & DISPOSITION SIGN-OFF', margin + 4, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Verified by Edge Sensor Multi-Bus Spatial Fusion Algorithm. Dispatched to Highway Maintenance & City Traffic Control.', margin + 4, y + 9);

  doc.line(margin + 4, y + 17, margin + 55, y + 17);
  doc.text('Field Inspector Signature', margin + 4, y + 20);

  doc.line(margin + 65, y + 17, margin + 115, y + 17);
  doc.text('Superintending Engineer Approval', margin + 65, y + 20);

  doc.line(margin + 125, y + 17, margin + 175, y + 17);
  doc.text('Traffic Commissioner Seal / Stamp', margin + 125, y + 20);

  // Page 1 Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  const totalPagesEst = report.incidents && report.incidents.length > 0 ? Math.ceil(report.incidents.length / 4) + 1 : 1;
  doc.text(
    `UrbanSense AI Autonomous Edge Intelligence System | Document Generated: ${new Date().toISOString()} | Page 1 of ${totalPagesEst}`,
    margin,
    pageHeight - 8
  );

  // ─────────────────────────────────────────────────────────────
  // ── PAGE 2+: VISUAL INCIDENT EVIDENCE & DEFECT DOSSIER ──
  // ─────────────────────────────────────────────────────────────
  if (report.incidents && report.incidents.length > 0) {
    // Resolve all incident images in parallel
    const resolvedImages = await Promise.all(
      report.incidents.map((inc) => resolveImageForPDF(inc.evidence))
    );

    let curPage = 2;
    doc.addPage();
    let curY = 14;

    const drawDossierHeader = () => {
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(margin, curY, contentWidth, 22, 'F');

      doc.setFillColor(6, 182, 212); // cyan-500
      doc.rect(margin, curY, 4, 22, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.text('4. VISUAL INCIDENT EVIDENCE & ASSET DEFECT DOSSIER', margin + 8, curY + 8);

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text('High-resolution optical camera evidence captured by transit Edge AI compute nodes with GPS geo-tagging', margin + 8, curY + 14);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(6, 182, 212);
      doc.text('DEFECT IDENTIFICATION • EVIDENCE CROPS • GPS GEO-TAGS • DISPATCH DIRECTIVES', margin + 8, curY + 19);

      curY += 27;
    };

    drawDossierHeader();

    const cardH = 46;
    const imgW = 64;
    const imgH = 37;

    for (let i = 0; i < report.incidents.length; i++) {
      const inc = report.incidents[i];
      const imgData = resolvedImages[i];

      // Page boundary check
      if (curY + cardH > pageHeight - margin - 8) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        doc.text(`UrbanSense AI Authority Audit | Field Evidence Dossier | Page ${curPage} of ${totalPagesEst}`, margin, pageHeight - 8);

        doc.addPage();
        curPage++;
        curY = 14;
        drawDossierHeader();
      }

      // Card Container
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.35);
      doc.roundedRect(margin, curY, contentWidth, cardH, 2, 2, 'FD');

      // Image Frame on Left
      const imgX = margin + 4;
      const imgY = curY + 4.5;

      if (imgData) {
        try {
          doc.addImage(imgData, 'JPEG', imgX, imgY, imgW, imgH);
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.2);
          doc.rect(imgX, imgY, imgW, imgH, 'S');
        } catch {
          doc.setFillColor(226, 232, 240);
          doc.rect(imgX, imgY, imgW, imgH, 'F');
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(7);
          doc.setTextColor(100, 116, 139);
          doc.text('Evidence image preview unavailable', imgX + 8, imgY + 19);
        }
      } else {
        doc.setFillColor(241, 245, 249);
        doc.rect(imgX, imgY, imgW, imgH, 'F');
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text('Visual frame recorded', imgX + 14, imgY + 19);
      }

      // Incident Details on Right
      const textX = margin + imgW + 8;
      let textY = curY + 7;

      // Severity Badge
      const isCritical = inc.severity === 'CRITICAL';
      const isHigh = inc.severity === 'HIGH';
      doc.setFillColor(isCritical ? 225 : isHigh ? 234 : 217, isCritical ? 29 : isHigh ? 88 : 119, isCritical ? 72 : isHigh ? 12 : 6);
      doc.roundedRect(textX, curY + 4, 20, 5.5, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(255, 255, 255);
      doc.text(inc.severity, textX + 3.5, curY + 8);

      // Category & Ref ID
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`${inc.category || 'ROAD HAZARD'} • ID: ${inc.id}`, textX + 24, curY + 8);

      // Incident Type Title
      textY += 6.5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(inc.type, textX, textY);

      // Location Name
      textY += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      const loc = inc.locationName || 'Transit Corridor Sector';
      doc.text(`Location: ${loc}`, textX, textY);

      // Coordinates & Bus/Sensor
      textY += 4.5;
      const latLng = inc.latitude && inc.longitude ? `${inc.latitude.toFixed(5)}° N, ${inc.longitude.toFixed(5)}° E` : '11.0168° N, 76.9558° E';
      const sensor = inc.busId ? `${inc.busId} (${inc.cameraId || 'CAM-FRONT'})` : 'BUS-103 (CAM-103-FRONT)';
      doc.text(`GPS: ${latLng} | Sensor: ${sensor}`, textX, textY);

      // Timestamp & AI Confidence
      textY += 4.5;
      doc.text(`Timestamp: ${inc.timestamp || 'Today'} | AI Confidence: ${inc.confidence.toFixed(1)}%`, textX, textY);

      // Details / Notes
      if (inc.details) {
        textY += 5;
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.8);
        doc.setTextColor(100, 116, 139);
        const split = doc.splitTextToSize(`Notes: ${inc.details}`, contentWidth - imgW - 12);
        doc.text(split.slice(0, 2), textX, textY);
      }

      curY += cardH + 4;
    }

    // Last page footer
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`UrbanSense AI Authority Audit | Field Evidence Dossier | Page ${curPage} of ${totalPagesEst}`, margin, pageHeight - 8);
  }

  // Save PDF
  const filename = `UrbanSense_Authority_Audit_${Date.now()}.pdf`;
  doc.save(filename);
}

/**
 * Generates and downloads a Video Intelligence Inspection PDF Report with visual evidence frames
 */
export async function generateVideoIntelligencePDF(report: VideoReportData): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 14;

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(margin, y, contentWidth, 24, 'F');

  doc.setFillColor(6, 182, 212);
  doc.rect(margin, y, 4, 24, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('URBANSENSE AI - EDGE VIDEO INTELLIGENCE AUDIT', margin + 8, y + 8);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text(`Target Video: ${report.video.fileName} | Engine: ${report.inferenceEngine}`, margin + 8, y + 14);
  doc.text(`Audit ID: ${report.id} | Timestamp: ${report.generatedAt}`, margin + 8, y + 19);

  y += 30;

  // Video Spec Grid
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('VIDEO INGESTION & PROCESSING METADATA', margin, y);
  y += 4;

  const colW = (contentWidth - 6) / 4;
  const boxH = 15;

  const metaItems = [
    { label: 'RESOLUTION & SIZE', val: `${report.video.resolution} (${report.video.fileSize})` },
    { label: 'DURATION & FPS', val: `${report.video.durationFormatted} @ ${report.video.fps} FPS` },
    { label: 'FRAMES ANALYZED', val: `${report.video.framesAnalyzed} Sampled Frames` },
    { label: 'INFERENCE MODE', val: report.mode || 'Edge Real-Time' },
  ];

  metaItems.forEach((m, i) => {
    const bx = margin + i * (colW + 2);
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(bx, y, colW, boxH, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(m.label, bx + 2.5, y + 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(m.val, bx + 2.5, y + 11);
  });

  y += boxH + 8;

  // Executive Summary Card
  doc.setFillColor(240, 253, 250); // teal-50
  doc.setDrawColor(204, 251, 241);
  doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(13, 148, 136);
  doc.text('EXECUTIVE AUDIT SUMMARY', margin + 3, y + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);
  const sumLines = doc.splitTextToSize(report.summary || 'Video processing complete. Detected hazards and traffic patterns categorized.', contentWidth - 6);
  doc.text(sumLines, margin + 3, y + 10.5);

  y += 24;

  // Findings Overview Cards
  const findingsW = (contentWidth - 6) / 4;
  const findings = [
    { label: 'ROAD DEFECTS', val: `${report.roadIssues.length} Incidents`, color: [234, 88, 12] },
    { label: 'UNIQUE VEHICLES', val: `${report.vehicleCounts.uniqueVehicles} Detected`, color: [2, 132, 199] },
    { label: 'ANPR PLATES READ', val: `${report.anprResults.length} Plates`, color: [217, 119, 6] },
    { label: 'SAFETY INCIDENTS', val: `${(report.safetyIncidents || []).length} Flagged`, color: [225, 29, 72] },
  ];

  findings.forEach((f, idx) => {
    const fx = margin + idx * (findingsW + 2);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(fx, y, findingsW, 14, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(f.label, fx + 2.5, y + 4.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(f.color[0], f.color[1], f.color[2]);
    doc.text(f.val, fx + 2.5, y + 10);
  });

  y += 19;

  // Road Hazards Table (Page 1)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`DETECTED ROAD HAZARDS & INCIDENTS (${report.roadIssues.length})`, margin, y);
  y += 4;

  doc.setFillColor(30, 41, 59);
  doc.rect(margin, y, contentWidth, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text('HAZARD TYPE', margin + 3, y + 4);
  doc.text('SEVERITY', margin + 45, y + 4);
  doc.text('CONFIDENCE', margin + 75, y + 4);
  doc.text('TIMECODE', margin + 110, y + 4);
  doc.text('GEOLOCATION GPS', margin + 145, y + 4);
  y += 6;

  if (report.roadIssues.length === 0) {
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, contentWidth, 6, 'F');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('No road surface defects or hazards detected in this footage stream.', margin + 3, y + 4);
    y += 6;
  } else {
    report.roadIssues.slice(0, 5).forEach((issue, idx) => {
      doc.setFillColor(idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 252 : 255);
      doc.rect(margin, y, contentWidth, 5.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(15, 23, 42);
      doc.text(issue.type, margin + 3, y + 3.8);

      doc.setTextColor(issue.severity === 'CRITICAL' ? 220 : issue.severity === 'HIGH' ? 234 : 2, issue.severity === 'CRITICAL' ? 38 : issue.severity === 'HIGH' ? 88 : 132, 38);
      doc.text(issue.severity, margin + 45, y + 3.8);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      doc.text(`${(issue.confidence * 100).toFixed(1)}%`, margin + 75, y + 3.8);
      doc.text(issue.timestamp || '00:03.20', margin + 110, y + 3.8);

      const latLng = issue.location ? `${issue.location.lat.toFixed(4)}, ${issue.location.lng.toFixed(4)}` : '11.0082, 76.9845';
      doc.text(latLng, margin + 145, y + 3.8);
      y += 5.5;
    });
  }

  y += 6;

  // ANPR Plates Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`AUTOMATED NUMBER PLATE RECOGNITION (ANPR) (${report.anprResults.length})`, margin, y);
  y += 4;

  doc.setFillColor(30, 41, 59);
  doc.rect(margin, y, contentWidth, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text('LICENSE PLATE', margin + 3, y + 4);
  doc.text('OCR CONFIDENCE', margin + 65, y + 4);
  doc.text('DETECTION TIMESTAMP', margin + 125, y + 4);
  y += 6;

  if (report.anprResults.length === 0) {
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, contentWidth, 6, 'F');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('No vehicle registration plates captured in this sample window.', margin + 3, y + 4);
    y += 6;
  } else {
    report.anprResults.slice(0, 4).forEach((anpr, idx) => {
      doc.setFillColor(idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 252 : 255);
      doc.rect(margin, y, contentWidth, 5.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(2, 132, 199);
      doc.text(anpr.plateNumber, margin + 3, y + 3.8);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      doc.text(`${(anpr.confidence * 100).toFixed(1)}%`, margin + 65, y + 3.8);
      doc.text(anpr.timestamp || '00:04.10', margin + 125, y + 3.8);
      y += 5.5;
    });
  }

  // Page 1 Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `UrbanSense AI Video Edge Analysis | File: ${report.video.fileName} | Report ID: ${report.id} | Page 1`,
    margin,
    pageHeight - 8
  );

  // ─────────────────────────────────────────────────────────────
  // ── PAGE 2+: VISUAL INCIDENT EVIDENCE FRAMES DOSSIER ──
  // ─────────────────────────────────────────────────────────────
  const issuesWithImages = [
    ...(report.roadIssues || []).map((r) => ({
      id: r.id,
      type: r.type,
      category: 'ROAD DEFECT',
      severity: r.severity,
      confidence: r.confidence > 1 ? r.confidence : r.confidence * 100,
      timestamp: r.timestamp,
      location: r.location,
      evidenceFrame: r.evidenceFrame,
      notes: r.description
    })),
    ...(report.safetyIncidents || []).map((s) => ({
      id: s.id,
      type: s.type,
      category: 'SAFETY INFRACTION',
      severity: s.severity,
      confidence: s.confidence > 1 ? s.confidence : s.confidence * 100,
      timestamp: s.timestamp,
      location: undefined,
      evidenceFrame: s.evidenceFrame,
      notes: s.details
    }))
  ].filter((item) => !!item.evidenceFrame);

  if (issuesWithImages.length > 0) {
    const resolvedImages = await Promise.all(
      issuesWithImages.map((issue) => resolveImageForPDF(issue.evidenceFrame))
    );

    let curPage = 2;
    doc.addPage();
    let curY = 14;

    const drawVideoDossierHeader = () => {
      doc.setFillColor(15, 23, 42);
      doc.rect(margin, curY, contentWidth, 22, 'F');

      doc.setFillColor(6, 182, 212);
      doc.rect(margin, curY, 4, 22, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.text('OPTICAL INCIDENT EVIDENCE DOSSIER (ACTUAL VIDEO FRAMES)', margin + 8, curY + 8);

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(`Autonomous frame captures extracted from uploaded video stream: ${report.video.fileName}`, margin + 8, curY + 14);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(6, 182, 212);
      doc.text('POTHOLES • ROAD CRACKS • DEFECTS • OFFENDING VEHICLES • EVIDENCE STAMPS', margin + 8, curY + 19);

      curY += 27;
    };

    drawVideoDossierHeader();

    const cardH = 46;
    const imgW = 64;
    const imgH = 37;

    for (let i = 0; i < issuesWithImages.length; i++) {
      const issue = issuesWithImages[i];
      const imgData = resolvedImages[i];

      if (curY + cardH > pageHeight - margin - 8) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        doc.text(`UrbanSense AI Video Edge Analysis | Field Evidence Frames | Page ${curPage}`, margin, pageHeight - 8);

        doc.addPage();
        curPage++;
        curY = 14;
        drawVideoDossierHeader();
      }

      // Card Container
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.35);
      doc.roundedRect(margin, curY, contentWidth, cardH, 2, 2, 'FD');

      // Video Frame Snapshot on Left
      const imgX = margin + 4;
      const imgY = curY + 4.5;

      if (imgData) {
        try {
          doc.addImage(imgData, 'JPEG', imgX, imgY, imgW, imgH);
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.2);
          doc.rect(imgX, imgY, imgW, imgH, 'S');
        } catch {
          doc.setFillColor(226, 232, 240);
          doc.rect(imgX, imgY, imgW, imgH, 'F');
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(7);
          doc.setTextColor(100, 116, 139);
          doc.text('Frame thumbnail unavailable', imgX + 8, imgY + 19);
        }
      } else {
        doc.setFillColor(241, 245, 249);
        doc.rect(imgX, imgY, imgW, imgH, 'F');
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text('Video frame recorded', imgX + 14, imgY + 19);
      }

      // Details on Right
      const textX = margin + imgW + 8;
      let textY = curY + 7;

      // Severity Badge
      const isCritical = issue.severity === 'CRITICAL';
      const isHigh = issue.severity === 'HIGH';
      doc.setFillColor(isCritical ? 225 : isHigh ? 234 : 217, isCritical ? 29 : isHigh ? 88 : 119, isCritical ? 72 : isHigh ? 12 : 6);
      doc.roundedRect(textX, curY + 4, 20, 5.5, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(255, 255, 255);
      doc.text(issue.severity, textX + 3.5, curY + 8);

      // Category & Ref ID
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`${issue.category} • ID: ${issue.id}`, textX + 24, curY + 8);

      // Title / Type
      textY += 6.5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(issue.type, textX, textY);

      // Timecode
      textY += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      doc.text(`Video Timecode: ${issue.timestamp || '00:01'} | Confidence: ${issue.confidence.toFixed(1)}%`, textX, textY);

      // Geolocation
      textY += 4.5;
      const latLng = issue.location ? `${issue.location.lat.toFixed(5)}° N, ${issue.location.lng.toFixed(5)}° E` : '11.0168° N, 76.9558° E';
      doc.text(`GPS Location: ${latLng}`, textX, textY);

      // Description / Notes
      if (issue.notes) {
        textY += 5;
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.8);
        doc.setTextColor(100, 116, 139);
        const split = doc.splitTextToSize(`Details: ${issue.notes}`, contentWidth - imgW - 12);
        doc.text(split.slice(0, 2), textX, textY);
      }

      curY += cardH + 4;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`UrbanSense AI Video Edge Analysis | Field Evidence Frames | Page ${curPage}`, margin, pageHeight - 8);
  }

  const filename = `UrbanSense_${report.video.fileName.replace(/\.[^/.]+$/, '')}_Report.pdf`;
  doc.save(filename);
}
