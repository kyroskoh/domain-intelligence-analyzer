'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SecurityScoreChart from './SecurityScoreChart';
import RiskLevelPieChart from './RiskLevelPieChart';

interface SecurityAnalysis {
  overallScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  breakdown: SecurityCategory[];
  recommendations: any[];
  risks: any[];
  lastChecked: string;
}

interface SecurityCategory {
  category: string;
  score: number;
  weight: number;
  description: string;
  checks: SecurityCheck[];
}

interface SecurityCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'info';
  score: number;
  description: string;
  details?: string;
}

interface DomainVisualizationProps {
  domain: string;
  whoisData?: any;
  dnsData?: any;
  rdapData?: any;
  securityData?: SecurityAnalysis;
  className?: string;
}

export default function DomainVisualization({
  domain,
  whoisData,
  dnsData,
  rdapData,
  securityData,
  className = ''
}: DomainVisualizationProps) {
  
  const getRiskLevelColor = (level: string) => {
    const colors = {
      low: 'bg-green-100 text-green-800 border-green-300',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      high: 'bg-orange-100 text-orange-800 border-orange-300',
      critical: 'bg-red-100 text-red-800 border-red-300',
    };
    return colors[level as keyof typeof colors] || colors.medium;
  };

  const hasData = securityData || whoisData || dnsData || rdapData;

  if (!hasData) {
    return (
      <div className={`space-y-6 ${className}`}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <span>📊</span>
              <span>Domain Visualizations</span>
            </CardTitle>
            <CardDescription>
              Interactive charts and graphs will appear here once domain analysis is complete
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-64">
            <div className="text-center text-muted-foreground">
              <div className="text-6xl mb-4">🔍</div>
              <p className="text-lg font-semibold">No Data Available</p>
              <p className="text-sm">Run a domain analysis to see visualizations</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Security Visualizations */}
      {securityData && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center space-x-2">
                  <span>🔒</span>
                  <span>Security Analysis</span>
                </CardTitle>
                <CardDescription>
                  Visual breakdown of domain security metrics and risk assessment
                </CardDescription>
              </div>
              <div className="flex items-center space-x-2">
                <Badge variant="outline" className="text-lg font-bold">
                  {securityData.overallScore}/100
                </Badge>
                <Badge className={getRiskLevelColor(securityData.riskLevel)}>
                  {securityData.riskLevel.toUpperCase()} RISK
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="breakdown" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="breakdown">Score Breakdown</TabsTrigger>
                <TabsTrigger value="risk-distribution">Risk Distribution</TabsTrigger>
              </TabsList>

              <TabsContent value="breakdown" className="mt-6">
                <div className="flex justify-center">
                  <SecurityScoreChart 
                    data={securityData.breakdown}
                    width={800}
                    height={400}
                    className="w-full"
                  />
                </div>
                
                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {securityData.breakdown.map((category) => (
                    <Card key={category.category} className="text-center">
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold mb-1" 
                             style={{ color: category.score >= 80 ? '#22c55e' : category.score >= 60 ? '#eab308' : category.score >= 40 ? '#f97316' : '#ef4444' }}>
                          {category.score}%
                        </div>
                        <div className="text-sm font-medium">{category.category}</div>
                        <div className="text-xs text-muted-foreground">
                          {category.checks.length} checks
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="risk-distribution" className="mt-6">
                <div className="flex justify-center">
                  <RiskLevelPieChart
                    overallScore={securityData.overallScore}
                    riskLevel={securityData.riskLevel}
                    breakdown={securityData.breakdown}
                    width={400}
                    height={400}
                    className="w-full max-w-md"
                  />
                </div>
                
                <div className="mt-6 grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base">Top Recommendations</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {securityData.recommendations.slice(0, 3).map((rec, index) => (
                          <div key={index} className="flex items-center space-x-2">
                            <div className={`w-2 h-2 rounded-full ${
                              rec.priority === 'critical' ? 'bg-red-500' :
                              rec.priority === 'high' ? 'bg-orange-500' :
                              rec.priority === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
                            }`} />
                            <div className="text-sm">{rec.title}</div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base">Key Risks</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {securityData.risks.slice(0, 3).map((risk, index) => (
                          <div key={index} className="flex items-center space-x-2">
                            <div className={`w-2 h-2 rounded-full ${
                              risk.severity === 'critical' ? 'bg-red-500' :
                              risk.severity === 'high' ? 'bg-orange-500' :
                              risk.severity === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
                            }`} />
                            <div className="text-sm">{risk.title}</div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* DNS Visualization Placeholder */}
      {dnsData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <span>🌐</span>
              <span>DNS Infrastructure</span>
            </CardTitle>
            <CardDescription>
              Interactive DNS record visualization and nameserver health
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-48">
            <div className="text-center text-muted-foreground">
              <div className="text-4xl mb-2">🚧</div>
              <p className="font-semibold">DNS Network Graph</p>
              <p className="text-sm">Coming soon with D3.js force-directed visualization</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Domain Timeline Placeholder */}
      {whoisData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <span>📅</span>
              <span>Domain Timeline</span>
            </CardTitle>
            <CardDescription>
              Registration history and important dates visualization
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-48">
            <div className="text-center text-muted-foreground">
              <div className="text-4xl mb-2">⏳</div>
              <p className="font-semibold">Timeline Visualization</p>
              <p className="text-sm">Coming soon with registration and expiry timeline</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}