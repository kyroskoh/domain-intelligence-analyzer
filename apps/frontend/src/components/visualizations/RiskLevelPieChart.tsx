'use client';

import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

interface RiskLevelData {
  level: 'low' | 'medium' | 'high' | 'critical';
  count: number;
  score: number;
}

interface RiskLevelPieChartProps {
  overallScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  breakdown: { category: string; score: number; checks: any[] }[];
  width?: number;
  height?: number;
  className?: string;
}

export default function RiskLevelPieChart({
  overallScore,
  riskLevel,
  breakdown,
  width = 300,
  height = 300,
  className = ''
}: RiskLevelPieChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!breakdown || breakdown.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const radius = Math.min(width, height) / 2 - 20;
    const centerX = width / 2;
    const centerY = height / 2;

    // Process data to show risk distribution
    const riskData = breakdown.map(category => {
      let level: 'low' | 'medium' | 'high' | 'critical';
      if (category.score >= 80) level = 'low';
      else if (category.score >= 60) level = 'medium';
      else if (category.score >= 40) level = 'high';
      else level = 'critical';

      return {
        category: category.category,
        level,
        score: category.score,
        checks: category.checks.length
      };
    });

    // Create pie data
    const pie = d3.pie<typeof riskData[0]>()
      .value(() => 1) // Equal size segments for each category
      .sort(null);

    const pieData = pie(riskData);

    // Color scheme for risk levels
    const colors = {
      low: '#22c55e',      // green
      medium: '#eab308',   // yellow
      high: '#f97316',     // orange
      critical: '#ef4444'  // red
    };

    // Create arc generator
    const arc = d3.arc<d3.PieArcDatum<typeof riskData[0]>>()
      .innerRadius(radius * 0.6) // Donut chart
      .outerRadius(radius);

    // Create main group
    const g = svg.append('g')
      .attr('transform', `translate(${centerX},${centerY})`);

    // Add arcs
    const arcs = g.selectAll('.arc')
      .data(pieData)
      .enter()
      .append('g')
      .attr('class', 'arc');

    // Add paths with animation
    arcs.append('path')
      .attr('d', arc)
      .attr('fill', d => colors[d.data.level])
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .style('opacity', 0.8)
      .on('mouseover', function(event, d) {
        d3.select(this)
          .style('opacity', 1)
          .attr('stroke-width', 3);
        
        // Show tooltip
        const tooltip = d3.select('body').append('div')
          .attr('class', 'risk-tooltip')
          .style('position', 'absolute')
          .style('padding', '10px')
          .style('background', 'rgba(0, 0, 0, 0.8)')
          .style('color', 'white')
          .style('border-radius', '4px')
          .style('font-size', '12px')
          .style('pointer-events', 'none')
          .style('opacity', 0);

        tooltip.transition().duration(200).style('opacity', 1);
        tooltip.html(`
          <strong>${d.data.category}</strong><br/>
          Risk Level: ${d.data.level.toUpperCase()}<br/>
          Score: ${d.data.score}%<br/>
          Checks: ${d.data.checks}
        `)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', function() {
        d3.select(this)
          .style('opacity', 0.8)
          .attr('stroke-width', 2);
        
        d3.selectAll('.risk-tooltip').remove();
      });

    // Add category labels
    arcs.append('text')
      .attr('transform', d => `translate(${arc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .style('font-weight', 'bold')
      .style('fill', '#fff')
      .style('text-shadow', '1px 1px 1px rgba(0,0,0,0.5)')
      .text(d => d.data.category);

    // Add center score display
    const centerGroup = g.append('g')
      .attr('class', 'center-score');

    // Overall score
    centerGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', -10)
      .style('font-size', '24px')
      .style('font-weight', 'bold')
      .style('fill', colors[riskLevel])
      .text(overallScore);

    centerGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', 8)
      .style('font-size', '12px')
      .style('fill', '#666')
      .text('Overall Score');

    centerGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', 25)
      .style('font-size', '10px')
      .style('font-weight', 'bold')
      .style('fill', colors[riskLevel])
      .text(riskLevel.toUpperCase());

    // Add title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .style('font-weight', 'bold')
      .text('Risk Level Distribution');

    // Add legend
    const legend = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(20, ${height - 80})`);

    const legendData = Object.entries(colors).map(([level, color]) => ({
      level: level as keyof typeof colors,
      color,
      count: riskData.filter(d => d.level === level).length
    })).filter(d => d.count > 0);

    const legendItems = legend.selectAll('.legend-item')
      .data(legendData)
      .enter()
      .append('g')
      .attr('class', 'legend-item')
      .attr('transform', (_, i) => `translate(0, ${i * 18})`);

    legendItems.append('rect')
      .attr('width', 12)
      .attr('height', 12)
      .attr('fill', d => d.color)
      .attr('rx', 2);

    legendItems.append('text')
      .attr('x', 18)
      .attr('y', 9)
      .style('font-size', '11px')
      .style('fill', '#333')
      .text(d => `${d.level.charAt(0).toUpperCase() + d.level.slice(1)} (${d.count})`);

    // Animate the chart
    arcs.select('path')
      .datum((d) => ({ startAngle: 0, endAngle: 0, ...d }))
      .transition()
      .duration(1000)
      .delay((_, i) => i * 100)
      .attrTween('d', function(d) {
        const interpolate = d3.interpolate(
          { startAngle: 0, endAngle: 0 },
          { startAngle: d.startAngle, endAngle: d.endAngle }
        );
        return function(t) {
          return arc({ ...d, ...interpolate(t) } as any) || '';
        };
      });

    // Cleanup on unmount
    return () => {
      d3.selectAll('.risk-tooltip').remove();
    };
  }, [overallScore, riskLevel, breakdown, width, height]);

  if (!breakdown || breakdown.length === 0) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ width, height }}>
        <div className="text-center text-muted-foreground">
          <div className="text-lg mb-2">🔒</div>
          <p>No security data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ 
          maxWidth: '100%', 
          height: 'auto',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}
      />
    </div>
  );
}