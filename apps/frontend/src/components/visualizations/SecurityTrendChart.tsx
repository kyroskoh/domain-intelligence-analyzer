'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useChartColors } from '@/lib/chart-colors';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { apiClient, AnalysisSnapshot } from '@/lib/api';

interface SecurityDataPoint {
  date: Date;
  overallScore: number;
  dnsScore: number;
  registrationScore: number;
  rdapScore?: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  events: string[];
}

interface SecurityTrendChartProps {
  domain: string;
  securityData?: any;
  className?: string;
}

function snapshotToPoint(snapshot: AnalysisSnapshot): SecurityDataPoint {
  return {
    date: new Date(snapshot.analyzedAt),
    overallScore: snapshot.overallScore,
    dnsScore: snapshot.dnsScore,
    registrationScore: snapshot.registrationScore,
    rdapScore: snapshot.rdapScore,
    riskLevel: snapshot.riskLevel,
    events: snapshot.events || [],
  };
}

function currentSecurityPoint(securityData: any): SecurityDataPoint | null {
  if (!securityData?.overallScore && securityData?.overallScore !== 0) {
    return null;
  }
  const overallScore = securityData.overallScore;
  const dnsScore =
    securityData?.breakdown?.find((b: { category: string }) =>
      b.category.toLowerCase().includes('dns')
    )?.score ?? overallScore;
  const registrationScore =
    securityData?.breakdown?.find((b: { category: string }) =>
      b.category.toLowerCase().includes('registration')
    )?.score ?? overallScore;
  const rdapScore =
    securityData?.breakdown?.find((b: { category: string }) =>
      b.category.toLowerCase().includes('rdap')
    )?.score ?? overallScore;

  let riskLevel: SecurityDataPoint['riskLevel'] = 'low';
  if (overallScore < 40) riskLevel = 'critical';
  else if (overallScore < 60) riskLevel = 'high';
  else if (overallScore < 80) riskLevel = 'medium';

  return {
    date: new Date(),
    overallScore,
    dnsScore,
    registrationScore,
    rdapScore,
    riskLevel,
    events: [],
  };
}

