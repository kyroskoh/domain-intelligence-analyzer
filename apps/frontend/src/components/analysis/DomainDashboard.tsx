'use client';

import React from 'react';
import { 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Globe, 
  Shield, 
  Database,
  Network,
  RefreshCw as Refresh,
  Download,
  Eye
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  useDomainAnalysis, 
  useWhoisData, 
  useRdapData, 
  useDnsData, 
  useClearDomainCache,
  useAppState
} from '@/hooks';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import WhoisPanel from './WhoisPanel';
import RdapPanel from './RdapPanel';
import DnsPanel from './DnsPanel';
import SecurityPanel from './SecurityPanel';
import DomainVisualization from '../visualizations/DomainVisualization';
import { ExportPanel } from '@/components/ExportPanel';
import { exportToJSON } from '@/lib/export';

interface DomainDashboardProps {
  domain: string;
  className?: string;
}

export default function DomainDashboard({ domain, className }: DomainDashboardProps) {
  const { activeView, setActiveView, settings } = useAppState();
  const clearCacheMutation = useClearDomainCache();
  const { toast } = useToast();

  // Fetch all domain data
  const domainAnalysis = useDomainAnalysis(domain, {
    enabled: Boolean(domain),
    ...settings.defaultAnalysisOptions,
  });

  const whoisData = useWhoisData(domain, Boolean(domain));
  const rdapData = useRdapData(domain, Boolean(domain));
  const dnsData = useDnsData(domain, Boolean(domain));

  if (!domain) {
    return (
      <div className={cn("flex items-center justify-center h-64", className)}>
        <div className="text-center space-y-4">
          <Globe className="h-16 w-16 mx-auto text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold">No domain selected</h3>
            <p className="text-muted-foreground">Enter a domain name above to start analysis</p>
          </div>
        </div>
      </div>
    );
  }

  const isLoading = domainAnalysis.isLoading || whoisData.isLoading || rdapData.isLoading || dnsData.isLoading;
  const hasError = domainAnalysis.error || whoisData.error || rdapData.error || dnsData.error;
  const lastUpdated = domainAnalysis.dataUpdatedAt || Date.now();

  const handleRefresh = () => {
    clearCacheMutation.mutate(domain);
  };

  const handleExportData = () => {
    try {
      const exportData = {
        domain,
        timestamp: new Date().toISOString(),
        whois: whoisData.data,
        rdap: rdapData.data,
        dns: dnsData.data,
        security: domainAnalysis.data?.security
      };

      exportToJSON(exportData);
      
      toast({
        title: "Export Successful",
        description: `Domain analysis exported as JSON file.`
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "Failed to export data. Please try again."
      });
    }
  };

  const scrollToSection = (sectionId: string) => {
    // First, switch to details tab
    setActiveView('details');
    
    // Use setTimeout to ensure the tab content is rendered before scrolling
    setTimeout(() => {
      const element = document.getElementById(sectionId);
      if (element) {
        // Calculate offset to account for fixed headers
        const yOffset = -80; // Adjust this value based on your header height
        const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
        
        window.scrollTo({ top: y, behavior: 'smooth' });
        
        // Add a temporary highlight effect with better styling
        element.style.transition = 'all 0.3s ease';
        element.style.transform = 'scale(1.02)';
        element.style.boxShadow = '0 4px 20px rgba(59, 130, 246, 0.3)';
        element.style.borderRadius = '8px';
        
        // Remove the effect after animation
        setTimeout(() => {
          element.style.transform = 'scale(1)';
          element.style.boxShadow = 'none';
          setTimeout(() => {
            element.style.transition = '';
          }, 300);
        }, 1000);
      }
    }, 150); // Increased timeout to ensure tab switching is complete
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <Globe className="h-5 w-5" />
            <h2 className="text-2xl font-bold">{domain}</h2>
            <StatusBadge 
              isLoading={isLoading} 
              hasError={!!hasError} 
              lastUpdated={lastUpdated}
            />
          </div>
          {settings.showTimestamps && (
            <p className="text-sm text-muted-foreground">
              Last updated: {new Date(lastUpdated).toLocaleString()}
            </p>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={clearCacheMutation.isPending}
          >
            <Refresh className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportData}
            disabled={isLoading}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {hasError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Analysis Error</AlertTitle>
          <AlertDescription>
            Some data could not be retrieved. Please try refreshing or check your connection.
          </AlertDescription>
        </Alert>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <OverviewCard
          title="WHOIS Data"
          icon={<Database className="h-4 w-4" />}
          isLoading={whoisData.isLoading}
          hasError={!!whoisData.error}
          data={whoisData.data}
          onClick={() => scrollToSection('whois-section')}
        />
        <OverviewCard
          title="RDAP Info"
          icon={<Network className="h-4 w-4" />}
          isLoading={rdapData.isLoading}
          hasError={!!rdapData.error}
          data={rdapData.data}
          onClick={() => scrollToSection('rdap-section')}
        />
        <OverviewCard
          title="DNS Records"
          icon={<Globe className="h-4 w-4" />}
          isLoading={dnsData.isLoading}
          hasError={!!dnsData.error}
          data={dnsData.data}
          onClick={() => scrollToSection('dns-section')}
        />
        <OverviewCard
          title="Security Score"
          icon={<Shield className="h-4 w-4" />}
          isLoading={domainAnalysis.isLoading}
          hasError={!!domainAnalysis.error}
          data={domainAnalysis.data?.security}
          onClick={() => scrollToSection('security-section')}
        />
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeView} onValueChange={(value) => setActiveView(value as any)}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="visualizations">Visualizations</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
          <TabsTrigger value="raw">Raw Data</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <WhoisPanel data={whoisData.data} isLoading={whoisData.isLoading} compact />
            <RdapPanel data={rdapData.data} isLoading={rdapData.isLoading} compact />
            <DnsPanel data={dnsData.data} isLoading={dnsData.isLoading} compact />
            <SecurityPanel 
              data={domainAnalysis.data?.security} 
              isLoading={domainAnalysis.isLoading} 
              compact 
            />
          </div>
        </TabsContent>

        <TabsContent value="details" className="space-y-6">
          <div className="grid grid-cols-1 gap-6">
            <div id="whois-section">
              <WhoisPanel data={whoisData.data} isLoading={whoisData.isLoading} />
            </div>
            <div id="rdap-section">
              <RdapPanel data={rdapData.data} isLoading={rdapData.isLoading} />
            </div>
            <div id="dns-section">
              <DnsPanel data={dnsData.data} isLoading={dnsData.isLoading} />
            </div>
            <div id="security-section">
              <SecurityPanel 
                data={domainAnalysis.data?.security} 
                isLoading={domainAnalysis.isLoading} 
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="visualizations">
          <DomainVisualization 
            domain={domain}
            whoisData={whoisData.data}
            dnsData={dnsData.data}
            rdapData={rdapData.data}
            securityData={domainAnalysis.data?.security}
          />
        </TabsContent>

        <TabsContent value="export">
          <div className="space-y-4">
            <ExportPanel
              domain={domain}
              analysisData={{
                domain,
                analyzedAt: new Date().toISOString(),
                meta: {
                  requestId: 'client-generated',
                  duration: 0,
                  cached: false,
                  errors: [],
                  warnings: []
                },
                whois: whoisData.data,
                rdap: rdapData.data,
                dns: dnsData.data,
                security: domainAnalysis.data?.security
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="raw">
          <div className="space-y-4">
            <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto max-h-96">
              {JSON.stringify({
                domain,
                whois: whoisData.data,
                rdap: rdapData.data,
                dns: dnsData.data,
                analysis: domainAnalysis.data,
              }, null, 2)}
            </pre>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Status Badge Component
interface StatusBadgeProps {
  isLoading: boolean;
  hasError: boolean;
  lastUpdated: number;
}

function StatusBadge({ isLoading, hasError, lastUpdated }: StatusBadgeProps) {
  if (isLoading) {
    return (
      <Badge variant="secondary" className="animate-pulse">
        <Clock className="h-3 w-3 mr-1" />
        Loading...
      </Badge>
    );
  }

  if (hasError) {
    return (
      <Badge variant="destructive">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Error
      </Badge>
    );
  }

  return (
    <Badge variant="default">
      <CheckCircle className="h-3 w-3 mr-1" />
      Ready
    </Badge>
  );
}

// Overview Card Component
interface OverviewCardProps {
  title: string;
  icon: React.ReactNode;
  isLoading: boolean;
  hasError: boolean;
  data?: any;
  onClick?: () => void;
}

function OverviewCard({ title, icon, isLoading, hasError, data, onClick }: OverviewCardProps) {
  return (
    <Card 
      className="cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all duration-200 border-2 hover:border-primary/50" 
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="p-2 rounded-full bg-muted">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        ) : hasError ? (
          <div className="text-red-500 text-sm">
            <AlertTriangle className="h-4 w-4 inline mr-1" />
            Failed to load
          </div>
        ) : data ? (
          <div className="space-y-1">
            <div className="text-lg font-bold text-green-600">Available</div>
            <p className="text-xs text-muted-foreground flex items-center">
              <Eye className="h-3 w-3 mr-1" />
              Click to view details
            </p>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No data available</div>
        )}
      </CardContent>
    </Card>
  );
}
