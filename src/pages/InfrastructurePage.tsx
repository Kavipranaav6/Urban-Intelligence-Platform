import React from 'react';
import {
  Wrench,
  AlertOctagon,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { Breadcrumbs } from '../components/Breadcrumbs';

export const InfrastructurePage: React.FC = () => {
  const corridorHealth = [
    {
      name: 'Avinashi Road (Arterial 1)',
      rqi: 68,
      rqiGrade: 'Moderate',
      potholesPerKm: 1.8,
      priority: 'HIGH',
      defects: 14,
      furnitureHealth: '82%',
      repeatSightings: 8,
      lastInspected: '12 mins ago (BUS-103)'
    },
    {
      name: 'Trichy Road (Arterial 2)',
      rqi: 74,
      rqiGrade: 'Fair',
      potholesPerKm: 1.2,
      priority: 'MEDIUM',
      defects: 9,
      furnitureHealth: '91%',
      repeatSightings: 4,
      lastInspected: '18 mins ago (BUS-105)'
    },
    {
      name: 'Mettupalayam Road (NH 181)',
      rqi: 86,
      rqiGrade: 'Good',
      potholesPerKm: 0.4,
      priority: 'LOW',
      defects: 3,
      furnitureHealth: '96%',
      repeatSightings: 1,
      lastInspected: '5 mins ago (BUS-102)'
    },
    {
      name: '100 Feet Road (Commercial)',
      rqi: 54,
      rqiGrade: 'Poor',
      potholesPerKm: 3.1,
      priority: 'CRITICAL',
      defects: 19,
      furnitureHealth: '68%',
      repeatSightings: 12,
      lastInspected: '22 mins ago (BUS-104)'
    },
    {
      name: 'Sathy Road (North Corridor)',
      rqi: 71,
      rqiGrade: 'Fair',
      potholesPerKm: 1.5,
      priority: 'MEDIUM',
      defects: 8,
      furnitureHealth: '87%',
      repeatSightings: 5,
      lastInspected: '34 mins ago (BUS-106)'
    },
    {
      name: 'Pollachi Road (South Corridor)',
      rqi: 89,
      rqiGrade: 'Excellent',
      potholesPerKm: 0.2,
      priority: 'LOW',
      defects: 2,
      furnitureHealth: '98%',
      repeatSightings: 0,
      lastInspected: '1 hour ago (BUS-108)'
    }
  ];

  const furnitureInventory = [
    { type: 'Pedestrian Zebra Crossings', status: 'Warning', condition: '6 Faded Markings', needAction: 'Repaint Required' },
    { type: 'Median Dividers & Crash Barriers', status: 'Alert', condition: '2 Broken Sections', needAction: 'Structural Repair' },
    { type: 'Regulatory Traffic Signboards', status: 'Good', condition: '94% Visible', needAction: 'Normal Routine' },
    { type: 'Stormwater Drains / Gaps', status: 'Warning', condition: '1 Waterlogged Point', needAction: 'Clear Drain Intake' }
  ];

  return (
    <div className="space-y-6">
      <Breadcrumbs customTitle="Road Quality Index & Asset Infrastructure" />

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-white tracking-tight">
              INFRASTRUCTURE HEALTH & ROAD CONDITION (RQI)
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Automated Road Quality Index (RQI), pothole density per kilometer, and physical road furniture tracking
            derived from multi-pass bus camera vision.
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-cyan-400">
            Network Avg RQI: <strong>73.6 / 100</strong>
          </span>
        </div>
      </div>

      {/* Corridor Health Ranking Cards */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
          PRIMARY ARTERIAL CORRIDOR HEALTH RANKINGS
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {corridorHealth.map((corridor) => (
            <div
              key={corridor.name}
              className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between space-y-3 hover:border-cyan-500/50 transition shadow-lg"
            >
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="font-bold text-white text-xs">{corridor.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      corridor.priority === 'CRITICAL' ? 'bg-red-950 text-red-400 border border-red-800' :
                      corridor.priority === 'HIGH' ? 'bg-orange-950 text-orange-400 border border-orange-800' :
                      corridor.priority === 'MEDIUM' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                      'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    }`}
                  >
                    {corridor.priority} PRIORITY
                  </span>
                </div>

                {/* RQI Metric */}
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-slate-400">Road Quality Index:</span>
                  <div className="text-right">
                    <span className="text-lg font-bold font-mono text-cyan-400">{corridor.rqi}</span>
                    <span className="text-xs text-slate-400 font-mono">/100 ({corridor.rqiGrade})</span>
                  </div>
                </div>

                {/* Progress Meter */}
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden mt-1.5">
                  <div
                    className={`h-full rounded-full ${
                      corridor.rqi >= 80 ? 'bg-emerald-400' :
                      corridor.rqi >= 65 ? 'bg-cyan-400' :
                      corridor.rqi >= 55 ? 'bg-amber-400' : 'bg-red-500'
                    }`}
                    style={{ width: `${corridor.rqi}%` }}
                  />
                </div>

                {/* Stats */}
                <div className="mt-3 space-y-1 text-xs text-slate-300 font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Defect Density:</span>
                    <span>{corridor.potholesPerKm} defects/km</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Multi-Bus Repeated Sightings:</span>
                    <span className="text-amber-400">{corridor.repeatSightings} confirmed</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Road Furniture Integrity:</span>
                    <span className="text-emerald-400">{corridor.furnitureHealth}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-400 font-mono">
                Latest bus pass: {corridor.lastInspected}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Road Furniture & Signboards Section */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              ROAD ASSET & STREET FURNITURE HEALTH INVENTORY
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">AI Visual Inspection</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {furnitureInventory.map((item) => (
            <div key={item.type} className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1">
              <div className="font-semibold text-white">{item.type}</div>
              <div className="text-[11px] text-amber-400 font-mono">{item.condition}</div>
              <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/80">
                Action: <span className="text-cyan-400 font-medium">{item.needAction}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
