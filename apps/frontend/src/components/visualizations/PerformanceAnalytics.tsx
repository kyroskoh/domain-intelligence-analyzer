'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Activity, 
  Clock, 
  Globe, 
  Shield, 
  TrendingUp, 
  TrendingDown,
  Zap,
  Wifi,
  Server,
  AlertTriangle
} from 'lucide-react';

interface PerformanceMetrics {
  responseTime: {
    current: number;
    average: number;
    history: { timestamp: Date; value: number }[];
  };
  uptime: {
    percentage: number;
    lastDowntime?: Date;
    totalDowntime: number;
  };
  dnsSpeed: {
    resolutionTime: number;
    propagationDelay: number;
    ttlOptimization: number;
  };
  sslScore: {
    handshakeTime: number;
    certificateValidation: number;
    protocolSupport: number;
    overallScore: number;
  };
  loadTime: {
    firstByte: number;
    domReady: number;
    fullyLoaded: number;
  };
  availability: {
    global: number;
    regions: { region: string; availability: number; latency: number }[];
  };
}

interface PerformanceAnalyticsProps {
  domain: string;
  className?: string;
}

// Mock data generator for demonstration
const generateMockPerformanceData = (domain: string): PerformanceMetrics => {
  const baseResponseTime = Math.random() * 200 + 100; // 100-300ms
  const history = Array.from({ length: 24 }, (_, i) => ({
    timestamp: new Date(Date.now() - (23 - i) * 60 * 60 * 1000),
    value: baseResponseTime + Math.random() * 100 - 50
  }));

  return {
    responseTime: {
      current: Math.round(baseResponseTime),
      average: Math.round(history.reduce((acc, h) => acc + h.value, 0) / history.length),
      history
    },
    uptime: {
      percentage: 99.9 - Math.random() * 0.5,
      lastDowntime: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
      totalDowntime: Math.round(Math.random() * 120) // minutes in last 30 days
    },
    dnsSpeed: {
      resolutionTime: Math.round(Math.random() * 50 + 10),
      propagationDelay: Math.round(Math.random() * 100 + 50),
      ttlOptimization: Math.round(Math.random() * 40 + 60)
    },
    sslScore: {
      handshakeTime: Math.round(Math.random() * 200 + 100),
      certificateValidation: Math.round(Math.random() * 100 + 150),
      protocolSupport: Math.round(Math.random() * 20 + 80),
      overallScore: Math.round(Math.random() * 20 + 80)
    },
    loadTime: {
      firstByte: Math.round(baseResponseTime * 0.6),
      domReady: Math.round(baseResponseTime * 1.2),
      fullyLoaded: Math.round(baseResponseTime * 1.8)
    },
    availability: {
      global: 99.5 + Math.random() * 0.5,
      regions: [
        { region: 'North America', availability: 99.8 + Math.random() * 0.2, latency: Math.round(Math.random() * 50 + 20) },
        { region: 'Europe', availability: 99.7 + Math.random() * 0.3, latency: Math.round(Math.random() * 80 + 30) },
        { region: 'Asia Pacific', availability: 99.6 + Math.random() * 0.4, latency: Math.round(Math.random() * 120 + 50) },
        { region: 'South America', availability: 99.4 + Math.random() * 0.6, latency: Math.round(Math.random() * 150 + 80) },
        { region: 'Africa', availability: 99.2 + Math.random() * 0.8, latency: Math.round(Math.random() * 200 + 100) }
      ]
    }
  };
};

