import { useQuery } from '@tanstack/react-query';
import { apiClient, DomainAnalysisResponse, WhoisData, RdapData, DnsData, HealthStatus } from '@/lib/api';

// Query keys
export const queryKeys = {
  health: ['health'] as const,
  domainAnalysis: (domain: string) => ['domainAnalysis', domain] as const,
  whois: (domain: string) => ['whois', domain] as const,
  rdap: (domain: string) => ['rdap', domain] as const,
  dns: (domain: string) => ['dns', domain] as const,
};

// Health check hook
export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => apiClient.getHealth(),
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refetch every minute
    retry: 1, // Only retry once for health checks
  });
}

// Domain analysis hook
export function useDomainAnalysis(domain: string, options?: {
  includeWhois?: boolean;
  includeRdap?: boolean;
  includeDns?: boolean;
  includeSecurityAnalysis?: boolean;
  enabled?: boolean;
}) {
  const { enabled = true, ...analysisOptions } = options || {};
  
  return useQuery({
    queryKey: [...queryKeys.domainAnalysis(domain), analysisOptions],
    queryFn: () => apiClient.analyzeDomain(domain, analysisOptions),
    enabled: enabled && Boolean(domain),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
}

// Individual service hooks
export function useWhoisData(domain: string, enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.whois(domain),
    queryFn: () => apiClient.getWhoisData(domain),
    enabled: enabled && Boolean(domain),
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
  });
}

export function useRdapData(domain: string, enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.rdap(domain),
    queryFn: () => apiClient.getRdapData(domain),
    enabled: enabled && Boolean(domain),
    staleTime: 10 * 60 * 1000, // 10 minutes
    // Avoid multiplying wait on hard RDAP timeouts (408 / timed out)
    retry: (failureCount, error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (/timed out|timeout|408/i.test(message)) {
        return false;
      }
      return failureCount < 1;
    },
  });
}

export function useDnsData(domain: string, enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.dns(domain),
    queryFn: () => apiClient.getDnsData(domain),
    enabled: enabled && Boolean(domain),
    staleTime: 5 * 60 * 1000, // 5 minutes - DNS changes more frequently
    retry: 2,
  });
}