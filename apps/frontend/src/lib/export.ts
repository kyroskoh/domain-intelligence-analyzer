import jsPDF from 'jspdf';
import Papa from 'papaparse';
import { SecurityAnalysis } from './api';
import { DateDisplayTimezone, formatDisplayDate } from './utils';

export type ExportFormat = 'json' | 'csv' | 'pdf';

export interface ExportData {
  domain: string;
  timestamp: string;
  whois?: any;
  rdap?: any;
  dns?: any;
  security?: SecurityAnalysis;
  dateTimezone?: DateDisplayTimezone;
}

function formatExportDate(
  value: unknown,
  timezone: DateDisplayTimezone = 'utc'
): string {
  if (value == null || value === '') return 'N/A';
  if (typeof value === 'string' || value instanceof Date) {
    return formatDisplayDate(value, timezone) || 'N/A';
  }
  return String(value);
}

function formatEntityContact(entity: any): string {
  if (!entity) return 'N/A';
  const parts = [entity.fn, entity.org, entity.email, entity.tel]
    .filter((p) => typeof p === 'string' && p.trim())
    .join(' · ');
  return parts || entity.handle || 'N/A';
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
  const tz = data.dateTimezone ?? 'utc';
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
    value: formatExportDate(data.timestamp, tz),
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
      value: formatExportDate(data.whois.createdDate || data.whois.creationDate, tz),
      details: ''
    });

    rows.push({
      category: 'WHOIS',
      field: 'Expiry Date',
      value: formatExportDate(data.whois.expirationDate || data.whois.expiryDate, tz),
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

  // RDAP data
  if (data.rdap) {
    rows.push({
      category: 'RDAP',
      field: 'LDH Name',
      value: data.rdap.ldhName || data.rdap.domain || 'N/A',
      details: ''
    });

    if (data.rdap.unicodeName) {
      rows.push({
        category: 'RDAP',
        field: 'Unicode Name',
        value: data.rdap.unicodeName,
        details: ''
      });
    }

    if (data.rdap.port43) {
      rows.push({
        category: 'RDAP',
        field: 'WHOIS Server (port43)',
        value: data.rdap.port43,
        details: ''
      });
    }

    if (data.rdap.status?.length) {
      rows.push({
        category: 'RDAP',
        field: 'Status',
        value: data.rdap.status.join(', '),
        details: ''
      });
    }

    data.rdap.events?.forEach((event: any) => {
      rows.push({
        category: 'RDAP',
        field: `Event: ${event.eventAction || 'unknown'}`,
        value: formatExportDate(event.eventDate, tz),
        details: ''
      });
    });

    data.rdap.entities?.forEach((entity: any) => {
      rows.push({
        category: 'RDAP',
        field: `Entity (${(entity.roles || []).join(', ') || 'unknown'})`,
        value: formatEntityContact(entity),
        details: entity.handle || ''
      });
    });

    if (data.rdap.nameservers?.length) {
      rows.push({
        category: 'RDAP',
        field: 'Name Servers',
        value: data.rdap.nameservers
          .map((ns: any) => (typeof ns === 'string' ? ns : ns.ldhName || ns.unicodeName))
          .filter(Boolean)
          .join(', '),
        details: ''
      });
    }

    if (data.rdap.secureDNS) {
      rows.push({
        category: 'RDAP',
        field: 'DNSSEC Delegation Signed',
        value: data.rdap.secureDNS.delegationSigned ? 'Yes' : 'No',
        details: `${data.rdap.secureDNS.dsRecords?.length || 0} DS records`
      });

      data.rdap.secureDNS.dsRecords?.forEach((ds: any, index: number) => {
        rows.push({
          category: 'RDAP',
          field: `DS Record ${index + 1}`,
          value: `keyTag=${ds.keyTag}; alg=${ds.algorithm}; digestType=${ds.digestType}`,
          details: ds.digest || ''
        });
      });
    }

    data.rdap.links?.forEach((link: any) => {
      rows.push({
        category: 'RDAP',
        field: `Link (${link.rel || 'related'})`,
        value: link.href,
        details: link.title || ''
      });
    });
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

    data.security.breakdown?.forEach(category => {
      rows.push({
        category: 'Security',
        field: category.category,
        value: `${category.score}/100`,
        details: `${category.checks.length} checks`
      });

      category.checks.forEach(check => {
        rows.push({
          category: `Security - ${category.category}`,
          field: check.name,
          value: `${check.score}/100`,
          details: `${check.status.toUpperCase()}: ${check.description}`
        });
      });
    });

    data.security.recommendations?.forEach((rec) => {
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
  const tz = data.dateTimezone ?? 'utc';
  const doc = new jsPDF();
  let yPosition = 20;
  const lineHeight = 7;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 20;

  const addText = (text: string, x: number, fontSize: number = 10, isBold: boolean = false) => {
    if (yPosition > pageHeight - margin) {
      doc.addPage();
      yPosition = 20;
    }
    
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    const lines = doc.splitTextToSize(String(text), doc.internal.pageSize.width - x - margin);
    doc.text(lines, x, yPosition);
    yPosition += lineHeight * (Array.isArray(lines) ? lines.length : 1);
  };

  const addSection = (title: string, content: Record<string, any>) => {
    yPosition += 5;
    addText(title, 20, 14, true);
    yPosition += 2;
    
    Object.entries(content).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        let displayValue = value;
        if (Array.isArray(value)) {
          displayValue = value.join(', ');
        } else if (typeof value === 'object') {
          displayValue = JSON.stringify(value);
        }
        
        addText(`${key}: ${displayValue}`, 25, 10);
      }
    });
  };

  // Title
  addText(`Domain Analysis Report: ${data.domain}`, 20, 18, true);
  addText(`Generated on: ${formatExportDate(data.timestamp, tz)}`, 20, 12);
  yPosition += 10;

  // WHOIS Section
  if (data.whois) {
    addSection('WHOIS Information', {
      'Registrar': data.whois.registrar?.name,
      'Creation Date': formatExportDate(data.whois.createdDate || data.whois.creationDate, tz),
      'Updated Date': formatExportDate(data.whois.updatedDate, tz),
      'Expiry Date': formatExportDate(data.whois.expirationDate || data.whois.expiryDate, tz),
      'Name Servers': data.whois.nameservers?.join(', '),
      'Status': data.whois.status?.join(', ')
    });
  }

  // RDAP Section
  if (data.rdap) {
    const rdapInfo: Record<string, any> = {
      'LDH Name': data.rdap.ldhName || data.rdap.domain,
      'Unicode Name': data.rdap.unicodeName,
      'WHOIS Server': data.rdap.port43,
      'Status': data.rdap.status?.join(', '),
      'Name Servers': data.rdap.nameservers
        ?.map((ns: any) => (typeof ns === 'string' ? ns : ns.ldhName || ns.unicodeName))
        .filter(Boolean)
        .join(', '),
    };

    if (data.rdap.secureDNS) {
      rdapInfo['DNSSEC'] = data.rdap.secureDNS.delegationSigned
        ? `Signed (${data.rdap.secureDNS.dsRecords?.length || 0} DS)`
        : 'Not signed';
    }

    addSection('RDAP Information', rdapInfo);

    data.rdap.events?.slice(0, 8).forEach((event: any) => {
      addText(
        `${event.eventAction || 'event'}: ${formatExportDate(event.eventDate, tz)}`,
        25,
        10
      );
    });

    data.rdap.entities?.slice(0, 8).forEach((entity: any) => {
      const roles = (entity.roles || []).join(', ') || 'entity';
      addText(`${roles}: ${formatEntityContact(entity)}`, 25, 10);
    });

    data.rdap.links?.slice(0, 5).forEach((link: any) => {
      addText(`${link.rel || 'link'}: ${link.href}`, 25, 9);
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

    data.security.breakdown?.forEach(category => {
      addSection(`Security - ${category.category}`, {
        'Score': `${category.score}/100`,
        'Weight': `${Math.round(category.weight * 100)}%`,
        'Checks': category.checks.length,
        'Description': category.description
      });
    });

    if (data.security.recommendations?.length > 0) {
      yPosition += 5;
      addText('Top Recommendations:', 20, 12, true);
      data.security.recommendations.slice(0, 5).forEach((rec, index) => {
        addText(`${index + 1}. [${rec.priority.toUpperCase()}] ${rec.title}`, 25, 10);
        addText(`   ${rec.description}`, 30, 9);
      });
    }
  }

  doc.save(`${data.domain}-analysis-${formatDate(data.timestamp)}.pdf`);
}

/**
 * Copy data to clipboard as JSON
 */
export async function copyToClipboard(data: ExportData): Promise<void> {
  try {
    const jsonString = JSON.stringify(data, null, 2);
    await navigator.clipboard.writeText(jsonString);
  } catch {
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
export function generateShareableURL(domain: string, _data: ExportData): string {
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
