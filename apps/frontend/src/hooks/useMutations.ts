import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, DomainAnalysisOptions } from '@/lib/api';
import { queryKeys } from './useApi';
import { toast } from '@/hooks/use-toast';

// Trigger domain analysis mutation
export function useAnalyzeDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ 
      domain, 
      options 
    }: { 
      domain: string; 
      options?: DomainAnalysisOptions;
    }) => {
      return apiClient.analyzeDomain(domain, options);
    },
    onSuccess: (data, variables) => {
      // Invalidate and refetch related queries
      const { domain } = variables;
      
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.domainAnalysis(domain) 
      });
      
      // Update individual service caches if data is available
      if (data.whois) {
        queryClient.setQueryData(queryKeys.whois(domain), data.whois);
      }
      
      if (data.rdap) {
        queryClient.setQueryData(queryKeys.rdap(domain), data.rdap);
      }
      
      if (data.dns) {
        queryClient.setQueryData(queryKeys.dns(domain), data.dns);
      }

      toast({
        title: "Analysis Complete",
        description: `Domain analysis for ${domain} completed successfully.`,
      });
    },
    onError: (error, variables) => {
      const { domain } = variables;
      
      toast({
        title: "Analysis Failed",
        description: `Failed to analyze domain ${domain}. Please try again.`,
        variant: "destructive",
      });
      
      console.error(`Domain analysis failed for ${domain}:`, error);
    },
  });
}

// Clear cache mutation (useful for forcing fresh data)
export function useClearDomainCache() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (domain: string) => {
      // This doesn't make an API call, just clears local cache
      return Promise.resolve(domain);
    },
    onSuccess: (domain) => {
      // Remove all cached data for this domain
      queryClient.removeQueries({ 
        queryKey: queryKeys.domainAnalysis(domain) 
      });
      queryClient.removeQueries({ 
        queryKey: queryKeys.whois(domain) 
      });
      queryClient.removeQueries({ 
        queryKey: queryKeys.rdap(domain) 
      });
      queryClient.removeQueries({ 
        queryKey: queryKeys.dns(domain) 
      });

      toast({
        title: "Cache Cleared",
        description: `Cached data for ${domain} has been cleared.`,
      });
    },
  });
}

// Prefetch domain data mutation (useful for preloading)
export function usePrefetchDomainData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (domain: string) => {
      // Prefetch all domain-related data
      await Promise.all([
        queryClient.prefetchQuery({
          queryKey: queryKeys.whois(domain),
          queryFn: () => apiClient.getWhoisData(domain),
          staleTime: 10 * 60 * 1000,
        }),
        queryClient.prefetchQuery({
          queryKey: queryKeys.rdap(domain),
          queryFn: () => apiClient.getRdapData(domain),
          staleTime: 10 * 60 * 1000,
        }),
        queryClient.prefetchQuery({
          queryKey: queryKeys.dns(domain),
          queryFn: () => apiClient.getDnsData(domain),
          staleTime: 5 * 60 * 1000,
        }),
      ]);
      
      return domain;
    },
    onSuccess: (domain) => {
      toast({
        title: "Data Preloaded",
        description: `Domain data for ${domain} has been preloaded.`,
      });
    },
    onError: (error, domain) => {
      toast({
        title: "Preload Failed",
        description: `Failed to preload data for ${domain}.`,
        variant: "destructive",
      });
      
      console.error(`Failed to prefetch data for ${domain}:`, error);
    },
  });
}