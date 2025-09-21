/**
 * Theme-aware color utilities for D3.js charts
 */

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export interface ChartColors {
  text: string;
  textSecondary: string;
  background: string;
  gridLines: string;
  axis: string;
  tooltip: {
    background: string;
    text: string;
  };
}

/**
 * Get theme-aware colors for charts (direct function - for immediate use)
 */
export function getChartColors(theme?: string): ChartColors {
  // Check theme parameter first, then DOM if available
  let isDark = false;
  if (theme) {
    isDark = theme === 'dark';
  } else if (typeof document !== 'undefined') {
    isDark = document.documentElement.classList.contains('dark');
  }
  
  if (isDark) {
    return {
      text: '#f8fafc',           // Light text for dark theme
      textSecondary: '#cbd5e1',  // Slightly muted light text
      background: '#1e293b',     // Dark background
      gridLines: '#374151',      // Dark grid lines
      axis: '#6b7280',           // Medium gray for axis
      tooltip: {
        background: 'rgba(30, 41, 59, 0.95)', // Dark semi-transparent
        text: '#f8fafc'                       // Light text
      }
    };
  } else {
    return {
      text: '#1e293b',           // Dark text for light theme
      textSecondary: '#64748b',  // Muted dark text
      background: '#ffffff',     // Light background
      gridLines: '#e2e8f0',      // Light grid lines
      axis: '#94a3b8',           // Medium gray for axis
      tooltip: {
        background: 'rgba(0, 0, 0, 0.8)', // Dark semi-transparent
        text: '#ffffff'                    // White text
      }
    };
  }
}

/**
 * React hook to get theme-aware colors that updates when theme changes
 */
export function useChartColors(): ChartColors {
  const { theme, resolvedTheme } = useTheme();
  const [colors, setColors] = useState<ChartColors>(() => {
    // Initialize with safe defaults
    try {
      return getChartColors();
    } catch {
      return getChartColors('light'); // fallback to light theme
    }
  });

  useEffect(() => {
    try {
      // Use resolvedTheme which handles 'system' theme properly
      const currentTheme = resolvedTheme || theme;
      setColors(getChartColors(currentTheme));
    } catch (error) {
      console.warn('Error updating chart colors:', error);
      // Fallback to light theme colors
      setColors(getChartColors('light'));
    }
  }, [theme, resolvedTheme]);

  return colors;
}

/**
 * Get CSS custom property value for theme-aware colors
 */
export function getCSSColorValue(property: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(property).trim();
}

/**
 * Get semantic colors from CSS variables
 */
export function getSemanticColors() {
  return {
    foreground: `hsl(${getCSSColorValue('--foreground')})`,
    mutedForeground: `hsl(${getCSSColorValue('--muted-foreground')})`,
    background: `hsl(${getCSSColorValue('--background')})`,
    border: `hsl(${getCSSColorValue('--border')})`,
    primary: `hsl(${getCSSColorValue('--primary')})`,
    secondary: `hsl(${getCSSColorValue('--secondary')})`,
  };
}
