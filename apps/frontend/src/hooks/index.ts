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

export {
  useWebSocket,
  type WebSocketNotification,
  type ConnectionStatus,
} from './useWebSocket';

// Re-export common UI hooks
export { useToast, toast } from './use-toast';
