// API hooks
export {
  useHealth,
  useDomainAnalysis,
  useWhoisData,
  useRdapData,
  useDnsData,
  queryKeys,
} from './useApi';

export {
  useAnalyzeDomain,
  useClearDomainCache,
  usePrefetchDomainData,
} from './useMutations';

// State management hooks
export {
  useDomainSearch,
  validateDomain,
  type DomainSearchState,
} from './useDomainSearch';

export {
  useAppState,
  type AppSettings,
  type AppState,
} from './useAppState';

// Re-export common UI hooks
export { useToast } from './use-toast';