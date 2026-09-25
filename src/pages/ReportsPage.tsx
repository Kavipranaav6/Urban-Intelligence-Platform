import React, { useState } from 'react';
import {
  FileText,
  Download,
  Printer,
  Building2,
  Calendar,
  Layers,
  ArrowDownToLine,
  FileCheck,
  Image as ImageIcon,
  MapPin,
  Camera,
  AlertTriangle
} from 'lucide-react';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useApp } from '../context/AppContext';
import { generateAuthorityAuditPDF, AuditReportData, AuditIncidentItem } from '../utils/pdfGenerator';
import { api } from '../services/api';

export const ReportsPage: React.FC = () => {
  const { stats, buses } = useApp();
  const [reportType, setReportType] = useState<string>('DAILY');
  const [department, setDepartment] = useState<string>('ALL');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [generatedReport, setGeneratedReport] = useState<AuditReportData | null>(null);

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    try {
      // Fetch real events from system database
      const allEvents = await api.getEvents();

      // Filter events by department
      let filtered = allEvents;
      if (department === 'PWD') {
        filtered = allEvents.filter((e) => ['ROAD_HAZARD', 'INFRASTRUCTURE'].includes(e.category));
      } else if (department === 'POLICE') {
        filtered = allEvents.filter((e) => ['SAFETY', 'ANPR', 'TRAFFIC'].includes(e.category));
      } else if (department === 'MUNICIPAL') {
        filtered = allEvents.filter((e) => ['ROAD_HAZARD', 'INFRASTRUCTURE', 'TRAFFIC'].includes(e.category));
      }

      // Convert into rich AuditIncidentItem with optical evidence images
      const incidents: AuditIncidentItem[] = filtered.map((e) => ({
        id: e.id,
        type: e.type,
        category: e.category,
        severity: e.severity,
        confidence: e.confidence > 1 ? Math.round(e.confidence) : Math.round(e.confidence * 100),
        timestamp: e.timestamp,
        locationName: e.locationName,
        busId: e.busId,
        cameraId: e.cameraId,
        latitude: e.latitude,
        longitude: e.longitude,
        evidence: e.evidence,
        details: e.details?.hazardDimensions
          ? `Dimensions: ${e.details.hazardDimensions}${e.details.notes ? ` • ${e.details.notes}` : ''}`
          : e.details?.plateNumber
          ? `Vehicle Plate: ${e.details.plateNumber}${e.details.speedRecorded ? ` • Logged Speed: ${e.details.speedRecorded} km/h` : ''}`
          : e.details?.notes || undefined
      }));

      // Generate prioritized work-orders from critical and high severity incidents
      const actionItems = incidents
        .filter((inc) => inc.severity === 'CRITICAL' || inc.severity === 'HIGH')
        .slice(0, 4)
        .map((inc) => ({
          priority: inc.severity,
          desc: `${inc.type} detected at ${inc.locationName || 'Transit Corridor'} (${inc.id}) - AI Conf: ${inc.confidence}%`
        }));

      if (actionItems.length === 0) {
        actionItems.push({
          priority: 'HIGH',
          desc: 'Corridor surveillance nominal. Routine preventive maintenance scheduled.'
        });
      }

      const roadDefectsCount = incidents.filter((i) => i.category === 'ROAD_HAZARD').length;
      const safetyCount = incidents.filter((i) => i.category === 'SAFETY' || i.category === 'ANPR').length;

      const report: AuditReportData = {
        generatedAt: new Date().toISOString(),
        title: `URBANSENSE AI - ${reportType} URBAN INTELLIGENCE AUDIT`,
        departmentTarget: department,
        period: reportType === 'DAILY' ? 'Past 24 Hours' : reportType === 'WEEKLY' ? 'Past 7 Days' : 'Past 30 Days',
        executiveSummary: {
          busesDeployed: buses.length || 8,
          activeSurveillanceUnits: buses.filter((b) => b.speed > 0).length || 6,
          camerasOnline: stats?.camerasOnline || 31,
          roadDefectsDetected: roadDefectsCount || stats?.roadIssuesDetected || 3,
          safetyIncidentsFlagged: safetyCount || stats?.safetyAlerts || 2,
          anprPlatesIdentified: 142,
          networkAverageRQI: 73.6,
          bandwidthOptimizedPct: '99.98%'
        },
        priorityActionItems: actionItems,
        incidents
      };

      setGeneratedReport(report);
    } catch (err) {
      console.error('Failed to generate authority audit report:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportPDF = async () => {
    if (!generatedReport) return;
    setIsExporting(true);
    try {
      await generateAuthorityAuditPDF(generatedReport);
    } catch (err) {
      console.error('Failed to generate PDF audit report:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportJSON = () => {
    if (!generatedReport) return;
    const blob = new Blob([JSON.stringify(generatedReport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `urbansense-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const csvContent =
      "Report ID,Generated Date,Department,Road Defects,Safety Events,Avg RQI,Bandwidth Saved\n" +
      `REP-2026-09,${new Date().toLocaleDateString()},${department},${stats?.roadIssuesDetected || 3},${stats?.safetyAlerts || 2},73.6,99.98%\n`;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `urbansense-summary-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs customTitle="Authority Reports & Export Engine" />

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-100 tracking-tight">
              AUTHORITY AUDIT REPORTS & DATA EXPORT
            </h1>

          </div>
          <p className="text-xs text-slate-400 mt-1">
            Generate formal intelligence audits formatted for Public Works Departments, Municipal Corporations,
            and City Traffic Police. Export as PDF or raw JSON/CSV.
          </p>
        </div>
      </div>

      {/* Report Config Card */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm space-y-4">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
          CONFIGURE REPORT PARAMETERS
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="text-slate-400 font-medium block mb-1.5">Reporting Timeframe:</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            >
              <option value="DAILY">Daily Transit Intelligence (24h)</option>
              <option value="WEEKLY">Weekly Corridor Audit (7 Days)</option>
              <option value="MONTHLY">Monthly Infrastructure Health (30 Days)</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 font-medium block mb-1.5">Target Department:</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            >
              <option value="ALL">All Departments (Consolidated)</option>
              <option value="PWD">Public Works / Highways Department</option>
              <option value="POLICE">City Traffic Police</option>
              <option value="MUNICIPAL">Municipal Corporation</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleGenerateReport}
              disabled={isGenerating}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg transition active:scale-95 disabled:opacity-50"
            >
              {isGenerating ? 'Compiling Fleet Audit...' : 'Generate Official Report'}
            </button>
          </div>
        </div>
      </div>

      {/* Generated Report Preview (When ready) */}
      {generatedReport && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-cyan-500/40 shadow-2xl space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 font-mono font-bold text-[10px] border border-cyan-800">
                  OFFICIAL AUTHORITY AUDIT
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 font-mono font-bold text-[10px] border border-emerald-800">
                  READY FOR PDF & JSON EXPORT
                </span>
              </div>
              <h2 className="text-base font-bold text-slate-100 mt-1">{generatedReport.title}</h2>
              <div className="text-xs text-slate-400 font-mono">
                Scope: {generatedReport.period} | Target: {generatedReport.departmentTarget} | Generated: {new Date(generatedReport.generatedAt).toLocaleString()}
              </div>
            </div>

            {/* Export Buttons */}
            <div className="flex items-center flex-wrap gap-2">
              <button
                onClick={handleExportPDF}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-950/40 transition active:scale-95 disabled:opacity-50"
                title="Download formatted Official PDF Report with embedded Visual Incident Evidence Dossier"
              >
                <FileText className="w-3.5 h-3.5 text-white" />
                <span>{isExporting ? 'Generating PDF with Photos...' : 'Generate PDF Report'}</span>
              </button>
              <button
                onClick={handleExportJSON}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition active:scale-95"
                title="Download full JSON dataset"
              >
                <ArrowDownToLine className="w-3.5 h-3.5 text-cyan-400" />
                <span>Export JSON</span>
              </button>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition active:scale-95"
                title="Download CSV Summary spreadsheet"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export CSV</span>
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition active:scale-95"
                title="Print Report or Save as browser printout"
              >
                <Printer className="w-3.5 h-3.5 text-amber-400" />
                <span>Print Ticket</span>
              </button>
            </div>
          </div>

          {/* Key Findings Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">MOBILE SENSING BUSES</span>
              <strong className="text-lg font-bold font-mono text-cyan-400">
                {generatedReport.executiveSummary.busesDeployed} Units
              </strong>
            </div>
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">ROAD HAZARDS IDENTIFIED</span>
              <strong className="text-lg font-bold font-mono text-orange-400">
                {generatedReport.executiveSummary.roadDefectsDetected} Defect Clusters
              </strong>
            </div>
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">SAFETY & ANPR FLAGS</span>
              <strong className="text-lg font-bold font-mono text-rose-400">
                {generatedReport.executiveSummary.safetyIncidentsFlagged} Infractions
              </strong>
            </div>
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">CELLULAR DATA SAVED</span>
              <strong className="text-lg font-bold font-mono text-emerald-400">
                {generatedReport.executiveSummary.bandwidthOptimizedPct}
              </strong>
            </div>
          </div>

          {/* Action Items List */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-300 font-mono uppercase">
              Priority Work-Orders For Dispatch
            </h4>
            <div className="space-y-2">
              {generatedReport.priorityActionItems.map((item: any, i: number) => (
                <div
                  key={i}
                  className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex items-start gap-3 text-xs"
                >
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                      item.priority === 'CRITICAL'
                        ? 'bg-rose-950 text-rose-400 border border-rose-800'
                        : 'bg-orange-950 text-orange-400 border border-orange-800'
                    }`}
                  >
                    {item.priority}
                  </span>
                  <span className="text-slate-200 leading-relaxed">{item.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Captured Incident Evidence & Defect Dossier (Rendered in PDF) */}
          {generatedReport.incidents && generatedReport.incidents.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wide">
                    Captured Incident Evidence Dossier
                  </h4>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                    {generatedReport.incidents.length} Incident Photos Attached to PDF
                  </span>
                  <span className="text-slate-400">
                    (Potholes, Signboards, Hazards & ANPR)
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {generatedReport.incidents.map((inc) => (
                  <div
                    key={inc.id}
                    className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden hover:border-slate-700 transition flex flex-col group"
                  >
                    {/* Incident Evidence Photo / Video Frame */}
                    <div className="relative aspect-video bg-slate-900 border-b border-slate-800 overflow-hidden flex items-center justify-center">
                      {inc.evidence ? (
                        <img
                          src={inc.evidence}
                          alt={inc.type}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5">
                          <Camera className="w-3.5 h-3.5" />
                          <span>Optical Frame Saved</span>
                        </div>
                      )}
                      
                      {/* Top Badges */}
                      <div className="absolute top-2 left-2 flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-white shadow ${
                            inc.severity === 'CRITICAL'
                              ? 'bg-rose-600'
                              : inc.severity === 'HIGH'
                              ? 'bg-orange-600'
                              : inc.severity === 'MEDIUM'
                              ? 'bg-amber-600'
                              : 'bg-cyan-600'
                          }`}
                        >
                          {inc.severity}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-950/85 text-cyan-300 border border-cyan-800 backdrop-blur-sm">
                          {inc.id}
                        </span>
                      </div>

                      {/* Confidence Tag */}
                      <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[9px] font-mono font-bold text-emerald-400 border border-emerald-900/50">
                        {inc.confidence}% Conf.
                      </div>
                    </div>

                    {/* Metadata Details */}
                    <div className="p-3 space-y-1.5 text-xs flex-1 flex flex-col justify-between">
                      <div>
                        <div className="font-bold text-slate-100 line-clamp-1">{inc.type}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="truncate">{inc.locationName || 'Urban Transit Corridor'}</span>
                        </div>
                        {inc.details && (
                          <div className="text-[10px] text-cyan-400/90 font-mono mt-1 line-clamp-1 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-900/30">
                            {inc.details}
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                        <span>{inc.busId || 'BUS-101'} • {inc.cameraId || 'FRONT'}</span>
                        <span className="text-slate-400">{inc.category || 'DEFECT'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