export function SecurityTrendChart({ 
  domain, 
  securityData, 
  className 
}: SecurityTrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [selectedMetric, setSelectedMetric] = useState<'overall' | 'dns' | 'registration' | 'rdap'>('overall');
  const [trendData, setTrendData] = useState<SecurityDataPoint[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Get theme-aware colors that update when theme changes
  const colors = useChartColors();

  // Load persisted snapshots from Redis-backed history API
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!domain) {
        setTrendData([]);
        return;
      }

      setLoadingHistory(true);
      try {
        const days =
          timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 365;
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        const history = await apiClient.getHistory(domain, 100);
        if (cancelled) return;

        const fromApi = (history.snapshots || [])
          .map(snapshotToPoint)
          .filter((p) => p.date.getTime() >= cutoff)
          .sort((a, b) => a.date.getTime() - b.date.getTime());

        // Include the live analysis point when history is sparse
        const live = currentSecurityPoint(securityData);
        if (live && fromApi.length === 0) {
          setTrendData([live]);
        } else if (live && fromApi.length > 0) {
          const last = fromApi[fromApi.length - 1];
          const sameBucket =
            Math.abs(last.date.getTime() - live.date.getTime()) < 60_000 &&
            last.overallScore === live.overallScore;
          setTrendData(sameBucket ? fromApi : [...fromApi, live]);
        } else {
          setTrendData(fromApi);
        }
      } catch {
        if (cancelled) return;
        const live = currentSecurityPoint(securityData);
        setTrendData(live ? [live] : []);
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [domain, securityData, timeRange]);

  // D3 Line Chart
  useEffect(() => {
    if (!svgRef.current || trendData.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 80, bottom: 50, left: 50 };
    const containerWidth = svgRef.current.clientWidth || 800;
    const width = containerWidth - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;
    
    // Update SVG viewBox for responsiveness
    svg.attr('viewBox', `0 0 ${containerWidth} 400`);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleTime()
      .domain(d3.extent(trendData, d => d.date) as [Date, Date])
      .range([0, width]);

    const yScale = d3.scaleLinear()
      .domain([0, 100])
      .range([height, 0]);

    // Color scales
    const riskColors = {
      low: '#22c55e',
      medium: '#f59e0b', 
      high: '#ef4444',
      critical: '#dc2626'
    };

    // Area generator for risk level background
    const area = d3.area<SecurityDataPoint>()
      .x(d => xScale(d.date))
      .y0(height)
      .y1(d => yScale(d.overallScore))
      .curve(d3.curveMonotoneX);

    // Add risk level background
    const riskLevels = ['critical', 'high', 'medium', 'low'];
    riskLevels.forEach((level, i) => {
      g.append('rect')
        .attr('x', 0)
        .attr('y', yScale((i + 1) * 25))
        .attr('width', width)
        .attr('height', yScale(i * 25) - yScale((i + 1) * 25))
        .attr('fill', riskColors[level as keyof typeof riskColors])
        .attr('opacity', 0.1);
    });

    // Add grid lines
    const xAxis = d3.axisBottom(xScale)
      .tickFormat((d) => d3.timeFormat('%m/%d')(d as Date));
    
    const yAxis = d3.axisLeft(yScale)
      .tickSize(-width);

    const xAxisGroup = g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis);

    // Style x-axis
    xAxisGroup.select('.domain')
      .style('stroke', colors.axis);
    xAxisGroup.selectAll('.tick line')
      .style('stroke', colors.axis);
    xAxisGroup.selectAll('text')
      .style('fill', colors.textSecondary);

    const yAxisGroup = g.append('g')
      .attr('class', 'grid')
      .call(yAxis);
    
    // Style y-axis and grid lines
    yAxisGroup.select('.domain')
      .style('stroke', colors.axis);
    yAxisGroup.selectAll('.tick line')
      .attr('stroke', colors.gridLines)
      .attr('stroke-width', 0.5);
    yAxisGroup.selectAll('text')
      .style('fill', colors.textSecondary);

    // Line generators
    const getScoreValue = (d: SecurityDataPoint) => {
      switch (selectedMetric) {
        case 'dns': return d.dnsScore;
        case 'registration': return d.registrationScore;
        case 'rdap': return d.rdapScore || d.overallScore;
        default: return d.overallScore;
      }
    };

    const line = d3.line<SecurityDataPoint>()
      .x(d => xScale(d.date))
      .y(d => yScale(getScoreValue(d)))
      .curve(d3.curveMonotoneX);

    // Add area fill
    const areaFill = d3.area<SecurityDataPoint>()
      .x(d => xScale(d.date))
      .y0(height)
      .y1(d => yScale(getScoreValue(d)))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(trendData)
      .attr('fill', selectedMetric === 'overall' ? '#3b82f6' : 
                   selectedMetric === 'dns' ? '#10b981' : 
                   selectedMetric === 'registration' ? '#f59e0b' : '#8b5cf6')
      .attr('fill-opacity', 0.2)
      .attr('d', areaFill);

    // Add main line
    g.append('path')
      .datum(trendData)
      .attr('fill', 'none')
      .attr('stroke', selectedMetric === 'overall' ? '#3b82f6' : 
                     selectedMetric === 'dns' ? '#10b981' : 
                     selectedMetric === 'registration' ? '#f59e0b' : '#8b5cf6')
      .attr('stroke-width', 3)
      .attr('d', line);

    // Add data points
    g.selectAll('.dot')
      .data(trendData.filter(d => d.events.length > 0))
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', d => xScale(d.date))
      .attr('cy', d => yScale(getScoreValue(d)))
      .attr('r', 4)
      .attr('fill', '#ef4444')
      .attr('stroke', colors.background)
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .append('title')
      .text(d => `${d.date.toLocaleDateString()}\nEvents: ${d.events.join(', ')}`);

    // Add latest score indicator
    const latestData = trendData[trendData.length - 1];
    if (latestData) {
      g.append('circle')
        .attr('cx', xScale(latestData.date))
        .attr('cy', yScale(getScoreValue(latestData)))
        .attr('r', 6)
        .attr('fill', selectedMetric === 'overall' ? '#3b82f6' : 
                     selectedMetric === 'dns' ? '#10b981' : 
                     selectedMetric === 'registration' ? '#f59e0b' : '#8b5cf6')
        .attr('stroke', colors.background)
        .attr('stroke-width', 3);

      // Add current score label
      g.append('text')
        .attr('x', xScale(latestData.date) + 10)
        .attr('y', yScale(getScoreValue(latestData)) + 5)
        .style('font-size', '12px')
        .style('font-weight', 'bold')
        .attr('fill', selectedMetric === 'overall' ? '#3b82f6' : 
                     selectedMetric === 'dns' ? '#10b981' : 
                     selectedMetric === 'registration' ? '#f59e0b' : '#8b5cf6')
        .text(getScoreValue(latestData));
    }

  }, [trendData, selectedMetric, colors]);

  // Calculate trend metrics
  const getTrendMetrics = () => {
    if (trendData.length < 2) return null;

    const getScore = (d: SecurityDataPoint) => {
      switch (selectedMetric) {
        case 'dns': return d.dnsScore;
        case 'registration': return d.registrationScore;
        case 'rdap': return d.rdapScore || d.overallScore;
        default: return d.overallScore;
      }
    };

    const latest = getScore(trendData[trendData.length - 1]);
    const previous = getScore(trendData[trendData.length - 8]); // Week ago
    const change = latest - previous;
    const changePercent = ((change / previous) * 100);

    return {
      current: latest,
      change,
      changePercent: changePercent.toFixed(1),
      trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable'
    };
  };

  const metrics = getTrendMetrics();

  const metricLabels = {
    overall: 'Overall Security',
    dns: 'DNS Security',
    registration: 'Registration Security',
    rdap: 'RDAP Security'
  };

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Trends - {domain}
              </CardTitle>
              <CardDescription>
                Security score analysis over time with risk indicators
              </CardDescription>
            </div>
            
            <div className="flex gap-2">
              {/* Time Range Selector */}
              {(['7d', '30d', '90d', '1y'] as const).map(range => (
                <Button
                  key={range}
                  variant={timeRange === range ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTimeRange(range)}
                >
                  {range}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Metric Selector */}
          <div className="flex flex-wrap gap-2">
            {(Object.keys(metricLabels) as Array<keyof typeof metricLabels>).map(metric => (
              <Button
                key={metric}
                variant={selectedMetric === metric ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedMetric(metric)}
                className="text-xs"
              >
                {metricLabels[metric]}
              </Button>
            ))}
          </div>

          {/* Current Metrics Display */}
          {metrics && (
            <div className="grid grid-cols-3 gap-4 p-3 rounded-lg" style={{ backgroundColor: colors.gridLines }}>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{metrics.current}</div>
                <div className="text-xs" style={{ color: colors.textSecondary }}>Current Score</div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold flex items-center justify-center gap-1 ${
                  metrics.trend === 'up' ? 'text-green-600' : 
                  metrics.trend === 'down' ? 'text-red-600' : 'text-gray-600'
                }`}>
                  {metrics.trend === 'up' && <TrendingUp className="h-5 w-5" />}
                  {metrics.trend === 'down' && <TrendingDown className="h-5 w-5" />}
                  {metrics.changePercent}%
                </div>
                <div className="text-xs" style={{ color: colors.textSecondary }}>7-Day Change</div>
              </div>
              <div className="text-center">
                <Badge 
                  variant="outline"
                  className={`text-sm ${
                    metrics.current >= 80 ? 'text-green-700 border-green-200' :
                    metrics.current >= 60 ? 'text-yellow-700 border-yellow-200' :
                    metrics.current >= 40 ? 'text-orange-700 border-orange-200' :
                    'text-red-700 border-red-200'
                  }`}
                >
                  {metrics.current >= 80 ? 'Low Risk' :
                   metrics.current >= 60 ? 'Medium Risk' :
                   metrics.current >= 40 ? 'High Risk' : 'Critical Risk'}
                </Badge>
                <div className="text-xs mt-1" style={{ color: colors.textSecondary }}>Risk Level</div>
              </div>
            </div>
          )}

          {/* Chart */}
          <div className="w-full overflow-x-auto">
            <svg
              ref={svgRef}
              width="100%"
              height={400}
              className="border rounded min-w-full"
              style={{ backgroundColor: colors.background }}
              viewBox="0 0 800 400"
            />
          </div>

          {/* Risk Level Legend */}
          <div className="flex items-center justify-center gap-4 pt-4 border-t">
            <div className="text-sm font-medium mr-2" style={{ color: colors.text }}>Risk Levels:</div>
            {[
              { level: 'Low (80-100)', color: '#22c55e' },
              { level: 'Medium (60-79)', color: '#f59e0b' },
              { level: 'High (40-59)', color: '#ef4444' },
              { level: 'Critical (0-39)', color: '#dc2626' }
            ].map(item => (
              <div key={item.level} className="flex items-center gap-1 text-xs">
                <div 
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: item.color, opacity: 0.3 }}
                />
                {item.level}
              </div>
            ))}
          </div>

          {/* Events Summary */}
          {trendData.some(d => d.events.length > 0) && (
            <div className="pt-4 border-t">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <span className="text-sm font-medium">Security Events</span>
              </div>
              <div className="text-xs" style={{ color: colors.textSecondary }}>
                Red dots on the chart indicate days with security events. 
                Hover over them for details.
              </div>
            </div>
          )}

          {trendData.length === 0 && (
            <div className="text-center py-8" style={{ color: colors.textSecondary }}>
              <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>{loadingHistory ? 'Loading history…' : 'No security trend data available'}</p>
              <p className="text-sm">
                Analyze this domain again over time to build Redis-backed history
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}