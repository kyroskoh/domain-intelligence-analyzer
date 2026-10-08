'use client';

import React, { useState, useEffect } from 'react';
import { Search, History, X, Globe, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useDomainSearch, useAnalyzeDomain, validateDomain } from '@/hooks';
import { cn } from '@/lib/utils';

interface DomainSearchProps {
  onDomainAnalyzed?: (domain: string) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function DomainSearch({
  onDomainAnalyzed,
  className,
  placeholder = "Enter domain name (e.g., example.com)",
  autoFocus = false,
}: DomainSearchProps) {
  const {
    domain,
    searchHistory,
    isValidDomain,
    searchError,
    searchDomain,
    setDomain,
    removeFromHistory,
    clearHistory,
  } = useDomainSearch();

  const analyzeDomainMutation = useAnalyzeDomain();
  
  const [inputValue, setInputValue] = useState(domain);
  const [showHistory, setShowHistory] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const autoAnalyzedRef = React.useRef<string | null>(null);

  // Sync input with domain state
  useEffect(() => {
    setInputValue(domain);
  }, [domain]);

  const runAnalyze = async (target: string) => {
    setIsSubmitting(true);
    try {
      await analyzeDomainMutation.mutateAsync({
        domain: target,
        options: {
          includeWhois: true,
          includeRdap: true,
          includeDns: true,
          includeSecurityAnalysis: true,
        },
      });
      onDomainAnalyzed?.(target);
      setShowHistory(false);
    } catch (error) {
      console.error('Domain analysis failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Auto-analyze when domain is hydrated from ?domain=
  useEffect(() => {
    if (!domain || !isValidDomain) return;
    if (autoAnalyzedRef.current === domain) return;
    autoAnalyzedRef.current = domain;
    void runAnalyze(domain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, isValidDomain]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputValue.trim()) return;
    
    const success = searchDomain(inputValue.trim());
    if (!success) return;

    await runAnalyze(inputValue.trim().toLowerCase());
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);
    setDomain(value);
  };

  const handleHistorySelect = (selectedDomain: string) => {
    setInputValue(selectedDomain);
    setDomain(selectedDomain);
    setShowHistory(false);
  };

  const handleRemoveFromHistory = (domainToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeFromHistory(domainToRemove);
  };

  const isLoading = isSubmitting || analyzeDomainMutation.isPending;

  return (
    <div className={cn("w-full max-w-2xl", className)}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <div className="flex space-x-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={inputValue}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder={placeholder}
                autoFocus={autoFocus}
                className={cn(
                  "pl-10 pr-10",
                  searchError && "border-red-500 focus-visible:ring-red-500"
                )}
                disabled={isLoading}
              />
              {searchHistory.length > 0 && (
                <Popover open={showHistory} onOpenChange={setShowHistory}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
                      disabled={isLoading}
                    >
                      <History className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="end">
                    <Command>
                      <CommandInput placeholder="Search history..." />
                      <CommandList>
                        <CommandEmpty>No domains in history.</CommandEmpty>
                        <CommandGroup heading="Recent searches">
                          {searchHistory.map((historyDomain) => (
                            <CommandItem
                              key={historyDomain}
                              value={historyDomain}
                              onSelect={() => handleHistorySelect(historyDomain)}
                              className="flex items-center justify-between"
                            >
                              <div className="flex items-center space-x-2">
                                <Globe className="h-4 w-4" />
                                <span>{historyDomain}</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
                                onClick={(e) => handleRemoveFromHistory(historyDomain, e)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                        <div className="border-t p-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs"
                            onClick={clearHistory}
                          >
                            Clear all history
                          </Button>
                        </div>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <Button
              type="submit"
              disabled={!isValidDomain || isLoading}
              className="min-w-[100px]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Analyze
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Validation feedback */}
        {searchError && (
          <div className="flex items-center space-x-2 text-sm text-red-600">
            <div className="h-1 w-1 rounded-full bg-red-600" />
            <span>{searchError}</span>
          </div>
        )}

        {/* Domain validation indicator */}
        {inputValue && !searchError && (
          <div className="flex items-center space-x-2">
            <Badge variant={isValidDomain ? "default" : "destructive"} className="text-xs">
              {isValidDomain ? "Valid domain" : "Invalid domain format"}
            </Badge>
            {isValidDomain && (
              <span className="text-xs text-muted-foreground">
                Press Enter or click Analyze to start
              </span>
            )}
          </div>
        )}
      </form>

      {/* Quick examples */}
      {!inputValue && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Try these examples:</p>
          <div className="flex flex-wrap gap-2">
            {[
              'domainpeek.xyz', // .xyz
              'google.com', // .com
              'wikipedia.org', // .org
              'speedtest.net', // .net
              'twitch.tv', // .tv
              'github.io', // .io
              'google.app', // .app
              'web.dev', // .dev
              'character.ai', // .ai
              'proton.me', // .me
              'carrd.co', // .co
              'bbc.co.uk', // .uk
            ].map((example) => (
              <Button
                key={example}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => handleInputChange(example)}
                disabled={isLoading}
              >
                {example}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}