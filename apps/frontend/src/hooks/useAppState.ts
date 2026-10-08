import { useState, useCallback, useEffect } from 'react';
import { useTheme } from 'next-themes';
import type { DateDisplayTimezone } from '@/lib/utils';

export interface AppSettings {
  // Analysis preferences
  autoRefresh: boolean;
  refreshInterval: number; // in seconds
  showAdvancedData: boolean;
  enableNotifications: boolean;
  
  // Display preferences
  compactMode: boolean;
  showTimestamps: boolean;
  /** Registration dates: UTC (default) or browser local timezone */
  dateTimezone: DateDisplayTimezone;
  defaultAnalysisOptions: {
    includeWhois: boolean;
    includeRdap: boolean;
    includeDns: boolean;
    includeSecurityAnalysis: boolean;
  };
  
  // Visualization preferences
  enableAnimations: boolean;
  preferredChartType: 'bar' | 'pie' | 'line' | 'network';
  colorScheme: 'default' | 'colorblind' | 'highContrast';
}

export interface AppState {
  settings: AppSettings;
  sidebarOpen: boolean;
  activeView: 'overview' | 'details' | 'visualizations' | 'raw';
  lastAnalyzedDomain?: string;
  connectionStatus: 'online' | 'offline' | 'checking';
}

// Default settings
const DEFAULT_SETTINGS: AppSettings = {
  autoRefresh: false,
  refreshInterval: 300, // 5 minutes
  showAdvancedData: false,
  enableNotifications: true,
  compactMode: false,
  showTimestamps: true,
  dateTimezone: 'utc',
  defaultAnalysisOptions: {
    includeWhois: true,
    includeRdap: true,
    includeDns: true,
    includeSecurityAnalysis: true,
  },
  enableAnimations: true,
  preferredChartType: 'bar',
  colorScheme: 'default',
};

// Local storage key
const SETTINGS_STORAGE_KEY = 'domain-analyzer-settings';
const APP_STATE_STORAGE_KEY = 'domain-analyzer-app-state';

export function useAppState() {
  const { theme, setTheme } = useTheme();
  
  const [state, setState] = useState<AppState>({
    settings: DEFAULT_SETTINGS,
    sidebarOpen: true,
    activeView: 'overview',
    lastAnalyzedDomain: undefined,
    connectionStatus: 'checking',
  });

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
      const storedAppState = localStorage.getItem(APP_STATE_STORAGE_KEY);
      
      if (storedSettings) {
        const parsedSettings = JSON.parse(storedSettings) as Partial<AppSettings>;
        setState(prev => ({
          ...prev,
          settings: { ...DEFAULT_SETTINGS, ...parsedSettings },
        }));
      }
      
      if (storedAppState) {
        const parsedAppState = JSON.parse(storedAppState) as Partial<Pick<AppState, 'sidebarOpen' | 'activeView' | 'lastAnalyzedDomain'>>;
        setState(prev => ({
          ...prev,
          ...parsedAppState,
        }));
      }
    } catch (error) {
      console.warn('Failed to load app state from localStorage:', error);
    }
  }, []);

  // Check connection status
  useEffect(() => {
    const checkConnection = () => {
      setState(prev => ({
        ...prev,
        connectionStatus: navigator.onLine ? 'online' : 'offline',
      }));
    };

    // Initial check
    checkConnection();

    // Listen for connection changes
    window.addEventListener('online', checkConnection);
    window.addEventListener('offline', checkConnection);

    return () => {
      window.removeEventListener('online', checkConnection);
      window.removeEventListener('offline', checkConnection);
    };
  }, []);

  // Update settings
  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setState(prev => {
      const updatedSettings = { ...prev.settings, ...newSettings };
      
      // Save to localStorage
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updatedSettings));
      } catch (error) {
        console.warn('Failed to save settings to localStorage:', error);
      }
      
      return {
        ...prev,
        settings: updatedSettings,
      };
    });
  }, []);

  // Update app state
  const updateAppState = useCallback((newState: Partial<Omit<AppState, 'settings'>>) => {
    setState(prev => {
      const updatedState = { ...prev, ...newState };
      
      // Save persistent state to localStorage
      try {
        const persistentState = {
          sidebarOpen: updatedState.sidebarOpen,
          activeView: updatedState.activeView,
          lastAnalyzedDomain: updatedState.lastAnalyzedDomain,
        };
        localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(persistentState));
      } catch (error) {
        console.warn('Failed to save app state to localStorage:', error);
      }
      
      return updatedState;
    });
  }, []);

  // Toggle sidebar
  const toggleSidebar = useCallback(() => {
    updateAppState({ sidebarOpen: !state.sidebarOpen });
  }, [state.sidebarOpen, updateAppState]);

  // Set active view
  const setActiveView = useCallback((view: AppState['activeView']) => {
    updateAppState({ activeView: view });
  }, [updateAppState]);

  // Set last analyzed domain
  const setLastAnalyzedDomain = useCallback((domain: string) => {
    updateAppState({ lastAnalyzedDomain: domain });
  }, [updateAppState]);

  // Reset settings to defaults
  const resetSettings = useCallback(() => {
    setState(prev => ({
      ...prev,
      settings: DEFAULT_SETTINGS,
    }));
    
    try {
      localStorage.removeItem(SETTINGS_STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to clear settings from localStorage:', error);
    }
  }, []);

  // Export settings
  const exportSettings = useCallback(() => {
    const dataStr = JSON.stringify(state.settings, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'domain-analyzer-settings.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [state.settings]);

  // Import settings
  const importSettings = useCallback((settingsFile: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const importedSettings = JSON.parse(e.target?.result as string) as AppSettings;
          
          // Validate imported settings (basic check)
          const validatedSettings = { ...DEFAULT_SETTINGS, ...importedSettings };
          updateSettings(validatedSettings);
          
          resolve();
        } catch (error) {
          reject(new Error('Invalid settings file format'));
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read settings file'));
      reader.readAsText(settingsFile);
    });
  }, [updateSettings]);

  return {
    // State
    settings: state.settings,
    sidebarOpen: state.sidebarOpen,
    activeView: state.activeView,
    lastAnalyzedDomain: state.lastAnalyzedDomain,
    connectionStatus: state.connectionStatus,
    theme,
    
    // Actions
    updateSettings,
    updateAppState,
    toggleSidebar,
    setActiveView,
    setLastAnalyzedDomain,
    setTheme,
    resetSettings,
    exportSettings,
    importSettings,
  };
}