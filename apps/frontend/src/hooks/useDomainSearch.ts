import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export interface DomainSearchState {
  currentDomain: string;
  searchHistory: string[];
  isValidDomain: boolean;
  searchError?: string;
}

// Simple domain validation regex
const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

// Local storage key for search history
const SEARCH_HISTORY_KEY = 'domain-analyzer-search-history';
const MAX_HISTORY_ITEMS = 20;

export function useDomainSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Initialize state from URL parameters
  const initialDomain = searchParams.get('domain') || '';
  
  const [state, setState] = useState<DomainSearchState>({
    currentDomain: initialDomain,
    searchHistory: [],
    isValidDomain: validateDomain(initialDomain),
    searchError: undefined,
  });

  // Load search history from localStorage on mount
  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem(SEARCH_HISTORY_KEY);
      if (storedHistory) {
        const parsedHistory = JSON.parse(storedHistory) as string[];
        setState(prev => ({
          ...prev,
          searchHistory: parsedHistory.filter(domain => validateDomain(domain)),
        }));
      }
    } catch (error) {
      console.warn('Failed to load search history from localStorage:', error);
    }
  }, []);

  // Update domain and URL
  const setDomain = useCallback((domain: string) => {
    const trimmedDomain = domain.trim().toLowerCase();
    const isValid = validateDomain(trimmedDomain);
    
    setState(prev => ({
      ...prev,
      currentDomain: trimmedDomain,
      isValidDomain: isValid,
      searchError: isValid ? undefined : 'Please enter a valid domain name',
    }));

    // Update URL without navigation
    const params = new URLSearchParams(searchParams);
    if (trimmedDomain) {
      params.set('domain', trimmedDomain);
    } else {
      params.delete('domain');
    }
    
    const newUrl = params.toString() ? `?${params.toString()}` : '';
    router.replace(newUrl, { scroll: false });
  }, [router, searchParams]);

  // Add domain to search history
  const addToHistory = useCallback((domain: string) => {
    if (!validateDomain(domain)) return;

    setState(prev => {
      // Remove domain if it already exists to move it to front
      const filteredHistory = prev.searchHistory.filter(item => item !== domain);
      const newHistory = [domain, ...filteredHistory].slice(0, MAX_HISTORY_ITEMS);
      
      // Save to localStorage
      try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory));
      } catch (error) {
        console.warn('Failed to save search history to localStorage:', error);
      }
      
      return {
        ...prev,
        searchHistory: newHistory,
      };
    });
  }, []);

  // Remove domain from search history
  const removeFromHistory = useCallback((domain: string) => {
    setState(prev => {
      const newHistory = prev.searchHistory.filter(item => item !== domain);
      
      // Update localStorage
      try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory));
      } catch (error) {
        console.warn('Failed to update search history in localStorage:', error);
      }
      
      return {
        ...prev,
        searchHistory: newHistory,
      };
    });
  }, []);

  // Clear all search history
  const clearHistory = useCallback(() => {
    setState(prev => ({ ...prev, searchHistory: [] }));
    
    try {
      localStorage.removeItem(SEARCH_HISTORY_KEY);
    } catch (error) {
      console.warn('Failed to clear search history from localStorage:', error);
    }
  }, []);

  // Search for a domain (sets domain and adds to history)
  const searchDomain = useCallback((domain: string) => {
    const trimmedDomain = domain.trim().toLowerCase();
    
    if (!validateDomain(trimmedDomain)) {
      setState(prev => ({
        ...prev,
        searchError: 'Please enter a valid domain name',
      }));
      return false;
    }

    setDomain(trimmedDomain);
    addToHistory(trimmedDomain);
    return true;
  }, [setDomain, addToHistory]);

  return {
    // State
    domain: state.currentDomain,
    searchHistory: state.searchHistory,
    isValidDomain: state.isValidDomain,
    searchError: state.searchError,
    
    // Actions
    setDomain,
    searchDomain,
    addToHistory,
    removeFromHistory,
    clearHistory,
  };
}

// Helper function for domain validation
function validateDomain(domain: string): boolean {
  if (!domain || domain.length === 0) return false;
  if (domain.length > 253) return false; // Max domain length
  
  return DOMAIN_REGEX.test(domain);
}

// Export validation function for use in other components
export { validateDomain };