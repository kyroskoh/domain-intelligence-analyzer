'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useChartColors } from '@/lib/chart-colors';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, AlertCircle } from 'lucide-react';

interface TimelineEvent {
  date: Date;
  title: string;
  description: string;
  type: 'creation' | 'update' | 'expiry' | 'security' | 'dns';
  severity?: 'low' | 'medium' | 'high';
}

interface DomainTimelineChartProps {
  domain: string;
  whoisData?: any;
  dnsData?: any;
  securityData?: any;
  className?: string;
}

export function DomainTimelineChart({ 
  domain, 
  whoisData, 
  dnsData, 
  securityData, 
  className 
}: DomainTimelineChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [zoomTransform, setZoomTransform] = useState<any>(null);

  // Process data to create timeline events
  useEffect(() => {
    const timelineEvents: TimelineEvent[] = [];

    // Add WHOIS events
    if (whoisData) {
      if (whoisData.createdDate) {
        timelineEvents.push({
          date: new Date(whoisData.createdDate),
          title: 'Domain Registered',
          description: `Domain ${domain} was first registered`,
          type: 'creation'
        });
      }

      if (whoisData.updatedDate) {
        timelineEvents.push({
          date: new Date(whoisData.updatedDate),
          title: 'WHOIS Updated',
          description: 'Domain registration information was updated',
          type: 'update'
        });
      }

      if (whoisData.expirationDate) {
        const expiryDate = new Date(whoisData.expirationDate);
        const now = new Date();
        const isExpiringSoon = (expiryDate.getTime() - now.getTime()) < (90 * 24 * 60 * 60 * 1000);
        
        timelineEvents.push({
          date: expiryDate,
          title: 'Domain Expires',
          description: `Domain registration expires on this date`,
          type: 'expiry',
          severity: isExpiringSoon ? 'high' : 'low'
        });
      }
    }

    // Add security events
    if (securityData && securityData.lastChecked) {
      timelineEvents.push({
        date: new Date(securityData.lastChecked),
        title: 'Security Analysis',
        description: `Security score: ${securityData.overallScore}/100 (${securityData.riskLevel} risk)`,
        type: 'security',
        severity: securityData.riskLevel === 'high' ? 'high' : 
                 securityData.riskLevel === 'medium' ? 'medium' : 'low'
      });
    }

    // Add DNS events (simplified - in reality you'd track DNS changes over time)
    if (dnsData) {
      timelineEvents.push({
        date: new Date(), // Current date as we don't have historical DNS data
        title: 'DNS Analysis',
        description: `DNS records analyzed - DNSSEC: ${dnsData.dnssec?.enabled ? 'Enabled' : 'Disabled'}`,
        type: 'dns',
        severity: !dnsData.dnssec?.enabled ? 'medium' : 'low'
      });
    }

    // Sort events by date
    timelineEvents.sort((a, b) => a.date.getTime() - b.date.getTime());
    setEvents(timelineEvents);
  }, [domain, whoisData, dnsData, securityData]);

  // Get theme-aware colors that update when theme changes
  const colors = useChartColors();

  // D3 Timeline Visualization with Zoom and Pan
  useEffect(() => {
    if (!svgRef.current || events.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 20, bottom: 60, left: 60 };
    const containerWidth = svgRef.current.clientWidth || 800;
    const width = containerWidth - margin.left - margin.right;
    const height = 400 - margin.bottom - margin.top;
    
    // Update SVG dimensions for responsiveness
    svg
      .attr('width', containerWidth)
      .attr('height', 400)
      .attr('viewBox', `0 0 ${containerWidth} 400`);

    // Create main group
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create clip path to prevent overflow during zoom
    svg.append('defs')
      .append('clipPath')
      .attr('id', `timeline-clip-${domain}`)
      .append('rect')
      .attr('width', width)
      .attr('height', height);

    // Create scales with padding for better visibility
    const timeExtent = d3.extent(events, d => d.date) as [Date, Date];
    const timePadding = (timeExtent[1].getTime() - timeExtent[0].getTime()) * 0.1; // 10% padding
    const paddedDomain: [Date, Date] = [
      new Date(timeExtent[0].getTime() - timePadding),
      new Date(timeExtent[1].getTime() + timePadding)
    ];
    
    const originalXScale = d3.scaleTime()
      .domain(paddedDomain)
      .range([0, width]);

    let xScale = originalXScale;

    const yScale = d3.scaleBand()
      .domain(events.map((_, i) => i.toString()))
      .range([0, height])
      .paddingInner(0.2);

    // Color scale for event types
    const colorScale = d3.scaleOrdinal()
      .domain(['creation', 'update', 'expiry', 'security', 'dns'])
      .range(['#22c55e', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6']);

    // Create content group with clipping
    const contentG = g.append('g')
      .attr('clip-path', `url(#timeline-clip-${domain})`);

    // Create timeline line
    const updateTimeline = () => {
      const line = d3.line<TimelineEvent>()
        .x(d => xScale(d.date))
        .y((_, i) => yScale(i.toString())! + yScale.bandwidth() / 2)
        .curve(d3.curveMonotoneX);

      // Update or create timeline path
      const timelinePath = contentG.selectAll('.timeline-path')
        .data([events]);
      
      timelinePath.enter()
        .append('path')
        .attr('class', 'timeline-path')
        .merge(timelinePath as any)
        .attr('fill', 'none')
        .attr('stroke', colors.gridLines)
        .attr('stroke-width', 2)
        .attr('d', line);
    };

    // Create x-axis
    const xAxisG = g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height})`);

    const updateXAxis = () => {
      // Dynamic tick count based on zoom level
      const tickCount = Math.max(3, Math.min(10, Math.floor(width / 100)));
      const xAxis = d3.axisBottom(xScale)
        .tickFormat((d) => d3.timeFormat('%Y-%m-%d')(d as Date))
        .ticks(tickCount);

      xAxisG.call(xAxis);
      
      // Style axis elements
      xAxisG.select('.domain')
        .style('stroke', colors.axis);
      xAxisG.selectAll('.tick line')
        .style('stroke', colors.axis);
      xAxisG.selectAll('text')
        .style('text-anchor', 'end')
        .style('font-size', '11px')
        .style('fill', colors.textSecondary)
        .attr('dx', '-.8em')
        .attr('dy', '.15em')
        .attr('transform', 'rotate(-45)');
    };

    // Update events function
    const updateEvents = () => {
      const eventGroups = contentG.selectAll('.event')
        .data(events, (d: any) => d.title + d.date.getTime());
      
      // Remove old events
      eventGroups.exit().remove();
      
      // Add new events
      const eventEnter = eventGroups.enter()
        .append('g')
        .attr('class', 'event')
        .style('cursor', 'pointer')
        .on('click', (event, d) => {
          setSelectedEvent(d);
        })
        .on('mouseenter', function(event, d) {
          d3.select(this).select('circle')
            .transition()
            .duration(200)
            .attr('r', 8);
          
          // Show tooltip with event details
          const tooltip = d3.select('body')
            .selectAll('.timeline-tooltip')
            .data([d])
            .join('div')
            .attr('class', 'timeline-tooltip')
            .style('position', 'absolute')
            .style('background', colors.tooltip.background)
            .style('color', colors.tooltip.text)
            .style('padding', '8px')
            .style('border-radius', '4px')
            .style('font-size', '12px')
            .style('pointer-events', 'none')
            .style('z-index', '1000')
            .style('opacity', 0);

          tooltip.html(`
            <div><strong>${d.title}</strong></div>
            <div>${d.description}</div>
            <div><small>${d.date.toLocaleDateString()}</small></div>
          `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px')
            .transition()
            .duration(200)
            .style('opacity', 1);
        })
        .on('mouseleave', function() {
          d3.select(this).select('circle')
            .transition()
            .duration(200)
            .attr('r', 6);
          
          // Hide tooltip
          d3.select('body').selectAll('.timeline-tooltip')
            .transition()
            .duration(200)
            .style('opacity', 0)
            .remove();
        });
      
      // Add circles for events
      eventEnter.append('circle')
        .attr('r', 6)
        .attr('fill', d => colorScale(d.type) as string)
        .attr('stroke', colors.background)
        .attr('stroke-width', 2);
      
      // Add event labels with better positioning
      eventEnter.append('text')
        .attr('dx', 12)
        .attr('dy', '0.35em')
        .style('font-size', '12px')
        .style('font-weight', '500')
        .style('fill', colors.text)
        .style('pointer-events', 'none')
        .text(d => {
          // Truncate long titles to prevent overflow
          return d.title.length > 20 ? d.title.substring(0, 17) + '...' : d.title;
        });
      
      // Add severity indicators
      eventEnter.filter(d => d.severity && d.severity !== 'low')
        .append('circle')
        .attr('r', 3)
        .attr('cx', 8)
        .attr('cy', -8)
        .attr('fill', d => d.severity === 'high' ? '#ef4444' : '#f59e0b')
        .attr('stroke', colors.background)
        .attr('stroke-width', 1);
      
      // Update positions for all events (new and existing)
      const eventUpdate = eventEnter.merge(eventGroups as any);
      eventUpdate
        .attr('transform', (d, i) => 
          `translate(${xScale(d.date)}, ${yScale(i.toString())! + yScale.bandwidth() / 2})`
        );
    };

    // Zoom behavior with better constraints
    const zoom = d3.zoom()
      .scaleExtent([0.1, 20])
      .translateExtent([[-200, -50], [width + 200, height + 50]])
      .on('zoom', (event) => {
        const { transform } = event;
        setZoomTransform(transform);
        
        // Update x scale with zoom transform
        xScale = transform.rescaleX(originalXScale);
        
        // Update timeline and events
        updateTimeline();
        updateXAxis();
        updateEvents();
      });

    // Apply zoom to svg
    svg.call(zoom as any);
    
    // Add zoom controls
    const controls = svg.append('g')
      .attr('class', 'zoom-controls')
      .attr('transform', `translate(${containerWidth - 100}, 10)`);
    
    // Reset zoom button
    const resetButton = controls.append('g')
      .attr('class', 'reset-button')
      .style('cursor', 'pointer')
      .on('click', () => {
        svg.transition()
          .duration(750)
          .call(zoom.transform as any, d3.zoomIdentity);
      });
    
    resetButton.append('rect')
      .attr('width', 80)
      .attr('height', 24)
      .attr('fill', colors.background)
      .attr('stroke', colors.gridLines)
      .attr('rx', 4);
    
    resetButton.append('text')
      .attr('x', 40)
      .attr('y', 16)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('fill', colors.text)
      .text('Reset View');

    // Initial render
    updateTimeline();
    updateXAxis();
    updateEvents();

    // Add pan instructions
    g.append('text')
      .attr('x', width / 2)
      .attr('y', -5)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('fill', colors.textSecondary)
      .style('font-weight', '400')
      .text('🖱️ Click and drag to pan • Scroll to zoom • Click events for details');
    
    // Cleanup function
    return () => {
      // Remove any lingering tooltips
      d3.select('body').selectAll('.timeline-tooltip').remove();
    };

  }, [events, colors]);

  const getEventTypeIcon = (type: string) => {
    switch (type) {
      case 'creation':
      case 'update':
        return <Calendar className="h-4 w-4" />;
      case 'expiry':
        return <Clock className="h-4 w-4" />;
      case 'security':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Calendar className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Domain Timeline - {domain}
          </CardTitle>
          <CardDescription>
            Historical events and important dates for this domain
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div 
            ref={containerRef}
            className="w-full overflow-hidden border rounded"
            style={{ height: '400px', backgroundColor: colors.background }}
          >
            <svg
              ref={svgRef}
              width="100%"
              height={400}
              className="cursor-move select-none"
              style={{ display: 'block' }}
            />
          </div>

          {/* Event Details Panel */}
          {selectedEvent && (
            <div className="p-4 border rounded-lg" style={{ backgroundColor: colors.background }}>
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-2">
                  {getEventTypeIcon(selectedEvent.type)}
                  <Badge 
                    variant="outline" 
                    className={`${getSeverityColor(selectedEvent.severity)} border`}
                  >
                    {selectedEvent.type}
                  </Badge>
                  {selectedEvent.severity && selectedEvent.severity !== 'low' && (
                    <Badge 
                      variant="outline"
                      className={getSeverityColor(selectedEvent.severity)}
                    >
                      {selectedEvent.severity} severity
                    </Badge>
                  )}
                </div>
              </div>
              <div className="mt-2">
                <h4 className="font-semibold">{selectedEvent.title}</h4>
                <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                  {selectedEvent.description}
                </p>
                <p className="text-xs mt-2" style={{ color: colors.textSecondary }}>
                  {selectedEvent.date.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
            </div>
          )}

          {/* Event Legend */}
          <div className="flex flex-wrap gap-2 pt-4 border-t">
            <div className="text-sm font-medium mr-4" style={{ color: colors.text }}>Event Types:</div>
            {[
              { type: 'creation', label: 'Creation', color: '#22c55e' },
              { type: 'update', label: 'Update', color: '#3b82f6' },
              { type: 'expiry', label: 'Expiry', color: '#ef4444' },
              { type: 'security', label: 'Security', color: '#f59e0b' },
              { type: 'dns', label: 'DNS', color: '#8b5cf6' }
            ].map(item => (
              <div key={item.type} className="flex items-center gap-1 text-sm">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </div>
            ))}
          </div>

          {events.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No timeline events available</p>
              <p className="text-sm">Provide domain data to see historical events</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}