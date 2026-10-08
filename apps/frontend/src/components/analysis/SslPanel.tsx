'use client';

import React from 'react';
import Link from 'next/link';
import { Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SslCertificateData } from '@/lib/api';
import { hrefForCert, hrefForSan } from '@/lib/entityLinks';
import { cn } from '@/lib/utils';

interface SslPanelProps {
  data?: SslCertificateData | null;
  className?: string;
  ctSans?: string[];
}

export default function SslPanel({ data, className, ctSans }: SslPanelProps) {
  if (!data) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" />
            TLS Certificate
          </CardTitle>
          <CardDescription>No certificate data from this analysis</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={className} id="focus-ssl">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" />
            TLS Certificate
          </CardTitle>
          <div className="flex flex-wrap gap-1">
            {data.isCloudflareOriginCa && (
              <Badge variant="secondary">Cloudflare Origin CA</Badge>
            )}
            {data.hostnameMatch != null && (
              <Badge variant={data.hostnameMatch ? 'default' : 'destructive'}>
                {data.hostnameMatch ? 'Hostname match' : 'Hostname mismatch'}
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>
          Live probe · {data.protocol || 'TLS'}
          {data.handshakeMs != null ? ` · handshake ${data.handshakeMs}ms` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Issuer</span>
          <span className="text-right">{data.issuer}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Valid to</span>
          <span>
            {data.validTo} ({data.daysRemaining}d)
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Fingerprint</span>
          <div>
            <Link
              href={hrefForCert(data.fingerprintSha256)}
              className={cn('font-mono text-xs break-all underline-offset-4 hover:underline')}
            >
              {data.fingerprintSha256}
            </Link>
          </div>
        </div>
        <div>
          <div className="text-muted-foreground mb-1">SANs ({data.sanCount})</div>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {data.sans.map((san) => (
              <li key={san}>
                <Link
                  href={hrefForSan(san)}
                  className="font-mono text-xs underline-offset-4 hover:underline"
                >
                  {san}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground mt-2">
            Shared SANs / CT names do not prove ownership.
          </p>
        </div>
        {ctSans && ctSans.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-1">
              CT-observed names (historical, capped)
            </div>
            <ul className="space-y-1 max-h-32 overflow-y-auto">
              {ctSans.slice(0, 30).map((san) => (
                <li key={san}>
                  <Link
                    href={hrefForSan(san)}
                    className="font-mono text-xs underline-offset-4 hover:underline"
                  >
                    {san}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
