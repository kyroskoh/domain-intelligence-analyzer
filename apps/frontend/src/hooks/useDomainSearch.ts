import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export interface DomainSearchState {
  currentDomain: string;
  searchHistory: string[];
  isValidDomain: boolean;
  searchError?: string;
  focus?: string;
  focusId?: string;
  privateAnalyze: boolean;
}

const DOMAIN_REGEX =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

const SEARCH_HISTORY_KEY = 'domain-analyzer-search-history';
const MAX_HISTORY_ITEMS = 20;

function buildSearchUrl(opts: {
  domain?: string;
  focus?: string;
  focusId?: string;
  privateAnalyze?: boolean;
}): string {
  if (!opts.domain) return '/';
  const params = new URLSearchParams();
  params.set('domain', opts.domain);
  if (opts.focus) params.set('focus', opts.focus);
  if (opts.focusId) params.set('id', opts.focusId);
  if (opts.privateAnalyze) params.set('private', '1');
  return `?${params.toString()}`;
}

export function useDomainSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydrated = useRef(false);
  const privateRef = useRef(false);

  const [state, setState] = useState<DomainSearchState>({
    currentDomain: '',
    searchHistory: [],
    isValidDomain: false,
    searchError: undefined,
    focus: undefined,
    focusId: undefined,
    privateAnalyze: false,
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

  // Hydrate domain + focus + private from URL once
  useEffect(() => {
    if (hydrated.current) return;
    const domainParam = searchParams?.get('domain') || '';
    const focus = searchParams?.get('focus') || undefined;
    const focusId = searchParams?.get('id') || undefined;
    const privateAnalyze =
      searchParams?.get('private') === '1' || searchParams?.get('private') === 'true';
    hydrated.current = true;
    privateRef.current = privateAnalyze;
    if (domainParam && validateDomain(domainParam)) {
      const trimmed = domainParam.trim().toLowerCase();
      setState((prev) => ({
        ...prev,
        currentDomain: trimmed,
        isValidDomain: true,
        searchError: undefined,
        focus,
        focusId: focusId || undefined,
        privateAnalyze,
      }));
    } else if (focus || focusId || privateAnalyze) {
      setState((prev) => ({ ...prev, focus, focusId, privateAnalyze }));
    }
  }, [searchParams]);

  const setPrivateAnalyze = useCallback(
    (privateAnalyze: boolean) => {
      privateRef.current = privateAnalyze;
      setState((prev) => {
        router.replace(
          buildSearchUrl({
            domain: prev.currentDomain || undefined,
            focus: prev.focus,
            focusId: prev.focusId,
            privateAnalyze,
          }),
          { scroll: false }
        );
        return { ...prev, privateAnalyze };
      });
    },
    [router]
  );

  const setDomain = useCallback(
    (domain: string, opts?: { focus?: string; id?: string; privateAnalyze?: boolean }) => {
      const trimmedDomain = domain.trim().toLowerCase();
      const isValid = validateDomain(trimmedDomain);
      const privateAnalyze = opts?.privateAnalyze ?? privateRef.current;
      privateRef.current = privateAnalyze;

      setState((prev) => ({
        ...prev,
        currentDomain: trimmedDomain,
        isValidDomain: isValid,
        searchError: isValid ? undefined : 'Please enter a valid domain name',
        focus: opts?.focus,
        focusId: opts?.id,
        privateAnalyze,
      }));

      router.replace(
        buildSearchUrl({
          domain: trimmedDomain || undefined,
          focus: opts?.focus,
          focusId: opts?.id,
          privateAnalyze: trimmedDomain ? privateAnalyze : false,
        }),
        { scroll: false }
      );
    },
    [router]
  );

  const setFocus = useCallback(
    (focus: string, id: string) => {
      setState((prev) => {
        const domain = prev.currentDomain;
        if (domain) {
          router.replace(
            buildSearchUrl({
              domain,
              focus,
              focusId: id,
              privateAnalyze: prev.privateAnalyze,
            }),
            { scroll: false }
          );
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
    privateAnalyze: state.privateAnalyze,
    setPrivateAnalyze,
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
