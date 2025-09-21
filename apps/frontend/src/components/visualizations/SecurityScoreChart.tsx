'use client';

import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

interface SecurityCategory {
  category: string;
  score: number;
  weight: number;
  description: string;
  checks: any[];
}

interface SecurityScoreChartProps {
  data: SecurityCategory[];
  height?: number;
  className?: string;
}

export default function SecurityScoreChart({ 
  data, 
  height = 400, 
  className = '' 
}: SecurityScoreChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height });

  // Handle container resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width: containerWidth } = containerRef.current.getBoundingClientRect();
        setDimensions({ width: Math.max(containerWidth, 300), height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [height]);

  useEffect(() => {
    if (!data || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous content

    const margin = { top: 20, right: 30, bottom: 80, left: 60 };
    const chartWidth = dimensions.width - margin.left - margin.right;
    const chartHeight = dimensions.height - margin.top - margin.bottom;

    // Create scales
    const xScale = d3.scaleBand()
      .domain(data.map(d => d.category))
      .range([0, chartWidth])
      .padding(0.2);

    const yScale = d3.scaleLinear()
      .domain([0, 100])
      .range([chartHeight, 0]);

    // Color scale based on score
    const colorScale = d3.scaleSequential(d3.interpolateRdYlGn)
      .domain([0, 100]);

    // Create main group
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add bars
    const bars = g.selectAll('.bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', d => xScale(d.category)!)
      .attr('width', xScale.bandwidth())
      .attr('y', chartHeight) // Start from bottom for animation
      .attr('height', 0)
      .attr('fill', d => colorScale(d.score))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .attr('rx', 4)
      .style('cursor', 'pointer');

    // Animate bars
    bars.transition()
      .duration(1000)
      .delay((_, i) => i * 100)
      .attr('y', d => yScale(d.score))
      .attr('height', d => chartHeight - yScale(d.score));

    // Add score labels on bars
    g.selectAll('.score-label')
      .data(data)
      .enter()
      .append('text')
      .attr('class', 'score-label')
      .attr('x', d => xScale(d.category)! + xScale.bandwidth() / 2)
      .attr('y', d => yScale(d.score) - 8)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('font-weight', 'bold')
      .style('fill', '#333')
      .style('opacity', 0)
      .text(d => `${d.score}`)
      .transition()
      .duration(1000)
      .delay((_, i) => i * 100 + 500)
      .style('opacity', 1);

    // Add x-axis
    const xAxis = d3.axisBottom(xScale);
    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(xAxis)
      .selectAll('text')
      .style('font-size', '11px')
      .style('text-anchor', 'middle')
      .attr('dy', '1em');

    // Add y-axis
    const yAxis = d3.axisLeft(yScale)
      .tickFormat(d => `${d}%`);
    g.append('g')
      .attr('class', 'y-axis')
      .call(yAxis)
      .selectAll('text')
      .style('font-size', '11px');

    // Add y-axis label
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', 0 - margin.left)
      .attr('x', 0 - (chartHeight / 2))
      .attr('dy', '1em')
      .style('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('font-weight', 'bold')
      .text('Security Score (%)');

    // Add title
    svg.append('text')
      .attr('x', dimensions.width / 2)
      .attr('y', margin.top / 2)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .style('font-weight', 'bold')
      .text('Security Score Breakdown by Category');

    // Add tooltips
    const tooltip = d3.select('body')
      .append('div')
      .attr('class', 'tooltip')
      .style('position', 'absolute')
      .style('padding', '10px')
      .style('background', 'rgba(0, 0, 0, 0.8)')
      .style('color', 'white')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0);

    bars.on('mouseover', (event, d) => {
      tooltip.transition().duration(200).style('opacity', 1);
      tooltip.html(`
        <strong>${d.category}</strong><br/>
        Score: ${d.score}%<br/>
        Weight: ${(d.weight * 100).toFixed(0)}%<br/>
        Checks: ${d.checks.length}<br/>
        ${d.description}
      `)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px');
      
      d3.select(event.currentTarget)
        .attr('stroke', '#333')
        .attr('stroke-width', 2);
    })
    .on('mouseout', (event) => {
      tooltip.transition().duration(200).style('opacity', 0);
      d3.select(event.currentTarget)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1);
    });

    // Cleanup tooltip on component unmount
    return () => {
      d3.selectAll('.tooltip').remove();
    };
  }, [data, dimensions.width, dimensions.height]);

  if (!data || data.length === 0) {
    return (
      <div ref={containerRef} className={`flex items-center justify-center ${className}`} style={{ height }}>
        <div className="text-center text-muted-foreground">
          <div className="text-lg mb-2">📊</div>
          <p>No security data available</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`w-full ${className}`}>
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        style={{ 
          width: '100%',
          height: 'auto',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}
      />
    </div>
  );
}