const ResponseTimeChart: React.FC<{ data: PerformanceMetrics['responseTime']; className?: string }> = ({ 
  data, 
  className 
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data.history.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 20, bottom: 30, left: 50 };
    const containerWidth = containerRef.current?.clientWidth || 600;
    const width = containerWidth - margin.left - margin.right;
    const height = 200 - margin.top - margin.bottom;

    svg.attr('width', containerWidth).attr('height', 200);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleTime()
      .domain(d3.extent(data.history, d => d.timestamp) as [Date, Date])
      .range([0, width]);

    const yScale = d3.scaleLinear()
      .domain(d3.extent(data.history, d => d.value) as [number, number])
      .nice()
      .range([height, 0]);

    // Add axes
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).tickFormat(d3.timeFormat('%H:%M')));

    g.append('g')
      .call(d3.axisLeft(yScale).tickFormat(d => `${d}ms`));

    // Add line
    const line = d3.line<{ timestamp: Date; value: number }>()
      .x(d => xScale(d.timestamp))
      .y(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    // Add gradient
    const gradient = svg.append('defs')
      .append('linearGradient')
      .attr('id', 'response-time-gradient')
      .attr('gradientUnits', 'userSpaceOnUse')
      .attr('x1', 0).attr('y1', height)
      .attr('x2', 0).attr('y2', 0);

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#3b82f6')
      .attr('stop-opacity', 0.1);

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#3b82f6')
      .attr('stop-opacity', 0.5);

    // Add area
    const area = d3.area<{ timestamp: Date; value: number }>()
      .x(d => xScale(d.timestamp))
      .y0(height)
      .y1(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(data.history)
      .attr('fill', 'url(#response-time-gradient)')
      .attr('d', area);

    // Add line path
    g.append('path')
      .datum(data.history)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2)
      .attr('d', line);

    // Add dots
    g.selectAll('.dot')
      .data(data.history)
      .enter().append('circle')
      .attr('class', 'dot')
      .attr('cx', d => xScale(d.timestamp))
      .attr('cy', d => yScale(d.value))
      .attr('r', 3)
      .attr('fill', '#3b82f6')
      .on('mouseover', function(event, d) {
        const tooltip = d3.select('body').append('div')
          .attr('class', 'performance-tooltip')
          .style('position', 'absolute')
          .style('background', 'rgba(0, 0, 0, 0.8)')
          .style('color', 'white')
          .style('padding', '8px')
          .style('border-radius', '4px')
          .style('font-size', '12px')
          .style('pointer-events', 'none')
          .style('z-index', '1000')
          .html(`
            <div><strong>Response Time</strong></div>
            <div>${Math.round(d.value)}ms</div>
            <div><small>${d.timestamp.toLocaleString()}</small></div>
          `)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px')
          .style('opacity', 0)
          .transition()
          .duration(200)
          .style('opacity', 1);
      })
      .on('mouseout', function() {
        d3.selectAll('.performance-tooltip').remove();
      });

  }, [data]);

  return (
    <div ref={containerRef} className={className}>
      <svg ref={svgRef}></svg>
    </div>
  );
};

