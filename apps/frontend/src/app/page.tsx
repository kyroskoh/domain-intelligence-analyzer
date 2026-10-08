'use client';

import React, { useState } from 'react';
import { Globe, Activity, TrendingUp } from 'lucide-react';
import DomainSearch from '@/components/analysis/DomainSearch';
import DomainDashboard from '@/components/analysis/DomainDashboard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { RealTimeNotifications } from '@/components/notifications/RealTimeNotifications';
import { useHealth, useDomainSearch, useAppState } from '@/hooks';

export default function Home() {
  const [analyzedDomain, setAnalyzedDomain] = useState<string>('');
  const { domain } = useDomainSearch();
  const { connectionStatus } = useAppState();
  const healthQuery = useHealth();

  const handleDomainAnalyzed = (domain: string) => {
    setAnalyzedDomain(domain);
  };

  const displayDomain = analyzedDomain || domain;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-10 h-10 bg-primary text-primary-foreground rounded-lg">
                <Globe className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">DomainPeek</h1>
                <p className="text-sm text-muted-foreground">
                  Comprehensive domain analysis and security insights
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <ThemeToggle />

              <RealTimeNotifications monitoredDomain={displayDomain || undefined} />

              <Badge 
                variant={connectionStatus === 'online' ? 'default' : 'destructive'}
                className="text-xs"
              >
                {connectionStatus === 'online' ? 'Online' : 'Offline'}
              </Badge>
              
              {healthQuery.data && (
                <Badge variant="outline" className="text-xs">
                  <Activity className="h-3 w-3 mr-1" />
                  API: {healthQuery.data.status}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          {/* Search Section */}
          <section className="text-center space-y-6">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tight">
                Analyze Any Domain
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Get comprehensive insights including WHOIS data, DNS records, RDAP information, 
                and security analysis for any domain name.
              </p>
            </div>
            
            <DomainSearch 
              onDomainAnalyzed={handleDomainAnalyzed}
              className="mx-auto"
              autoFocus
            />
          </section>

          {/* Features Overview */}
          {!displayDomain && (
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Globe className="h-5 w-5" />
                    <span>Domain Intelligence</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Access detailed WHOIS, RDAP, and DNS information for comprehensive 
                    domain intelligence gathering.
                  </CardDescription>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Activity className="h-5 w-5" />
                    <span>Real-time Analysis</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Get up-to-date domain information with real-time DNS lookups 
                    and fresh data from authoritative sources.
                  </CardDescription>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <TrendingUp className="h-5 w-5" />
                    <span>Security Insights</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Comprehensive security analysis with threat detection, 
                    reputation scoring, and actionable recommendations.
                  </CardDescription>
                </CardContent>
              </Card>
            </section>
          )}

          {/* Domain Analysis Results */}
          {displayDomain && (
            <section>
              <DomainDashboard domain={displayDomain} />
            </section>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-16">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>
              © 2025 DomainPeek. Built with Next.js and React by{" "}
              <a
                href="https://github.com/kyroskoh"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground underline-offset-4 hover:underline"
              >
                Kyros Koh
              </a>
              .
            </p>
            <div className="flex items-center space-x-4">
              <a
                href="https://domainpeek.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground underline-offset-4 hover:underline"
              >
                domainpeek.xyz
              </a>
              <span>WHOIS + RDAP for all IANA-listed TLDs</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}