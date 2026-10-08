import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export interface DomainSearchState {
  currentDomain: string;
  searchHistory: string[];
  isValidDomain: boolean;
  searchError?: string;
  focus?: string;
  focusId?: string;
}

const DOMAIN_REGEX =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

const SEARCH_HISTORY_KEY = 'domain-analyzer-search-history';
const MAX_HISTORY_ITEMS = 20;

export function useDomainSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydrated = useRef(false);

  const [state, setState] = useState<DomainSearchState>({
    currentDomain: '',
    searchHistory: [],
    isValidDomain: false,
    searchError: undefined,
    focus: undefined,
    focusId: undefined,
  });

  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem(SEARCH_HISTORY_KEY);
      if (storedHistory) {
        const parsedHistory = JSON.parse(storedHistory) as string[];
        setState((prev) => ({
          ...prev,
          searchHistory: parsedHistory.filter((domain) => validateDomain(domain)),
        }));
      }
    } catch (error) {
      console.warn('Failed to load search history from localStorage:', error);
    }
  }, []);

  // Hydrate domain + focus from URL once
  useEffect(() => {
    if (hydrated.current) return;
    const domainParam = searchParams?.get('domain') || '';
    const focus = searchParams?.get('focus') || undefined;
    const focusId = searchParams?.get('id') || undefined;
    hydrated.current = true;
    if (domainParam && validateDomain(domainParam)) {
      const trimmed = domainParam.trim().toLowerCase();
      setState((prev) => ({
        ...prev,
        currentDomain: trimmed,
        isValidDomain: true,
        searchError: undefined,
        focus,
        focusId: focusId || undefined,
      }));
    } else if (focus || focusId) {
      setState((prev) => ({ ...prev, focus, focusId }));
    }
  }, [searchParams]);

  const setDomain = useCallback(
    (domain: string, opts?: { focus?: string; id?: string }) => {
      const trimmedDomain = domain.trim().toLowerCase();
      const isValid = validateDomain(trimmedDomain);

      setState((prev) => ({
        ...prev,
        currentDomain: trimmedDomain,
        isValidDomain: isValid,
        searchError: isValid ? undefined : 'Please enter a valid domain name',
        focus: opts?.focus,
        focusId: opts?.id,
      }));

      if (trimmedDomain) {
        const params = new URLSearchParams();
        params.set('domain', trimmedDomain);
        if (opts?.focus) params.set('focus', opts.focus);
        if (opts?.id) params.set('id', opts.id);
        router.replace(`?${params.toString()}`, { scroll: false });
      } else {
        router.replace('/', { scroll: false });
      }
    },
    [router]
  );

  const setFocus = useCallback(
    (focus: string, id: string) => {
      setState((prev) => {
        const domain = prev.currentDomain;
        if (domain) {
          const params = new URLSearchParams();
          params.set('domain', domain);
          params.set('focus', focus);
          params.set('id', id);
          router.replace(`?${params.toString()}`, { scroll: false });
        }
        return { ...prev, focus, focusId: id };
      });
    },
    [router]
  );

  const addToHistory = useCallback((domain: string) => {
    if (!validateDomain(domain)) return;

    setState((prev) => {
      const filteredHistory = prev.searchHistory.filter((item) => item !== domain);
      const newHistory = [domain, ...filteredHistory].slice(0, MAX_HISTORY_ITEMS);

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

  const removeFromHistory = useCallback((domain: string) => {
    setState((prev) => {
      const newHistory = prev.searchHistory.filter((item) => item !== domain);
      try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory));
      } catch (error) {
        console.warn('Failed to update search history from localStorage:', error);
      }
      return { ...prev, searchHistory: newHistory };
    });
  }, []);

  const clearHistory = useCallback(() => {
    setState((prev) => ({ ...prev, searchHistory: [] }));
    try {
      localStorage.removeItem(SEARCH_HISTORY_KEY);
    } catch (error) {
      console.warn('Failed to clear search history from localStorage:', error);
    }
  }, []);

  const searchDomain = useCallback(
    (domain: string) => {
      const trimmedDomain = domain.trim().toLowerCase();

      if (!validateDomain(trimmedDomain)) {
        setState((prev) => ({
          ...prev,
          searchError: 'Please enter a valid domain name',
        }));
        return false;
      }

      setDomain(trimmedDomain);
      addToHistory(trimmedDomain);
      return true;
    },
    [setDomain, addToHistory]
  );

  return {
    domain: state.currentDomain,
    searchHistory: state.searchHistory,
    isValidDomain: state.isValidDomain,
    searchError: state.searchError,
    focus: state.focus,
    focusId: state.focusId,
    setDomain,
    setFocus,
    searchDomain,
    addToHistory,
    removeFromHistory,
    clearHistory,
  };
}

function validateDomain(domain: string): boolean {
  if (!domain || domain.length === 0) return false;
  if (domain.length > 253) return false;
  return DOMAIN_REGEX.test(domain);
}

export { validateDomain };
