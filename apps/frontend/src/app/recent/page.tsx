'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Globe, Clock, ArrowLeft, ExternalLink } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { formatTimestamp } from '@/lib/utils';
import { useAppState } from '@/hooks';

type RecentEntry = {
  domain: string;
  snapshotId: string;
  analyzedAt: string;
  overallScore: number;
  riskLevel: string;
  shareToken: string;
  sharePath: string;
};

function riskVariant(
  risk: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (risk === 'critical' || risk === 'high') return 'destructive';
  if (risk === 'medium') return 'secondary';
  return 'outline';
}

export default function RecentPage() {
  const { settings } = useAppState();
  const dateTimezone = settings.dateTimezone ?? 'utc';
  const [entries, setEntries] = useState<RecentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiClient.getRecentAnalyses(50);
        if (!cancelled) {
          setEntries(data.entries || []);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setEntries([]);
          setError('Could not load recent analyses. Redis may be unavailable.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-6 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center space-x-3 rounded-lg outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-center justify-center w-10 h-10 bg-primary text-primary-foreground rounded-lg">
              <Globe className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">DomainPeek</h1>
              <p className="text-sm text-muted-foreground">Recently analyzed domains</p>
            </div>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Recent analyses</h2>
            <p className="text-muted-foreground text-sm">
              Last 50 unique announced domains. Private analyses are not listed.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Analyze
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" />
              Public feed
            </CardTitle>
            <CardDescription>
              Each row links to a frozen shareable snapshot from that analysis run.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
            {!loading && error && (
              <p className="text-sm text-muted-foreground">{error}</p>
            )}
            {!loading && !error && entries.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No announced analyses yet. Analyze a domain (without Private) to appear here.
              </p>
            )}
            {!loading && entries.length > 0 && (
              <ul className="divide-y">
                {entries.map((entry) => (
                  <li
                    key={`${entry.domain}:${entry.snapshotId}`}
                    className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/?domain=${encodeURIComponent(entry.domain)}`}
                          className="font-medium hover:underline truncate"
                        >
                          {entry.domain}
                        </Link>
                        <Badge variant={riskVariant(entry.riskLevel)} className="text-xs">
                          {entry.riskLevel}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          score {entry.overallScore}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatTimestamp(entry.analyzedAt, dateTimezone) || entry.analyzedAt}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" asChild className="shrink-0">
                      <Link href={entry.sharePath}>
                        View snapshot
                        <ExternalLink className="h-3 w-3 ml-2" />
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
