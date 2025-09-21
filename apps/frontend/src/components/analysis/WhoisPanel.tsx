'use client';

import React from 'react';
import { Database, Calendar, User, Building, Globe, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { WhoisData } from '@/lib/api';
import { cn } from '@/lib/utils';

interface WhoisPanelProps {
  data?: WhoisData;
  isLoading: boolean;
  compact?: boolean;
  className?: string;
}

export default function WhoisPanel({ data, isLoading, compact = false, className }: WhoisPanelProps) {
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
            <p>No WHOIS data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Not available';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const getDaysUntilExpiry = (expiryDate?: string) => {
    if (!expiryDate) return null;
    try {
      const expiry = new Date(expiryDate);
      const now = new Date();
      const diffTime = expiry.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch {
      return null;
    }
  };

  const daysUntilExpiry = getDaysUntilExpiry(data.expiryDate);

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
        { label: 'Domain', value: data.domainName, icon: <Globe className="h-4 w-4" /> },
        { label: 'Registrar', value: data.registrar, icon: <Building className="h-4 w-4" /> },
        { label: 'Expires', value: formatDate(data.expiryDate), icon: <Calendar className="h-4 w-4" /> },
      ]
    : [
        { label: 'Domain Name', value: data.domainName, icon: <Globe className="h-4 w-4" /> },
        { label: 'Registrar', value: data.registrar, icon: <Building className="h-4 w-4" /> },
        { label: 'Registrant', value: data.registrant, icon: <User className="h-4 w-4" /> },
        { label: 'Creation Date', value: formatDate(data.creationDate), icon: <Calendar className="h-4 w-4" /> },
        { label: 'Updated Date', value: formatDate(data.updatedDate), icon: <Clock className="h-4 w-4" /> },
        { label: 'Expiry Date', value: formatDate(data.expiryDate), icon: <Calendar className="h-4 w-4" /> },
        { label: 'Status', value: data.status?.join(', '), icon: null },
        { label: 'Name Servers', value: data.nameServers?.join(', '), icon: null },
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
          {daysUntilExpiry !== null && (
            <Badge variant={expiryStatus.variant}>
              {expiryStatus.text}
            </Badge>
          )}
        </div>
        <CardDescription>Domain registration and ownership details</CardDescription>
      </CardHeader>
      <CardContent>
        <div className={cn("space-y-3", compact && "space-y-2")}>
          {fieldsToShow.map(({ label, value, icon }, index) => {
            if (!value) return null;
            
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
                  "text-right max-w-[200px] break-words",
                  compact && "text-sm"
                )}>
                  {Array.isArray(value) ? value.join(', ') : value}
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