import jsPDF from 'jspdf';
import Papa from 'papaparse';
import { DomainAnalysisResponse, SecurityAnalysis } from './api';

export type ExportFormat = 'json' | 'csv' | 'pdf';

export interface ExportData {
  domain: string;
  timestamp: string;
  whois?: any;
  rdap?: any;
  dns?: any;
  security?: SecurityAnalysis;
}

/**
 * Export domain analysis data to JSON format
 */
export function exportToJSON(data: ExportData): void {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  downloadFile(blob, `${data.domain}-analysis-${formatDate(data.timestamp)}.json`);
}

/**
 * Export domain analysis data to CSV format
 */
export function exportToCSV(data: ExportData): void {
  const rows: any[] = [];

  // Basic domain information
  rows.push({
    category: 'Domain',
    field: 'Domain Name',
    value: data.domain,
    details: ''
  });

  rows.push({
    category: 'Analysis',
    field: 'Timestamp',
    value: data.timestamp,
    details: ''
  });

  // WHOIS data
  if (data.whois) {
    rows.push({
      category: 'WHOIS',
      field: 'Registrar',
      value: data.whois.registrar?.name || 'N/A',
      details: data.whois.registrar?.url || ''
    });

    rows.push({
      category: 'WHOIS',
      field: 'Creation Date',
      value: data.whois.createdDate || 'N/A',
      details: ''
    });

    rows.push({
      category: 'WHOIS',
      field: 'Expiry Date',
      value: data.whois.expirationDate || 'N/A',
      details: ''
    });

    if (data.whois.nameservers?.length > 0) {
      rows.push({
        category: 'WHOIS',
        field: 'Name Servers',
        value: data.whois.nameservers.join(', '),
        details: ''
      });
    }
  }

  // DNS data
  if (data.dns?.records) {
    Object.entries(data.dns.records).forEach(([recordType, records]) => {
      if (Array.isArray(records) && records.length > 0) {
        records.forEach((record: any) => {
          rows.push({
            category: 'DNS',
            field: `${recordType} Record`,
            value: typeof record === 'string' ? record : JSON.stringify(record),
            details: record.ttl ? `TTL: ${record.ttl}` : ''
          });
        });
      }
    });
  }

  // Security analysis
  if (data.security) {
    rows.push({
      category: 'Security',
      field: 'Overall Score',
      value: `${data.security.overallScore}/100`,
      details: `Risk Level: ${data.security.riskLevel.toUpperCase()}`
    });

    // Security checks by category
    data.security.breakdown?.forEach(category => {
      rows.push({
        category: 'Security',
        field: category.category,
        value: `${category.score}/100`,
        details: `${category.checks.length} checks`
      });

      // Individual checks
      category.checks.forEach(check => {
        rows.push({
          category: `Security - ${category.category}`,
          field: check.name,
          value: `${check.score}/100`,
          details: `${check.status.toUpperCase()}: ${check.description}`
        });
      });
    });

    // Recommendations
    data.security.recommendations?.forEach((rec, index) => {
      rows.push({
        category: 'Recommendations',
        field: `${rec.priority.toUpperCase()} Priority`,
        value: rec.title,
        details: rec.description
      });
    });
  }

  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadFile(blob, `${data.domain}-analysis-${formatDate(data.timestamp)}.csv`);
}

/**
 * Export domain analysis data to PDF format
 */
export function exportToPDF(data: ExportData): void {
  const doc = new jsPDF();
  let yPosition = 20;
  const lineHeight = 7;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 20;

  // Helper function to add text with automatic page breaks
  const addText = (text: string, x: number, fontSize: number = 10, isBold: boolean = false) => {
    if (yPosition > pageHeight - margin) {
      doc.addPage();
      yPosition = 20;
    }
    
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.text(text, x, yPosition);
    yPosition += lineHeight;
  };

  const addSection = (title: string, content: Record<string, any>) => {
    yPosition += 5; // Extra spacing before sections
    addText(title, 20, 14, true);
    yPosition += 2;
    
    Object.entries(content).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        let displayValue = value;
        if (typeof value === 'object') {
          displayValue = JSON.stringify(value, null, 2);
        } else if (Array.isArray(value)) {
          displayValue = value.join(', ');
        }
        
        addText(`${key}: ${displayValue}`, 25, 10);
      }
    });
  };

  // Title
  addText(`Domain Analysis Report: ${data.domain}`, 20, 18, true);
  addText(`Generated on: ${new Date(data.timestamp).toLocaleString()}`, 20, 12);
  yPosition += 10;

  // WHOIS Section
  if (data.whois) {
    addSection('WHOIS Information', {
      'Registrar': data.whois.registrar?.name,
      'Creation Date': data.whois.createdDate,
      'Updated Date': data.whois.updatedDate,
      'Expiry Date': data.whois.expirationDate,
      'Name Servers': data.whois.nameservers?.join(', '),
      'Status': data.whois.status?.join(', ')
    });
  }

  // DNS Section
  if (data.dns) {
    const dnsInfo: Record<string, any> = {};
    if (data.dns.records) {
      Object.entries(data.dns.records).forEach(([type, records]) => {
        if (Array.isArray(records) && records.length > 0) {
          dnsInfo[`${type} Records`] = records.length;
        }
      });
    }
    addSection('DNS Information', dnsInfo);
  }

  // Security Section
  if (data.security) {
    addSection('Security Analysis', {
      'Overall Score': `${data.security.overallScore}/100`,
      'Risk Level': data.security.riskLevel.toUpperCase(),
      'Categories Analyzed': data.security.breakdown?.length || 0,
      'Recommendations': data.security.recommendations?.length || 0,
      'Identified Risks': data.security.risks?.length || 0
    });

    // Security categories breakdown
    data.security.breakdown?.forEach(category => {
      addSection(`Security - ${category.category}`, {
        'Score': `${category.score}/100`,
        'Weight': `${Math.round(category.weight * 100)}%`,
        'Checks': category.checks.length,
        'Description': category.description
      });
    });

    // Top recommendations
    if (data.security.recommendations?.length > 0) {
      yPosition += 5;
      addText('Top Recommendations:', 20, 12, true);
      data.security.recommendations.slice(0, 5).forEach((rec, index) => {
        addText(`${index + 1}. [${rec.priority.toUpperCase()}] ${rec.title}`, 25, 10);
        addText(`   ${rec.description}`, 30, 9);
      });
    }
  }

  // Save the PDF
  doc.save(`${data.domain}-analysis-${formatDate(data.timestamp)}.pdf`);
}

/**
 * Copy data to clipboard as JSON
 */
export async function copyToClipboard(data: ExportData): Promise<void> {
  try {
    const jsonString = JSON.stringify(data, null, 2);
    await navigator.clipboard.writeText(jsonString);
  } catch (error) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = JSON.stringify(data, null, 2);
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }
}

/**
 * Generate shareable URL for analysis results
 */
export function generateShareableURL(domain: string, data: ExportData): string {
  // For now, return a simple URL with domain parameter
  // In a full implementation, you'd store the data on the server and return a hash
  const baseUrl = window.location.origin;
  return `${baseUrl}?domain=${encodeURIComponent(domain)}&shared=true`;
}

/**
 * Download a blob as a file
 */
function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format date for filenames
 */
function formatDate(timestamp: string): string {
  return new Date(timestamp).toISOString().split('T')[0];
}