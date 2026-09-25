import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Bus, UrbanEvent, UserRole } from '../types';
import { api, OverviewStats } from '../services/api';

interface DemoStep {
  stepNumber: number;
  title: string;
  description: string;
  status: 'pending' | 'active' | 'completed';
}

interface AppContextType {
  role: UserRole;
  setRole: (role: UserRole) => void;
  networkOnline: boolean;
  setNetworkOnline: (online: boolean) => void;
  offlineQueue: UrbanEvent[];
  queueOfflineEvent: (event: UrbanEvent) => void;
  syncOfflineQueue: () => Promise<void>;
  buses: Bus[];
  refreshBuses: () => Promise<void>;
  stats: OverviewStats | null;
  refreshStats: () => Promise<void>;
  isSimulating: boolean;
  toggleSimulation: () => Promise<void>;
  activeNotification: { title: string; message: string; type: 'info' | 'alert' | 'success'; eventId?: string } | null;
  clearNotification: () => void;
  // Demo Runner
  isDemoRunning: boolean;
  currentDemoStep: number;
  demoSteps: DemoStep[];
  startLiveDemoFlow: (onCompleteNavigate?: (path: string) => void) => Promise<void>;
  closeDemoModal: () => void;
  showDemoModal: boolean;
  // Theme state
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const initialDemoSteps: DemoStep[] = [
  { stepNumber: 1, title: 'Bus Identification', description: 'Selecting mobile sensing unit BUS-103 on Route 12 corridor', status: 'pending' },
  { stepNumber: 2, title: 'Camera Stream Feed', description: 'Accessing front surveillance sensor CAM-103-FRONT', status: 'pending' },
  { stepNumber: 3, title: 'Video Buffer Ingestion', description: 'Streaming 1080p road video into edge memory ring buffer', status: 'pending' },
  { stepNumber: 4, title: 'Edge AI Inference', description: 'Executing YOLOv8 + ByteTrack on local edge hardware', status: 'pending' },
  { stepNumber: 5, title: 'Multi-Class Detections', description: 'Detected: Pothole (94.2%), Vehicle #17, Zebra crossing', status: 'pending' },
  { stepNumber: 6, title: 'ANPR License Plate OCR', description: 'OCR identified registration number "TN 38 AB 1234" (91%)', status: 'pending' },
  { stepNumber: 7, title: 'Bus GPS Coordinate Inheritance', description: 'Attached Bus GPS (11.0082, 76.9845) to road hazard event', status: 'pending' },
  { stepNumber: 8, title: 'Timestamp & Evidence Package', description: 'Synchronized hardware timestamp and extracted JPEG frame', status: 'pending' },
  { stepNumber: 9, title: 'Bandwidth-Optimized Upload', description: 'Kept raw video at edge; transmitted only 14KB event payload to server', status: 'pending' },
  { stepNumber: 10, title: 'Central PostGIS Ingestion', description: 'Backend stored event RD-00127 & performed spatial duplicate check', status: 'pending' },
  { stepNumber: 11, title: 'Multi-Bus Fusion Link', description: 'Fused with prior sightings from BUS-101 & BUS-104 (3 sightings)', status: 'pending' },
  { stepNumber: 12, title: 'GIS Map & Authority Alert', description: 'Event plotted on GIS map; alert dispatched to Roads Authority', status: 'pending' },
];

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<UserRole>('TRANSPORT_AUTHORITY');
  const [networkOnline, setNetworkOnline] = useState<boolean>(true);
  const [offlineQueue, setOfflineQueue] = useState<UrbanEvent[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [activeNotification, setActiveNotification] = useState<{ title: string; message: string; type: 'info' | 'alert' | 'success'; eventId?: string } | null>(null);
  const [isDemoRunning, setIsDemoRunning] = useState<boolean>(false);
  const [currentDemoStep, setCurrentDemoStep] = useState<number>(0);
  const [demoSteps, setDemoSteps] = useState<DemoStep[]>(initialDemoSteps);
  const [showDemoModal, setShowDemoModal] = useState<boolean>(false);
  const [theme, setThemeState] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('urbansense_theme');
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme);
      document.body.setAttribute('data-theme', theme);
      if (theme === 'light') {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
        document.body.classList.add('light');
        document.body.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        document.body.classList.add('dark');
        document.body.classList.remove('light');
      }
      localStorage.setItem('urbansense_theme', theme);
    } catch (e) {
      console.warn('Failed to update theme attribute:', e);
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const setTheme = useCallback((newTheme: 'dark' | 'light') => {
    setThemeState(newTheme);
  }, []);

  const refreshBuses = useCallback(async () => {
    try {
      const data = await api.getBuses();
      setBuses(data);
    } catch {
      // gracefully keep previous
    }
  }, []);

  const refreshStats = useCallback(async () => {
    try {
      const data = await api.getStats();
      setStats(data);
    } catch {
      // gracefully keep previous
    }
  }, []);

  useEffect(() => {
    refreshBuses();
    refreshStats();
  }, [refreshBuses, refreshStats]);

  // Simulation loop when enabled
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.simulateStep();
        setBuses(res.movedBuses);
        if (res.generatedEvent) {
          setActiveNotification({
            title: `New Event: ${res.generatedEvent.type}`,
            message: `${res.generatedEvent.busId} detected ${res.generatedEvent.type} with ${res.generatedEvent.confidence}% confidence`,
            type: 'alert',
            eventId: res.generatedEvent.id
          });
          refreshStats();
        }
      } catch (err) {
        console.error('Simulation step error:', err);
      }
    }, 2800);

    return () => clearInterval(interval);
  }, [isSimulating, refreshStats]);

  const toggleSimulation = async () => {
    try {
      const res = await api.toggleSimulation();
      setIsSimulating(res.simulationActive);
    } catch {
      setIsSimulating(!isSimulating);
    }
  };

  const clearNotification = () => setActiveNotification(null);

  const queueOfflineEvent = (event: UrbanEvent) => {
    setOfflineQueue((prev) => [...prev, event]);
    setActiveNotification({
      title: 'Offline Event Queued',
      message: `Network offline: Event ${event.id} stored in Edge SSD queue. Total queued: ${offlineQueue.length + 1}`,
      type: 'info'
    });
  };

  const syncOfflineQueue = async () => {
    if (offlineQueue.length === 0) return;
    try {
      for (const ev of offlineQueue) {
        await api.createEvent(ev);
      }
      setActiveNotification({
        title: 'Network Restored - Synchronized',
        message: `Successfully synchronized ${offlineQueue.length} queued events to Central PostGIS database.`,
        type: 'success'
      });
      setOfflineQueue([]);
      await refreshStats();
    } catch (err) {
      console.error('Sync failed:', err);
    }
  };

  const startLiveDemoFlow = async (onCompleteNavigate?: (path: string) => void) => {
    setShowDemoModal(true);
    setIsDemoRunning(true);
    setCurrentDemoStep(1);

    const steps = [...initialDemoSteps];
    setDemoSteps(steps);

    for (let i = 0; i < steps.length; i++) {
      setCurrentDemoStep(i + 1);
      setDemoSteps((prev) =>
        prev.map((s, idx) => ({
          ...s,
          status: idx === i ? 'active' : idx < i ? 'completed' : 'pending'
        }))
      );

      // simulate progressive pipeline latency
      await new Promise((r) => setTimeout(r, 900));

      if (i === 8) {
        // trigger the backend demo endpoint
        try {
          await api.runFullLiveDemo();
          await refreshStats();
          await refreshBuses();
        } catch (e) {
          console.warn(e);
        }
      }
    }

    setDemoSteps((prev) => prev.map((s) => ({ ...s, status: 'completed' })));
    setIsDemoRunning(false);

    setActiveNotification({
      title: 'Full Pipeline Complete',
      message: 'Event RD-00127 verified and plotted onto GIS Intelligence Map with Multi-Bus Sighting confirmation!',
      type: 'success',
      eventId: 'RD-00127'
    });

    if (onCompleteNavigate) {
      setTimeout(() => {
        onCompleteNavigate('/map');
      }, 1500);
    }
  };

  const closeDemoModal = () => {
    if (!isDemoRunning) {
      setShowDemoModal(false);
    }
  };

  return (
    <AppContext.Provider
      value={{
        role,
        setRole,
        networkOnline,
        setNetworkOnline,
        offlineQueue,
        queueOfflineEvent,
        syncOfflineQueue,
        buses,
        refreshBuses,
        stats,
        refreshStats,
        isSimulating,
        toggleSimulation,
        activeNotification,
        clearNotification,
        isDemoRunning,
        currentDemoStep,
        demoSteps,
        startLiveDemoFlow,
        closeDemoModal,
        showDemoModal,
        theme,
        toggleTheme,
        setTheme
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
