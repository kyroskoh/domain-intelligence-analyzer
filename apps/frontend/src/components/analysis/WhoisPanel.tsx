'use client';

import React from 'react';
import Link from 'next/link';
import { Database, Calendar, User, Building, Globe, Clock, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { WhoisData, RdapData, ContactInfo } from '@/lib/api';
import { cn, formatDisplayDate, DateDisplayTimezone, getTimezoneLabel } from '@/lib/utils';
import { hrefForNameserver, hrefForRegistrar } from '@/lib/entityLinks';

interface WhoisPanelProps {
  data?: WhoisData;
  /** When WHOIS fields are thin/missing, fill dates and status from RDAP */
  rdapFallback?: RdapData;
  isLoading: boolean;
  compact?: boolean;
  className?: string;
  warning?: string;
  warnings?: string[];
  dateTimezone?: DateDisplayTimezone;
}

function formatContactValue(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return String(value);

  const contact = value as ContactInfo & { org?: string };
  const parts = [
    contact.name,
    contact.organization || contact.org,
    contact.email,
  ]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean);

  if (parts.length) return parts.join(' · ');

  // Last resort: avoid dumping full JSON for empty-ish objects
  const fallback = Object.values(contact)
    .filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))
    .slice(0, 3);
  return fallback.length ? fallback.join(' · ') : undefined;
}

function eventDate(rdap: RdapData | undefined, ...actions: string[]): string | undefined {
  if (!rdap?.events?.length) return undefined;
  const wanted = new Set(actions.map((a) => a.toLowerCase()));
  const match = rdap.events.find((e) => wanted.has((e.eventAction || '').toLowerCase().trim()));
  return match?.eventDate;
}

function enrichWhoisFromRdap(whois?: WhoisData, rdap?: RdapData): WhoisData | undefined {
  if (!whois && !rdap) return undefined;
  if (!rdap) return whois;

  const base: WhoisData = whois
    ? { ...whois }
    : {
        domain: rdap.domain || rdap.ldhName || '',
        nameservers: [],
        status: [],
        raw: '',
      };

  const created =
    base.createdDate ||
    base.creationDate ||
    eventDate(rdap, 'registration', 'registered');
  const updated =
    base.updatedDate ||
    eventDate(rdap, 'last changed') ||
    eventDate(rdap, 'last update of rdap database');
  const expires =
    base.expirationDate ||
    base.expiryDate ||
    eventDate(rdap, 'expiration', 'expired');

  return {
    ...base,
    domain: base.domain || rdap.domain || rdap.ldhName || '',
    domainName: base.domainName || base.domain || rdap.ldhName || rdap.domain,
    createdDate: created,
    creationDate: created,
    updatedDate: updated,
    expirationDate: expires,
    expiryDate: expires,
    status:
      base.status?.length
        ? base.status
        : rdap.status?.length
          ? [...rdap.status]
          : [],
    nameservers:
      base.nameservers?.length
        ? base.nameservers
        : (rdap.nameservers || [])
            .map((ns) => ns.ldhName || ns.unicodeName || '')
            .filter(Boolean),
    registrar:
      base.registrar?.name
        ? base.registrar
        : rdap.registrar?.name
          ? { name: rdap.registrar.name, url: rdap.registrar.url }
          : base.registrar,
  };
}

