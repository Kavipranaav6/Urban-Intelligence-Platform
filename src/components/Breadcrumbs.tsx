import React from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { ChevronRight, ArrowLeft, Home } from 'lucide-react';

interface BreadcrumbsProps {
  customTitle?: string;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ customTitle }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const pathSegments = location.pathname.split('/').filter(Boolean);

  const routeNames: Record<string, string> = {
    fleet: 'Live Fleet',
    buses: 'Bus Details',
    cameras: 'Bus Camera Monitoring',
    'road-issues': 'Road Issues',
    traffic: 'Traffic Analytics',
    safety: 'Safety Events',
    map: 'GIS Intelligence Map',
    alerts: 'Authority Alerts',
    infrastructure: 'Infrastructure & Road Condition',
    reports: 'Reports & Export',
    settings: 'Architecture & Settings'
  };

  return (
    <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800/80 text-xs">
      <div className="flex items-center gap-2 text-slate-400">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition"
          title="Go Back (Browser History)"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>

        <span className="text-slate-600">|</span>

        <Link to="/" className="hover:text-cyan-400 flex items-center gap-1 transition">
          <Home className="w-3.5 h-3.5" />
          <span>Overview</span>
        </Link>

        {pathSegments.map((segment, index) => {
          const url = `/${pathSegments.slice(0, index + 1).join('/')}`;
          const isLast = index === pathSegments.length - 1;
          const displayLabel = routeNames[segment] || segment.toUpperCase();

          return (
            <React.Fragment key={url}>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              {isLast ? (
                <span className="font-semibold text-slate-200">
                  {customTitle || displayLabel}
                </span>
              ) : (
                <Link to={url} className="hover:text-cyan-400 transition">
                  {displayLabel}
                </Link>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-slate-500">
        <span>URBANSENSE v1.0</span>
        <span>•</span>
        <span className="text-cyan-400">COMMAND CORE ACTIVE</span>
      </div>
    </div>
  );
};
