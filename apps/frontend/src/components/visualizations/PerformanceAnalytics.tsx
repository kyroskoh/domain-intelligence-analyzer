'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Clock, Globe, Shield, Server } from 'lucide-react';

export interface MeasuredPerformanceProps {
  domain: string;
  className?: string;
  /** Nameserver health from real DNS analysis */
  dnsData?: {
    nameservers?: Array<{
      name: string;
      ip?: string;
      responseTime?: number;
      reachable: boolean;
    }>;
    dnssec?: { enabled?: boolean; valid?: boolean };
  };
  /** TLS probe result when available */
  sslData?: {
    handshakeMs?: number;
    daysRemaining?: number;
    protocol?: string;
    fingerprintSha256?: string;
    isCloudflareOriginCa?: boolean;
    sanCount?: number;
    validTo?: string;
  };
  /** Security category score for certificate when available */
  sslSecurityScore?: number;
}

/**
 * Shows only measured DNS / TLS metrics from analysis — no synthetic uptime or regional fiction.
 */
export function PerformanceAnalytics({
  domain,
  className = '',
  dnsData,
  sslData,
  sslSecurityScore,
}: MeasuredPerformanceProps) {
  const nsStats = useMemo(() => {
    const list = dnsData?.nameservers || [];
    const reachable = list.filter((n) => n.reachable);
    const times = reachable
      .map((n) => n.responseTime)
      .filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
    const avg =
      times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : undefined;
    return { list, reachable: reachable.length, avg, total: list.length };
  }, [dnsData?.nameservers]);

  const hasDns = nsStats.total > 0;
  const hasSsl = Boolean(sslData?.fingerprintSha256 || sslData?.handshakeMs != null);

  if (!hasDns && !hasSsl) {
    return (
      <div className={`space-y-6 ${className}`}>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No measured performance data</h3>
              <p className="text-sm">
                Run an analysis to see nameserver latency and TLS handshake timing for {domain}.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Measured performance — {domain}
          </CardTitle>
          <CardDescription>
            Values from this analysis only (nameserver probes and TLS handshake). Synthetic uptime
            and regional availability are not shown.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {hasDns && (
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Globe className="h-4 w-4" />
                  Avg NS response
                </div>
                <div className="text-2xl font-bold">
                  {nsStats.avg != null ? `${nsStats.avg}ms` : '—'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {nsStats.reachable}/{nsStats.total} nameservers reachable
                </p>
              </div>
            )}
            {hasSsl && (
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Clock className="h-4 w-4" />
                  TLS handshake
                </div>
                <div className="text-2xl font-bold">
                  {sslData?.handshakeMs != null ? `${sslData.handshakeMs}ms` : '—'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {sslData?.protocol || 'TLS'}
                  {sslData?.daysRemaining != null
                    ? ` · ${sslData.daysRemaining}d remaining`
                    : ''}
                </p>
              </div>
            )}
            {(sslSecurityScore != null || dnsData?.dnssec) && (
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Shield className="h-4 w-4" />
                  Security signals
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {sslSecurityScore != null && (
                    <Badge variant="outline">SSL score {sslSecurityScore}</Badge>
                  )}
                  {dnsData?.dnssec && (
                    <Badge variant={dnsData.dnssec.enabled ? 'default' : 'secondary'}>
                      DNSSEC {dnsData.dnssec.enabled ? 'present' : 'not detected'}
                    </Badge>
                  )}
                  {sslData?.isCloudflareOriginCa && (
                    <Badge variant="secondary">Cloudflare Origin CA</Badge>
                  )}
                </div>
              </div>
            )}
          </div>

          {hasDns && (
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Server className="h-4 w-4" />
                Nameserver probes
              </h4>
              <ul className="space-y-2 text-sm">
                {nsStats.list.map((ns) => (
                  <li
                    key={ns.name}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2"
                  >
                    <span className="font-mono">{ns.name}</span>
                    <span className="text-muted-foreground">
                      {ns.reachable
                        ? `${ns.responseTime ?? '—'}ms${ns.ip ? ` · ${ns.ip}` : ''}`
                        : 'unreachable'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasSsl && sslData?.fingerprintSha256 && (
            <div className="text-xs text-muted-foreground font-mono break-all">
              Cert SHA-256: {sslData.fingerprintSha256}
              {sslData.sanCount != null ? ` · ${sslData.sanCount} SANs` : ''}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
