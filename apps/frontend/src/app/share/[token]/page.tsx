'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Globe, Shield, AlertTriangle, ArrowLeft } from 'lucide-react';
import { apiClient, AnalysisSnapshot, ShareResolveResponse } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/theme-toggle';

export default function SharePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token || '';
  const [data, setData] = useState<ShareResolveResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!token) {
        setError('Missing share token');
        setLoading(false);
        return;
      }
      try {
        const resolved = await apiClient.resolveShareToken(token);
        if (!cancelled) {
          setData(resolved);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError('Share link not found or expired');
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const snapshot: AnalysisSnapshot | undefined = data?.snapshot;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-6 flex items-center justify-between">
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
              <p className="text-sm text-muted-foreground">Shared analysis snapshot</p>
            </div>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
        <Button variant="outline" size="sm" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to analyzer
          </Link>
        </Button>

        {loading && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Loading shared snapshot…
            </CardContent>
          </Card>
        )}

        {!loading && error && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Unavailable
              </CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {!loading && snapshot && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                {snapshot.domain}
              </CardTitle>
              <CardDescription>
                Snapshot from {new Date(snapshot.analyzedAt).toLocaleString()}
                {data?.expiresAt
                  ? ` · link expires ${new Date(data.expiresAt).toLocaleString()}`
                  : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border p-4 text-center">
                  <div className="text-3xl font-bold">{snapshot.overallScore}</div>
                  <div className="text-xs text-muted-foreground">Overall score</div>
                </div>
                <div className="rounded-lg border p-4 text-center flex flex-col items-center justify-center gap-2">
                  <Badge variant="outline" className="capitalize">
                    {snapshot.riskLevel} risk
                  </Badge>
                  <div className="text-xs text-muted-foreground">Risk level</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div className="rounded border p-3">
                  <div className="font-semibold">{snapshot.dnsScore}</div>
                  <div className="text-muted-foreground text-xs">DNS</div>
                </div>
                <div className="rounded border p-3">
                  <div className="font-semibold">{snapshot.registrationScore}</div>
                  <div className="text-muted-foreground text-xs">Registration</div>
                </div>
                <div className="rounded border p-3">
                  <div className="font-semibold">{snapshot.rdapScore ?? '—'}</div>
                  <div className="text-muted-foreground text-xs">RDAP</div>
                </div>
              </div>

              {snapshot.events?.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">Events</div>
                  <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                    {snapshot.events.map((event) => (
                      <li key={event}>{event}</li>
                    ))}
                  </ul>
                </div>
              )}

              <Button asChild className="w-full">
                <Link href={`/?domain=${encodeURIComponent(snapshot.domain)}`}>
                  Analyze {snapshot.domain} again
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
