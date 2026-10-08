'use client';

import React, { useState } from 'react';
import { 
  Download, 
  Share2, 
  Copy, 
  FileText, 
  FileDown, 
  Table,
  Link,
  Check,
  AlertCircle
} from 'lucide-react';
import { useChartColors } from '@/lib/chart-colors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  exportToJSON, 
  exportToCSV, 
  exportToPDF, 
  copyToClipboard, 
  ExportData,
  ExportFormat 
} from '@/lib/export';
import { apiClient, DomainAnalysisResponse } from '@/lib/api';
import { DateDisplayTimezone } from '@/lib/utils';

interface ExportPanelProps {
  domain: string;
  analysisData: DomainAnalysisResponse;
  dateTimezone?: DateDisplayTimezone;
  className?: string;
}

export function ExportPanel({
  domain,
  analysisData,
  dateTimezone = 'utc',
  className,
}: ExportPanelProps) {
  const [isExporting, setIsExporting] = useState<ExportFormat | null>(null);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const { toast } = useToast();
  
  // Get theme-aware colors
  const colors = useChartColors();

  // Transform analysis data to export format
  const exportData: ExportData = {
    domain,
    timestamp: analysisData.analyzedAt || new Date().toISOString(),
    whois: analysisData.whois,
    rdap: analysisData.rdap,
    dns: analysisData.dns,
    security: analysisData.security,
    dateTimezone,
  };

  const handleExport = async (format: ExportFormat) => {
    setIsExporting(format);
    
    try {
      switch (format) {
        case 'json':
          exportToJSON(exportData);
          toast({
            title: "Export Successful",
            description: `Domain analysis exported as JSON file.`,
          });
          break;
        case 'csv':
          exportToCSV(exportData);
          toast({
            title: "Export Successful",
            description: `Domain analysis exported as CSV file.`,
          });
          break;
        case 'pdf':
          exportToPDF(exportData);
          toast({
            title: "Export Successful",
            description: `Domain analysis exported as PDF report.`,
          });
          break;
        default:
          throw new Error('Unsupported export format');
      }
    } catch (error) {
      console.error('Export error:', error);
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: `Failed to export data as ${format.toUpperCase()}. Please try again.`,
      });
    } finally {
      setIsExporting(null);
    }
  };

  const handleCopyToClipboard = async () => {
    try {
      await copyToClipboard(exportData);
      setCopied(true);
      toast({
        title: "Copied to Clipboard",
        description: "Domain analysis data copied as JSON.",
      });
      
      // Reset copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Copy error:', error);
      toast({
        variant: "destructive",
        title: "Copy Failed",
        description: "Failed to copy data to clipboard. Please try again.",
      });
    }
  };

  const handleShare = async () => {
    try {
      const snapshotId = analysisData.meta?.snapshotId;
      const created = await apiClient.createShareLink(domain, snapshotId);
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const shareUrl = `${origin}${created.path}`;
      await navigator.clipboard.writeText(shareUrl);
      setShared(true);
      
      toast({
        title: "Share Link Copied",
        description: `Link points at a stored snapshot; expires ${new Date(created.expiresAt).toLocaleString()}.`,
      });
      
      setTimeout(() => setShared(false), 3000);
    } catch (error) {
      console.error('Share error:', error);
      toast({
        variant: "destructive",
        title: "Share Failed",
        description: "Failed to create share link (requires Redis). Analyze the domain first, then try again.",
      });
    }
  };

  const getDataSize = () => {
    const jsonString = JSON.stringify(exportData);
    const bytes = new Blob([jsonString]).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${Math.round(bytes / (1024 * 1024) * 10) / 10} MB`;
  };

  const getDataSummary = () => {
    let items = 0;
    if (analysisData.whois) items++;
    if (analysisData.rdap) items++;
    if (analysisData.dns?.records) items++;
    if (analysisData.security) items++;
    return `${items} data categories`;
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Export & Share
        </CardTitle>
        <CardDescription>
          Export domain analysis results in various formats or share with others
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Data Summary */}
        <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: colors.gridLines }}>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" style={{ color: colors.textSecondary }} />
            <span className="text-sm font-medium" style={{ color: colors.text }}>{domain}</span>
          </div>
          <div className="flex items-center gap-3 text-sm" style={{ color: colors.textSecondary }}>
            <Badge variant="secondary" className="text-xs">
              {getDataSummary()}
            </Badge>
            <span>{getDataSize()}</span>
          </div>
        </div>

        {/* Export Options */}
        <div>
          <h4 className="font-medium mb-3">Export Formats</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button
              variant="outline"
              className="flex items-center gap-2 h-auto p-3 flex-col"
              onClick={() => handleExport('json')}
              disabled={isExporting === 'json'}
            >
              <FileDown className="h-5 w-5" />
              <div className="text-center">
                <div className="font-medium">JSON</div>
                <div className="text-xs" style={{ color: colors.textSecondary }}>Raw data format</div>
              </div>
              {isExporting === 'json' && (
                <div className="absolute inset-0 flex items-center justify-center rounded" style={{ backgroundColor: `${colors.background}CC` }}>
                  <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                </div>
              )}
            </Button>

            <Button
              variant="outline"
              className="flex items-center gap-2 h-auto p-3 flex-col relative"
              onClick={() => handleExport('csv')}
              disabled={isExporting === 'csv'}
            >
              <Table className="h-5 w-5" />
              <div className="text-center">
                <div className="font-medium">CSV</div>
                <div className="text-xs" style={{ color: colors.textSecondary }}>Spreadsheet format</div>
              </div>
              {isExporting === 'csv' && (
                <div className="absolute inset-0 flex items-center justify-center rounded" style={{ backgroundColor: `${colors.background}CC` }}>
                  <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                </div>
              )}
            </Button>

            <Button
              variant="outline"
              className="flex items-center gap-2 h-auto p-3 flex-col relative"
              onClick={() => handleExport('pdf')}
              disabled={isExporting === 'pdf'}
            >
              <FileText className="h-5 w-5" />
              <div className="text-center">
                <div className="font-medium">PDF</div>
                <div className="text-xs" style={{ color: colors.textSecondary }}>Report format</div>
              </div>
              {isExporting === 'pdf' && (
                <div className="absolute inset-0 flex items-center justify-center rounded" style={{ backgroundColor: `${colors.background}CC` }}>
                  <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                </div>
              )}
            </Button>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h4 className="font-medium mb-3">Quick Actions</h4>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
              onClick={handleCopyToClipboard}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
              onClick={handleShare}
            >
              {shared ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              {shared ? 'Link Copied!' : 'Share Link'}
            </Button>
          </div>
        </div>

        {/* Export Info */}
        <div className="border-t pt-4">
          <div className="flex items-start gap-2 text-xs" style={{ color: colors.textSecondary }}>
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium mb-1">Export Information</div>
              <ul className="space-y-1">
                <li>• JSON: Complete raw data with full structure</li>
                <li>• CSV: Flattened data suitable for spreadsheets</li>
                <li>• PDF: Formatted report for presentations</li>
                <li>• Share links open a stored analysis snapshot (Redis; time-limited)</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}