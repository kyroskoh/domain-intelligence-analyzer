'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
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
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);

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

  // D3 Timeline Visualization
  useEffect(() => {
    if (!svgRef.current || events.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 20, bottom: 40, left: 60 };
    const width = 800 - margin.left - margin.right;
    const height = 400 - margin.bottom - margin.top;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create scales
    const xScale = d3.scaleTime()
      .domain(d3.extent(events, d => d.date) as [Date, Date])
      .range([0, width]);

    const yScale = d3.scaleBand()
      .domain(events.map((_, i) => i.toString()))
      .range([0, height])
      .paddingInner(0.1);

    // Color scale for event types
    const colorScale = d3.scaleOrdinal()
      .domain(['creation', 'update', 'expiry', 'security', 'dns'])
      .range(['#22c55e', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6']);

    // Create timeline line
    const line = d3.line<TimelineEvent>()
      .x(d => xScale(d.date))
      .y((_, i) => yScale(i.toString())! + yScale.bandwidth() / 2)
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(events)
      .attr('fill', 'none')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-width', 2)
      .attr('d', line);

    // Add x-axis
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d3.timeFormat('%Y-%m-%d'));

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis)
      .selectAll('text')
      .style('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '.15em')
      .attr('transform', 'rotate(-45)');

    // Add events as circles
    const eventGroups = g.selectAll('.event')
      .data(events)
      .enter()
      .append('g')
      .attr('class', 'event')
      .attr('transform', (d, i) => 
        `translate(${xScale(d.date)}, ${yScale(i.toString())! + yScale.bandwidth() / 2})`
      )
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        setSelectedEvent(d);
      })
      .on('mouseenter', function() {
        d3.select(this).select('circle')
          .transition()
          .duration(200)
          .attr('r', 8);
      })
      .on('mouseleave', function() {
        d3.select(this).select('circle')
          .transition()
          .duration(200)
          .attr('r', 6);
      });

    // Add circles for events
    eventGroups.append('circle')
      .attr('r', 6)
      .attr('fill', d => colorScale(d.type) as string)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // Add event labels
    eventGroups.append('text')
      .attr('dx', 12)
      .attr('dy', '0.35em')
      .style('font-size', '12px')
      .style('font-weight', '500')
      .text(d => d.title);

    // Add severity indicators
    eventGroups.filter(d => d.severity && d.severity !== 'low')
      .append('circle')
      .attr('r', 3)
      .attr('cx', 8)
      .attr('cy', -8)
      .attr('fill', d => d.severity === 'high' ? '#ef4444' : '#f59e0b')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1);

  }, [events]);

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
          <div className="w-full overflow-x-auto">
            <svg
              ref={svgRef}
              width={800}
              height={400}
              className="border rounded bg-gray-50"
            />
          </div>

          {/* Event Details Panel */}
          {selectedEvent && (
            <div className="p-4 border rounded-lg bg-white">
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
                <p className="text-sm text-gray-600 mt-1">
                  {selectedEvent.description}
                </p>
                <p className="text-xs text-gray-500 mt-2">
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
            <div className="text-sm font-medium text-gray-700 mr-4">Event Types:</div>
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