'use client';

import React, { useState } from 'react';
import { Globe, Server, MapPin, AlertCircle, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DnsData } from '@/lib/api';
import { cn } from '@/lib/utils';

interface DnsPanelProps {
  data?: DnsData;
  isLoading: boolean;
  compact?: boolean;
  className?: string;
  warning?: string;
  warnings?: string[];
}

export default function DnsPanel({
  data,
  isLoading,
  compact = false,
  className,
  warning,
  warnings,
}: DnsPanelProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const panelWarnings = [
    ...(warning ? [warning] : []),
    ...(warnings || []).filter((w) => w && w !== warning),
  ];

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Globe className="h-5 w-5" />
            <CardTitle className="text-lg">DNS Records</CardTitle>
          </div>
          <CardDescription>Domain Name System configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {Array.from({ length: compact ? 4 : 6 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-48" />
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
            <Globe className="h-5 w-5" />
            <CardTitle className="text-lg">DNS Records</CardTitle>
          </div>
          <CardDescription>Domain Name System configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Globe className="h-12 w-12 mx-auto mb-2" />
            <p>{warning || panelWarnings[0] || 'No DNS data available'}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const warningsNote =
    panelWarnings.length > 0 ? (
      <div className="mt-2 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <ul className="space-y-0.5">
          {panelWarnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>
    ) : null;

  const renderDnsRecord = (type: string, records: string[] | any[]) => {
    if (!records || records.length === 0) return null;

    return (
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="text-xs font-mono">
            {type}
          </Badge>
          <span className="text-sm font-medium text-muted-foreground">
            {records.length} record{records.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="space-y-1">
          {records.map((record, index) => (
            <div 
              key={index} 
              className={cn(
                "font-mono text-sm p-2 bg-muted rounded border-l-2",
                getRecordTypeColor(type)
              )}
            >
              {typeof record === 'string' ? record : JSON.stringify(record)}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const getRecordTypeColor = (type: string) => {
    const colors = {
      A: 'border-l-blue-500',
      AAAA: 'border-l-purple-500',
      CNAME: 'border-l-green-500',
      MX: 'border-l-orange-500',
      TXT: 'border-l-yellow-500',
      NS: 'border-l-red-500',
      SOA: 'border-l-pink-500',
      SRV: 'border-l-indigo-500',
      PTR: 'border-l-teal-500',
    };
    return colors[type as keyof typeof colors] || 'border-l-gray-500';
  };

  const renderNameserverHealth = (nameserver: any, index: number) => {
    const isHealthy = nameserver.healthy !== false; // Assume healthy if not specified
    const responseTime = nameserver.responseTime || 0;
    
    return (
      <div key={index} className="flex items-center justify-between p-2 border rounded">
        <div className="flex items-center space-x-2">
          <div className={cn(
            "w-2 h-2 rounded-full",
            isHealthy ? "bg-green-500" : "bg-red-500"
          )} />
          <span className="font-mono text-sm">{nameserver.name}</span>
        </div>
        <div className="flex items-center space-x-2">
          {responseTime > 0 && (
            <span className="text-xs text-muted-foreground">
              {responseTime}ms
            </span>
          )}
          {isHealthy ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-500" />
          )}
        </div>
      </div>
    );
  };

  const recordTypes = [
    { key: 'a', label: 'A', records: data.a },
    { key: 'aaaa', label: 'AAAA', records: data.aaaa },
    { key: 'cname', label: 'CNAME', records: data.cname },
    { key: 'mx', label: 'MX', records: data.mx },
    { key: 'txt', label: 'TXT', records: data.txt },
    { key: 'ns', label: 'NS', records: data.ns },
    { key: 'soa', label: 'SOA', records: data.soa },
    { key: 'srv', label: 'SRV', records: data.srv },
    { key: 'ptr', label: 'PTR', records: data.ptr },
  ].filter(record => record.records && record.records.length > 0);

  const primaryRecords = recordTypes.filter(r => ['A', 'AAAA', 'CNAME', 'MX'].includes(r.label));
  const totalRecords = recordTypes.reduce((sum, record) => sum + (record.records?.length || 0), 0);

  if (compact) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Globe className="h-5 w-5" />
              <CardTitle className="text-base">DNS Records</CardTitle>
            </div>
            <Badge variant="outline">
              {totalRecords} records
            </Badge>
          </div>
          <CardDescription>Domain Name System configuration</CardDescription>
          {warningsNote}
        </CardHeader>
        <CardContent className="space-y-3">
          {primaryRecords.slice(0, 3).map(record => (
            <div key={record.key}>
              {renderDnsRecord(record.label, record.records || [])}
            </div>
          ))}
          {recordTypes.length > 3 && (
            <p className="text-xs text-muted-foreground">
              +{recordTypes.length - 3} more record types
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Globe className="h-5 w-5" />
            <CardTitle className="text-lg">DNS Records</CardTitle>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline">
              {totalRecords} records
            </Badge>
            {data.nameserverHealth && (
              <Badge variant={data.nameserverHealth.every((ns: any) => ns.healthy) ? "default" : "destructive"}>
                NS Health
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>Domain Name System configuration and health</CardDescription>
        {warningsNote}
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="records">All Records</TabsTrigger>
            <TabsTrigger value="health">Health</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {primaryRecords.map(record => (
                <div key={record.key}>
                  {renderDnsRecord(record.label, record.records || [])}
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="records" className="space-y-4 mt-4">
            <div className="space-y-4">
              {recordTypes.map(record => (
                <div key={record.key}>
                  {renderDnsRecord(record.label, record.records || [])}
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="health" className="space-y-4 mt-4">
            <div className="space-y-4">
              {data.nameserverHealth && data.nameserverHealth.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Server className="h-5 w-5" />
                    <h4 className="font-semibold">Nameserver Health</h4>
                  </div>
                  <div className="space-y-2">
                    {data.nameserverHealth.map((nameserver, index) => 
                      renderNameserverHealth(nameserver, index)
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-2" />
                  <p>Nameserver health data not available</p>
                </div>
              )}

              {/* DNS Propagation Status */}
              {data.propagationStatus && (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <MapPin className="h-5 w-5" />
                    <h4 className="font-semibold">Global Propagation</h4>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    DNS propagation information would be displayed here
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}