const MetricCard: React.FC<{
  title: string;
  value: string | number;
  unit?: string;
  change?: number;
  icon: React.ReactNode;
  status?: 'good' | 'warning' | 'critical';
  subtitle?: string;
}> = ({ title, value, unit, change, icon, status = 'good', subtitle }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default: return 'text-green-600 bg-green-50 border-green-200';
    }
  };

  return (
    <Card className={`${getStatusColor()} border`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {icon}
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
          </div>
          {change !== undefined && (
            <div className={`flex items-center text-xs ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {change >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
              {Math.abs(change)}%
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-2xl font-bold">
          {value}{unit && <span className="text-lg text-muted-foreground ml-1">{unit}</span>}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
};

export function PerformanceAnalytics({ domain, className }: PerformanceAnalyticsProps) {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate API call
    const loadMetrics = async () => {
      setIsLoading(true);
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      setMetrics(generateMockPerformanceData(domain));
      setIsLoading(false);
    };

    loadMetrics();

    // Set up real-time updates
    const interval = setInterval(() => {
      if (!isLoading) {
        setMetrics(prev => prev ? {
          ...prev,
          responseTime: {
            ...prev.responseTime,
            current: Math.round(prev.responseTime.current + Math.random() * 20 - 10),
            history: [
              ...prev.responseTime.history.slice(1),
              {
                timestamp: new Date(),
                value: prev.responseTime.current + Math.random() * 20 - 10
              }
            ]
          }
        } : null);
      }
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [domain, isLoading]);

  if (isLoading) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2">Loading performance metrics...</span>
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className={`space-y-6 ${className}`}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Performance Analytics - {domain}
          </CardTitle>
          <CardDescription>
            Real-time performance monitoring and historical analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="response">Response Time</TabsTrigger>
              <TabsTrigger value="availability">Availability</TabsTrigger>
              <TabsTrigger value="security">SSL/Security</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                  title="Response Time"
                  value={metrics.responseTime.current}
                  unit="ms"
                  change={-5.2}
                  icon={<Clock className="h-4 w-4" />}
                  status={metrics.responseTime.current < 200 ? 'good' : metrics.responseTime.current < 500 ? 'warning' : 'critical'}
                  subtitle={`Avg: ${metrics.responseTime.average}ms`}
                />
                <MetricCard
                  title="Uptime"
                  value={metrics.uptime.percentage.toFixed(2)}
                  unit="%"
                  change={0.1}
                  icon={<Zap className="h-4 w-4" />}
                  status={metrics.uptime.percentage > 99.5 ? 'good' : metrics.uptime.percentage > 99 ? 'warning' : 'critical'}
                  subtitle={`${metrics.uptime.totalDowntime}min downtime`}
                />
                <MetricCard
                  title="DNS Speed"
                  value={metrics.dnsSpeed.resolutionTime}
                  unit="ms"
                  change={-2.1}
                  icon={<Globe className="h-4 w-4" />}
                  status={metrics.dnsSpeed.resolutionTime < 50 ? 'good' : metrics.dnsSpeed.resolutionTime < 100 ? 'warning' : 'critical'}
                  subtitle="DNS resolution time"
                />
                <MetricCard
                  title="SSL Score"
                  value={metrics.sslScore.overallScore}
                  unit="/100"
                  change={1.5}
                  icon={<Shield className="h-4 w-4" />}
                  status={metrics.sslScore.overallScore > 85 ? 'good' : metrics.sslScore.overallScore > 70 ? 'warning' : 'critical'}
                  subtitle="SSL configuration"
                />
              </div>

              {/* Load Time Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Load Time Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Time to First Byte (TTFB)</span>
                        <span>{metrics.loadTime.firstByte}ms</span>
                      </div>
                      <Progress value={(metrics.loadTime.firstByte / metrics.loadTime.fullyLoaded) * 100} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>DOM Ready</span>
                        <span>{metrics.loadTime.domReady}ms</span>
                      </div>
                      <Progress value={(metrics.loadTime.domReady / metrics.loadTime.fullyLoaded) * 100} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Fully Loaded</span>
                        <span>{metrics.loadTime.fullyLoaded}ms</span>
                      </div>
                      <Progress value={100} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="response" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Response Time History (24h)</CardTitle>
                  <CardDescription>
                    Real-time response time monitoring over the last 24 hours
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponseTimeChart data={metrics.responseTime} />
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Current</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-blue-600">
                      {metrics.responseTime.current}ms
                    </div>
                    <p className="text-sm text-muted-foreground">Latest response time</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Average</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-600">
                      {metrics.responseTime.average}ms
                    </div>
                    <p className="text-sm text-muted-foreground">24-hour average</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Best</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-purple-600">
                      {Math.min(...metrics.responseTime.history.map(h => h.value)).toFixed(0)}ms
                    </div>
                    <p className="text-sm text-muted-foreground">Best response time</p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="availability" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Global Availability</CardTitle>
                  <CardDescription>
                    Availability and latency by region
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {metrics.availability.regions.map((region) => (
                      <div key={region.region} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center space-x-2">
                            <Server className="h-4 w-4" />
                            <span className="font-medium">{region.region}</span>
                          </div>
                          <div className="text-right">
                            <Badge variant={region.availability > 99.5 ? 'default' : region.availability > 99 ? 'secondary' : 'destructive'}>
                              {region.availability.toFixed(1)}%
                            </Badge>
                            <div className="text-xs text-muted-foreground">{region.latency}ms</div>
                          </div>
                        </div>
                        <Progress value={region.availability} className="h-2" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Uptime Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="text-3xl font-bold text-green-600">
                        {metrics.uptime.percentage.toFixed(3)}%
                      </div>
                      <p className="text-sm text-muted-foreground">Overall uptime (30 days)</p>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-red-600">
                        {metrics.uptime.totalDowntime}
                      </div>
                      <p className="text-sm text-muted-foreground">Minutes of downtime</p>
                    </div>
                  </div>
                  {metrics.uptime.lastDowntime && (
                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                      <div className="flex items-center space-x-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        <span className="text-sm">
                          Last downtime: {metrics.uptime.lastDowntime.toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="security" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>SSL/Security Performance</CardTitle>
                  <CardDescription>
                    Security-related performance metrics
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <div className="text-2xl font-bold">
                          {metrics.sslScore.overallScore}/100
                        </div>
                        <p className="text-sm text-muted-foreground">Overall SSL Score</p>
                        <Progress value={metrics.sslScore.overallScore} className="h-2 mt-2" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-blue-600">
                          {metrics.sslScore.handshakeTime}ms
                        </div>
                        <p className="text-sm text-muted-foreground">SSL Handshake Time</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Certificate Validation</span>
                          <span>{metrics.sslScore.certificateValidation}ms</span>
                        </div>
                        <Progress value={(200 - metrics.sslScore.certificateValidation) / 2} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Protocol Support Score</span>
                          <span>{metrics.sslScore.protocolSupport}/100</span>
                        </div>
                        <Progress value={metrics.sslScore.protocolSupport} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>DNS Resolution</span>
                          <span>{metrics.dnsSpeed.resolutionTime}ms</span>
                        </div>
                        <Progress value={(100 - metrics.dnsSpeed.resolutionTime)} className="h-2" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}