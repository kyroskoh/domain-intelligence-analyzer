'use client';

import React from 'react';
import { Network, Building, User, Mail, Phone, Calendar, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { RdapData } from '@/lib/api';
import { cn, formatDisplayDate, DateDisplayTimezone, getTimezoneLabel } from '@/lib/utils';

interface RdapPanelProps {
  data?: RdapData;
  isLoading: boolean;
  compact?: boolean;
  className?: string;
  warning?: string;
  dateTimezone?: DateDisplayTimezone;
}

export default function RdapPanel({
  data,
  isLoading,
  compact = false,
  className,
  warning,
  dateTimezone = 'utc',
}: RdapPanelProps) {
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Network className="h-5 w-5" />
            <CardTitle className="text-lg">RDAP Information</CardTitle>
          </div>
          <CardDescription>Registration Data Access Protocol details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {Array.from({ length: compact ? 3 : 5 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-36" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    const isTimeout = Boolean(warning && /timed out|timeout/i.test(warning));
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Network className="h-5 w-5" />
            <CardTitle className="text-lg">RDAP Information</CardTitle>
          </div>
          <CardDescription>Registration Data Access Protocol details</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Network className="h-12 w-12 mx-auto mb-2" />
            <p>
              {warning || 'No RDAP data available for this TLD'}
            </p>
            <p className="text-xs mt-2">
              {isTimeout
                ? 'The RDAP server did not respond in time. Registration details may still appear under WHOIS.'
                : warning
                  ? 'WHOIS may still provide registration details for this domain.'
                  : 'RDAP covers all TLDs listed in the IANA RDAP bootstrap (including new gTLDs). WHOIS may still be available as a fallback.'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderEntity = (entity: any, index: number) => {
    if (!entity) return null;
    
    const roles = entity.roles ? entity.roles.join(', ') : 'Unknown role';
    const name = entity.fn || entity.org || 'Unknown';
    
    return (
      <div key={index} className="border rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {entity.roles?.includes('registrant') && <User className="h-4 w-4" />}
            {entity.roles?.includes('registrar') && <Building className="h-4 w-4" />}
            <span className="font-medium">{name}</span>
          </div>
          <Badge variant="outline" className="text-xs">
            {roles}
          </Badge>
        </div>
        
        {entity.email && (
          <div className="flex items-center space-x-2 text-sm">
            <Mail className="h-3 w-3" />
            <span className="text-muted-foreground">{entity.email}</span>
          </div>
        )}
        
        {entity.tel && (
          <div className="flex items-center space-x-2 text-sm">
            <Phone className="h-3 w-3" />
            <span className="text-muted-foreground">{entity.tel}</span>
          </div>
        )}
        
        {entity.addr && (
          <div className="text-sm text-muted-foreground">
            {Array.isArray(entity.addr) ? entity.addr.join(', ') : entity.addr}
          </div>
        )}
      </div>
    );
  };

  const statusBadges = data.status?.map((status, index) => (
    <Badge key={index} variant="outline" className="text-xs">
      {status}
    </Badge>
  ));

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Network className="h-5 w-5" />
            <CardTitle className={cn("text-lg", compact && "text-base")}>
              RDAP Information
            </CardTitle>
          </div>
          {data.rdapConformance && (
            <Badge variant="default">
              RDAP v{data.rdapConformance[0]?.replace('rdap_level_', '') || '1'}
            </Badge>
          )}
        </div>
        <CardDescription>
          Registration Data Access Protocol details · dates DD/MMM/YYYY (+ time when available, {getTimezoneLabel(dateTimezone)})
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className={cn("space-y-4", compact && "space-y-3")}>
          {/* Basic Information */}
          <div className="space-y-2">
            {data.ldhName && (
              <div className="flex justify-between items-center">
                <span className="font-medium text-muted-foreground">Domain:</span>
                <span>{data.ldhName}</span>
              </div>
            )}
            
            {data.unicodeName && data.unicodeName !== data.ldhName && (
              <div className="flex justify-between items-center">
                <span className="font-medium text-muted-foreground">Unicode Name:</span>
                <span>{data.unicodeName}</span>
              </div>
            )}
            
            {data.port43 && (
              <div className="flex justify-between items-center">
                <span className="font-medium text-muted-foreground">WHOIS Server:</span>
                <span className="text-sm font-mono">{data.port43}</span>
              </div>
            )}
          </div>

          {/* Status */}
          {data.status && data.status.length > 0 && (
            <div className="space-y-2">
              <span className="font-medium text-muted-foreground">Status:</span>
              <div className="flex flex-wrap gap-1">
                {statusBadges}
              </div>
            </div>
          )}

          {/* Events */}
          {data.events && data.events.length > 0 && !compact && (
            <div className="space-y-2">
              <span className="font-medium text-muted-foreground">Important Dates:</span>
              <div className="space-y-1">
                {data.events.map((event, index) => (
                  <div key={index} className="flex justify-between items-center text-sm">
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-3 w-3" />
                      <span className="capitalize">{event.eventAction?.replace('_', ' ')}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {formatDisplayDate(event.eventDate, dateTimezone) || 'Not available'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Entities */}
          {data.entities && data.entities.length > 0 && (
            <div className="space-y-3">
              <span className="font-medium text-muted-foreground">
                {compact ? 'Key Contacts' : 'Related Entities'}:
              </span>
              <div className="space-y-2">
                {(compact ? data.entities.slice(0, 2) : data.entities).map(renderEntity)}
              </div>
              {compact && data.entities.length > 2 && (
                <p className="text-xs text-muted-foreground">
                  +{data.entities.length - 2} more entities
                </p>
              )}
            </div>
          )}

          {/* Name Servers */}
          {data.nameservers && data.nameservers.length > 0 && (
            <div className="space-y-2">
              <span className="font-medium text-muted-foreground">Name Servers:</span>
              <div className="text-sm">
                {data.nameservers.map((ns, index) => (
                  <div key={index} className="font-mono">
                    {typeof ns === 'string' ? ns : ns.ldhName || ns.unicodeName || 'Unknown'}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Links */}
          {data.links && data.links.length > 0 && !compact && (
            <div className="space-y-2">
              <span className="font-medium text-muted-foreground">Related Links:</span>
              <div className="space-y-1">
                {data.links.map((link, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {link.rel || 'Related'}
                    </span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-6 text-xs"
                      onClick={() => window.open(link.href, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw Data Toggle */}
          {!compact && data.raw && (
            <div className="mt-6">
              <details className="space-y-2">
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                  View Raw RDAP Response
                </summary>
                <pre className="mt-2 bg-muted p-3 rounded text-xs overflow-auto max-h-40">
                  {JSON.stringify(data.raw, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}