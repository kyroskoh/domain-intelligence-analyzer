'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import SecurityScoreChart from '@/components/visualizations/SecurityScoreChart';
import RiskLevelPieChart from '@/components/visualizations/RiskLevelPieChart';
import { DomainTimelineChart } from '@/components/visualizations/DomainTimelineChart';
import { NetworkTopologyDiagram } from '@/components/visualizations/NetworkTopologyDiagram';
import { SecurityTrendChart } from '@/components/visualizations/SecurityTrendChart';
import { PerformanceAnalytics } from '@/components/visualizations/PerformanceAnalytics';
import { Badge } from '@/components/ui/badge';
import { useTheme } from 'next-themes';

// Mock data for testing
const mockSecurityData = {
  overallScore: 75,
  riskLevel: 'medium' as const,
  breakdown: [
    {
      category: 'DNS Security',
      score: 85,
      weight: 0.3,
      description: 'DNS configuration and security checks',
      checks: [
        { name: 'DNSSEC', status: 'pass' as const, score: 100, description: 'DNSSEC enabled' },
        { name: 'DNS over HTTPS', status: 'warn' as const, score: 70, description: 'DoH partially configured' }
      ]
    },
    {
      category: 'Registration',
      score: 90,
      weight: 0.25,
      description: 'Domain registration security',
      checks: [
        { name: 'Privacy Protection', status: 'pass' as const, score: 100, description: 'WHOIS privacy enabled' },
        { name: 'Registrar Lock', status: 'pass' as const, score: 100, description: 'Domain locked' }
      ]
    },
    {
      category: 'Certificate',
      score: 60,
      weight: 0.25,
      description: 'SSL certificate security',
      checks: [
        { name: 'Certificate Validity', status: 'warn' as const, score: 80, description: 'Certificate expires soon' },
        { name: 'Cipher Strength', status: 'fail' as const, score: 40, description: 'Weak ciphers detected' }
      ]
    },
    {
      category: 'Infrastructure',
      score: 70,
      weight: 0.2,
      description: 'Infrastructure security',
      checks: [
        { name: 'Server Security', status: 'pass' as const, score: 90, description: 'Server headers secure' },
        { name: 'Port Security', status: 'warn' as const, score: 50, description: 'Some ports exposed' }
      ]
    }
  ],
  lastChecked: new Date().toISOString(),
  recommendations: [],
  risks: []
};

const mockWhoisData = {
  registrar: { name: 'Test Registrar Inc.' },
  nameservers: ['ns1.example.com', 'ns2.example.com'],
  createdDate: '2020-01-15T00:00:00Z',
  updatedDate: '2023-06-10T00:00:00Z',
  expirationDate: '2025-01-15T00:00:00Z'
};

const mockDnsData = {
  nameservers: [
    { name: 'ns1.example.com', ip: '1.2.3.4', reachable: true, responseTime: 45 },
    { name: 'ns2.example.com', ip: '1.2.3.5', reachable: true, responseTime: 52 }
  ],
  dnssec: { enabled: true }
};

export default function TestChartsPage() {
  const { theme } = useTheme();
  
  return (
    <div className="container mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Chart Theme Testing</h1>
          <p className="text-muted-foreground">
            Test all charts with theme switching. Current theme: <Badge variant="outline">{theme}</Badge>
          </p>
        </div>
        <ThemeToggle />
      </div>

      {/* Grid of charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Security Score Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Security Score Chart</CardTitle>
            <CardDescription>Bar chart showing security breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <SecurityScoreChart 
              data={mockSecurityData.breakdown}
              height={300}
              className="w-full"
            />
          </CardContent>
        </Card>

        {/* Risk Level Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Risk Level Distribution</CardTitle>
            <CardDescription>Pie chart showing risk distribution</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <RiskLevelPieChart
              overallScore={mockSecurityData.overallScore}
              riskLevel={mockSecurityData.riskLevel}
              breakdown={mockSecurityData.breakdown}
              width={300}
              height={300}
            />
          </CardContent>
        </Card>

        {/* Performance Analytics */}
        <Card>
          <CardHeader>
            <CardTitle>Performance Analytics</CardTitle>
            <CardDescription>Response time trends</CardDescription>
          </CardHeader>
          <CardContent>
            <PerformanceAnalytics 
              domain="example.com"
              className="w-full"
            />
          </CardContent>
        </Card>

        {/* Network Topology Diagram */}
        <Card>
          <CardHeader>
            <CardTitle>Network Topology</CardTitle>
            <CardDescription>Interactive network diagram</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-96">
              <NetworkTopologyDiagram
                domain="example.com"
                whoisData={mockWhoisData}
                dnsData={mockDnsData}
                className="w-full h-full"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Full width charts */}
      <div className="space-y-6">
        
        {/* Security Trend Chart */}
        <SecurityTrendChart
          domain="example.com"
          securityData={mockSecurityData}
          className="w-full"
        />

        {/* Domain Timeline Chart */}
        <DomainTimelineChart
          domain="example.com"
          whoisData={mockWhoisData}
          dnsData={mockDnsData}
          securityData={mockSecurityData}
          className="w-full"
        />
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Testing Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p>• Use the theme toggle in the top-right to switch between light and dark themes</p>
            <p>• All charts should automatically update their colors when the theme changes</p>
            <p>• Text should be readable in both themes (dark text on light background, light text on dark background)</p>
            <p>• Tooltips should also adapt to the current theme</p>
            <p>• Interactive elements like hover states should work in both themes</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}