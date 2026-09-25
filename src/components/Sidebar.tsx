import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Bus as BusIcon,
  Video,
  AlertOctagon,
  Activity,
  ShieldAlert,
  MapPin,
  Bell,
  Wrench,
  FileText,
  Settings,
  Info
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const Sidebar: React.FC = () => {
  const { stats } = useApp();

  const totalIncidents = (stats?.roadIssuesDetected || 0) + (stats?.safetyAlerts || 0);

  const navItems = [
    { to: '/', label: 'Overview Dashboard', icon: LayoutDashboard },
    { to: '/fleet', label: 'Live Fleet Control', icon: BusIcon, badge: stats?.activeBuses ? `${stats.activeBuses} active` : '8' },
    {
      to: '/incidents',
      label: 'Incidents & Hazards',
      icon: AlertOctagon,
      badge: totalIncidents > 0 ? `${totalIncidents}` : undefined,
      badgeColor: 'bg-amber-950 text-amber-400 border border-amber-800'
    },
    { to: '/cameras', label: 'Bus Camera Monitoring', icon: Video },
    { to: '/traffic', label: 'Traffic Analytics', icon: Activity },
    { to: '/map', label: 'GIS Intelligence Map', icon: MapPin },
    { to: '/reports', label: 'Reports & Export', icon: FileText },
    { to: '/settings', label: 'Architecture & Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-800/80 flex flex-col justify-between shrink-0 select-none">
      <div className="py-3 px-2">
        <div className="px-3 py-1.5 text-xs font-semibold text-slate-400">
          Navigation
        </div>

        <nav className="mt-1 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-800/60 shadow-sm font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
                  }`
                }
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                      item.badgeColor || 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Edge AI Health Card */}
      <div className="p-3.5 m-3 rounded-xl bg-slate-900 border border-slate-800 text-xs">
        <div className="flex items-center justify-between text-slate-300 mb-1">
          <span className="font-semibold text-xs text-slate-200">Edge AI Pipeline</span>
          <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed mt-1">
          8 Bus Edge computers active. Only JSON events + keyframes sent over cellular link.
        </p>
        <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Bandwidth Saved:</span>
          <span className="text-emerald-400 font-mono font-semibold">99.98%</span>
        </div>
      </div>
    </aside>
  );
};
