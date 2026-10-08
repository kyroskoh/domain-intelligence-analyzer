'use client';

import React, { useCallback, useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { DeepLink } from '@/components/DeepLink';
import { cn } from '@/lib/utils';

type RecentEntry = {
  domain: string;
  snapshotId: string;
  analyzedAt: string;
  overallScore: number;
  riskLevel: string;
  shareToken: string;
  sharePath: string;
};

const PREVIEW_LIMIT = 8;

export function RecentDomainsToggle({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<RecentEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (loaded || loading) return;
    setLoading(true);
    try {
      const data = await apiClient.getRecentAnalyses(PREVIEW_LIMIT);
      setEntries(data.entries || []);
      setError(null);
      setLoaded(true);
    } catch {
      setEntries([]);
      setError('Could not load recent analyses.');
    } finally {
      setLoading(false);
    }
  }, [loaded, loading]);

  const handleToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    const next = e.currentTarget.open;
    setOpen(next);
    if (next) void load();
  };

  const preview = entries.slice(0, PREVIEW_LIMIT);

  return (
    <details
      className={cn('mx-auto max-w-sm text-left', className)}
      open={open}
      onToggle={handleToggle}
    >
      <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 text-sm text-muted-foreground underline hover:text-foreground [&::-webkit-details-marker]:hidden">
        View recently analyzed domains
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 transition-transform',
            open && 'rotate-180'
          )}
          aria-hidden
        />
      </summary>

      <div className="mt-3 rounded-md border bg-card text-card-foreground shadow-sm">
        {loading && (
          <p className="px-3 py-3 text-sm text-muted-foreground">Loading…</p>
        )}
        {!loading && error && (
          <p className="px-3 py-3 text-sm text-muted-foreground">{error}</p>
        )}
        {!loading && !error && loaded && preview.length === 0 && (
          <p className="px-3 py-3 text-sm text-muted-foreground">
            No announced analyses yet.
          </p>
        )}
        {!loading && preview.length > 0 && (
          <ul className="divide-y">
            {preview.map((entry) => (
              <li key={`${entry.domain}:${entry.snapshotId}`}>
                <DeepLink
                  href={`/?domain=${encodeURIComponent(entry.domain)}`}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted/60"
                  title={`Open ${entry.domain} in a new tab`}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {entry.domain}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </DeepLink>
              </li>
            ))}
          </ul>
        )}
        {!loading && (
          <div className="border-t px-3 py-2 text-center">
            <DeepLink
              href="/recent"
              className="text-sm text-muted-foreground underline hover:text-foreground"
            >
              See more
            </DeepLink>
          </div>
        )}
      </div>
    </details>
  );
}
