/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { LiveDemoModal } from './components/LiveDemoModal';

// Pages
import { OverviewDashboard } from './pages/OverviewDashboard';
import { LiveFleetPage } from './pages/LiveFleetPage';
import { IncidentsHubPage } from './pages/IncidentsHubPage';
import { BusCameraMonitoringPage } from './pages/BusCameraMonitoringPage';
import { TrafficAnalyticsPage } from './pages/TrafficAnalyticsPage';
import { GISIntelligenceMapPage } from './pages/GISIntelligenceMapPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';

const BusRouteRedirect: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/fleet?busId=${id}` : '/fleet'} replace />;
};

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 antialiased font-sans selection:bg-cyan-500 selection:text-slate-950">
          {/* Top Command Bar */}
          <Navbar />

          <div className="flex flex-1 overflow-hidden">
            {/* Left Navigation Sidebar */}
            <Sidebar />

            {/* Main Application Content Area */}
            <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-950">
              <div className="max-w-7xl mx-auto">
                <Routes>
                  <Route path="/" element={<OverviewDashboard />} />
                  <Route path="/fleet" element={<LiveFleetPage />} />
                  <Route path="/buses/:id" element={<BusRouteRedirect />} />
                  <Route path="/incidents" element={<IncidentsHubPage />} />
                  <Route path="/cameras" element={<BusCameraMonitoringPage />} />
                  <Route path="/traffic" element={<TrafficAnalyticsPage />} />
                  <Route path="/map" element={<GISIntelligenceMapPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />

                  {/* Backward-compatible aliases redirecting to unified Hub */}
                  <Route path="/road-issues" element={<Navigate to="/incidents?category=ROAD_HAZARD" replace />} />
                  <Route path="/safety" element={<Navigate to="/incidents?category=SAFETY" replace />} />
                  <Route path="/alerts" element={<Navigate to="/incidents" replace />} />
                  <Route path="/infrastructure" element={<Navigate to="/incidents?category=INFRASTRUCTURE" replace />} />

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </div>
            </main>
          </div>

          {/* Interactive Live Demo Modal */}
          <LiveDemoModal />
        </div>
      </AppProvider>
    </BrowserRouter>
  );
}

