'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { Globe, Activity, TrendingUp } from 'lucide-react';
import DomainSearch from '@/components/analysis/DomainSearch';
import DomainDashboard from '@/components/analysis/DomainDashboard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { RealTimeNotifications } from '@/components/notifications/RealTimeNotifications';
import { useHealth, useDomainSearch, useAppState } from '@/hooks';
import { apiClient } from '@/lib/api';

function HomeInner() {
  const [analyzedDomain, setAnalyzedDomain] = useState<string>('');
  const { domain } = useDomainSearch();
  const { connectionStatus } = useAppState();
  const healthQuery = useHealth();
  const [clientEnv, setClientEnv] = useState<{
    ip?: string;
    isp?: string;
    asOrg?: string;
    country?: string;
  } | null>(null);

  const handleDomainAnalyzed = (d: string) => {
    setAnalyzedDomain(d);
  };

  const displayDomain = analyzedDomain || domain;

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getClientEnv()
      .then((env) => {
        if (!cancelled) setClientEnv(env);
      })
      .catch(() => {
        if (!cancelled) setClientEnv(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center space-x-3 rounded-lg outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="DomainPeek home"
            >
              <div className="flex items-center justify-center w-10 h-10 bg-primary text-primary-foreground rounded-lg">
                <Globe className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">DomainPeek</h1>
                <p className="text-sm text-muted-foreground">
                  Comprehensive domain analysis and security insights
                </p>
              </div>
            </Link>
            
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

      <main className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          {clientEnv?.ip && (
            <p className="text-center text-xs text-muted-foreground">
              Your network: {clientEnv.ip}
              {clientEnv.isp || clientEnv.asOrg
                ? ` · ${clientEnv.isp || clientEnv.asOrg}`
                : ''}
              {clientEnv.country ? ` · ${clientEnv.country}` : ''}
            </p>
          )}

          <section className="text-center space-y-6">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tight">
                Analyze Any Domain
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Get comprehensive insights including WHOIS data, DNS records, RDAP information, 
                TLS certificates, and security analysis for any domain name.
              </p>
            </div>
            
            <DomainSearch 
              onDomainAnalyzed={handleDomainAnalyzed}
              className="mx-auto"
              autoFocus
            />
            <p className="text-sm text-muted-foreground">
              <Link href="/recent" className="underline hover:text-foreground">
                View recently analyzed domains
              </Link>
            </p>
          </section>

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
                    Access detailed WHOIS, RDAP, DNS, and TLS information for comprehensive 
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

          {displayDomain && (
            <section>
              <DomainDashboard domain={displayDomain} />
            </section>
          )}
        </div>
      </main>

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

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background p-8">Loading…</div>}>
      <HomeInner />
    </Suspense>
  );
}