export default function WhoisPanel({
  data: dataProp,
  rdapFallback,
  isLoading,
  compact = false,
  className,
  warning,
  warnings,
  dateTimezone = 'utc',
}: WhoisPanelProps) {
  const panelWarnings = [
    ...(warning ? [warning] : []),
    ...(warnings || []).filter((w) => w && w !== warning),
  ];
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Database className="h-5 w-5" />
            <CardTitle className="text-lg">WHOIS Information</CardTitle>
          </div>
          <CardDescription>Domain registration and ownership details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {Array.from({ length: compact ? 3 : 6 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = enrichWhoisFromRdap(dataProp, rdapFallback);

  if (!data) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Database className="h-5 w-5" />
            <CardTitle className="text-lg">WHOIS Information</CardTitle>
          </div>
          <CardDescription>Domain registration and ownership details</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Database className="h-12 w-12 mx-auto mb-2" />
            <p>{warning || 'No WHOIS data available'}</p>
            {!warning && (
              <p className="text-xs mt-2">
                WHOIS is attempted for all delegated TLDs via registry servers and IANA referral.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const created = data.createdDate || data.creationDate;
  const updated = data.updatedDate;
  const expires = data.expirationDate || data.expiryDate;
  const filledFromRdap = Boolean(
    rdapFallback &&
      (
        ((!dataProp?.createdDate && !dataProp?.creationDate) && created) ||
        ((!dataProp?.expirationDate && !dataProp?.expiryDate) && expires) ||
        !dataProp
      )
  );

  const getDaysUntilExpiry = (expiryDate?: string) => {
    if (!expiryDate) return null;
    const expiry = new Date(expiryDate);
    if (Number.isNaN(expiry.getTime())) return null;
    const now = new Date();
    const diffTime = expiry.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysUntilExpiry = getDaysUntilExpiry(expires);

  const getExpiryStatus = (days: number | null) => {
    if (days === null) return { variant: 'secondary' as const, text: 'Unknown' };
    if (days < 0) return { variant: 'destructive' as const, text: 'Expired' };
    if (days <= 30) return { variant: 'destructive' as const, text: `${days} days` };
    if (days <= 90) return { variant: 'secondary' as const, text: `${days} days` };
    return { variant: 'default' as const, text: `${days} days` };
  };

  const expiryStatus = getExpiryStatus(daysUntilExpiry);

  const fieldsToShow = compact 
    ? [
        { label: 'Domain', value: data.domainName || data.domain, icon: <Globe className="h-4 w-4" /> },
        { label: 'Registrar', value: data.registrar?.name || data.registrar, icon: <Building className="h-4 w-4" /> },
        { label: 'Expires', value: formatDisplayDate(expires, dateTimezone), icon: <Calendar className="h-4 w-4" /> },
      ]
    : [
        { label: 'Domain Name', value: data.domainName || data.domain, icon: <Globe className="h-4 w-4" /> },
        { label: 'Registrar', value: data.registrar?.name || data.registrar, icon: <Building className="h-4 w-4" /> },
        { label: 'Registrant', value: formatContactValue(data.registrant), icon: <User className="h-4 w-4" /> },
        { label: 'Creation Date', value: formatDisplayDate(created, dateTimezone), icon: <Calendar className="h-4 w-4" /> },
        { label: 'Updated Date', value: formatDisplayDate(updated, dateTimezone), icon: <Clock className="h-4 w-4" /> },
        { label: 'Expiry Date', value: formatDisplayDate(expires, dateTimezone), icon: <Calendar className="h-4 w-4" /> },
        { label: 'Status', value: data.status?.join(', '), icon: null },
        { label: 'Name Servers', value: data.nameservers?.join(', '), icon: null },
      ];

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Database className="h-5 w-5" />
            <CardTitle className={cn("text-lg", compact && "text-base")}>
              WHOIS Information
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {filledFromRdap && (
              <Badge variant="outline" className="text-xs">
                Dates from RDAP
              </Badge>
            )}
            {daysUntilExpiry !== null && (
              <Badge variant={expiryStatus.variant}>
                {expiryStatus.text}
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>
          {filledFromRdap
            ? `WHOIS gaps filled from RDAP · DD/MMM/YYYY (+ time when available, ${getTimezoneLabel(dateTimezone)})`
            : `Domain registration details · DD/MMM/YYYY (+ time when available, ${getTimezoneLabel(dateTimezone)})`}
        </CardDescription>
        {panelWarnings.length > 0 && (
          <div className="mt-2 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <ul className="space-y-0.5">
              {panelWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className={cn("space-y-3", compact && "space-y-2")}>
          {fieldsToShow.map(({ label, value, icon }, index) => {
            if (!value) return null;

            const display =
              Array.isArray(value)
                ? value.join(', ')
                : typeof value === 'object' && value !== null
                  ? formatContactValue(value) || 'N/A'
                  : String(value);
            
            return (
              <div key={index} className="flex items-start justify-between">
                <div className="flex items-center space-x-2 min-w-0 flex-1">
                  {icon}
                  <span className={cn(
                    "font-medium text-muted-foreground",
                    compact && "text-sm"
                  )}>
                    {label}:
                  </span>
                </div>
                <div className={cn(
                  "text-right max-w-[240px] break-words",
                  compact && "text-sm"
                )}>
                  {label === 'Registrar' && data.registrar?.name ? (
                    (() => {
                      const link = hrefForRegistrar(data.registrar.name, {
                        url: data.registrar.url,
                        ianaId: (data.registrar as { ianaId?: string }).ianaId,
                      });
                      return link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline-offset-4 hover:underline"
                        >
                          {data.registrar.name}
                        </a>
                      ) : (
                        <Link href={link.href} className="underline-offset-4 hover:underline">
                          {data.registrar.name}
                        </Link>
                      );
                    })()
                  ) : label === 'Name Servers' && data.nameservers?.length ? (
                    <ul className="space-y-0.5">
                      {data.nameservers.map((ns) => (
                        <li key={ns}>
                          <Link
                            href={hrefForNameserver(ns)}
                            className="font-mono text-xs underline-offset-4 hover:underline"
                          >
                            {ns}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    display
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!compact && data.rawData && (
          <div className="mt-6">
            <details className="space-y-2">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                View Raw WHOIS Data
              </summary>
              <pre className="mt-2 bg-muted p-3 rounded text-xs overflow-auto max-h-40 whitespace-pre-wrap">
                {data.rawData}
              </pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}