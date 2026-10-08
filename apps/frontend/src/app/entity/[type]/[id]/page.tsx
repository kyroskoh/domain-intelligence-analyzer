'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Network } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { buildAnalyzeHref } from '@/lib/entityLinks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/theme-toggle';

export default function EntityPage() {
  const params = useParams<{ type: string; id: string }>();
  const type = params?.type || '';
  const id = params?.id ? decodeURIComponent(params.id) : '';
  const [domains, setDomains] = useState<string[]>([]);
  const [source, setSource] = useState<string>('');
  const [disclaimer, setDisclaimer] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!type || !id) {
        setError('Missing entity');
        setLoading(false);
        return;
      }
      try {
        const data = await apiClient.getEntity(type, id);
        if (!cancelled) {
          setDomains(data.relatedDomains || []);
          setSource(data.source);
          setDisclaimer(data.disclaimer || '');
          setError(null);
        }
      } catch {
        if (!cancelled) setError('Entity not found or relations unavailable');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [type, id]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-6 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-3 hover:opacity-80">
            <div className="flex items-center justify-center w-10 h-10 bg-primary text-primary-foreground rounded-lg">
              <Network className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">DomainPeek</h1>
              <p className="text-sm text-muted-foreground">Entity relations</p>
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

        <Card>
          <CardHeader>
            <CardTitle className="capitalize">
              {type}: {id}
            </CardTitle>
            <CardDescription>
              Domains seen with this entity from prior analyses on this instance
              {source ? ` · source ${source}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && <p className="text-muted-foreground">Loading…</p>}
            {error && <p className="text-destructive">{error}</p>}
            {!loading && !error && domains.length === 0 && (
              <p className="text-muted-foreground">
                No related domains indexed yet. Analyze domains to populate the graph.
              </p>
            )}
            <ul className="space-y-2">
              {domains.map((d) => (
                <li key={d}>
                  <Link
                    href={buildAnalyzeHref(d)}
                    className="font-mono underline-offset-4 hover:underline"
                  >
                    {d}
                  </Link>
                </li>
              ))}
            </ul>
            {disclaimer && (
              <p className="text-xs text-muted-foreground">{disclaimer}</p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
