'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useChartColors } from '@/lib/chart-colors';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Network, Server, Globe, AlertCircle, CheckCircle, Zap } from 'lucide-react';

interface NetworkNode {
  id: string;
  name: string;
  type: 'domain' | 'nameserver' | 'ip' | 'registrar';
  status: 'healthy' | 'warning' | 'error' | 'unknown';
  details?: any;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface NetworkLink {
  source: string;
  target: string;
  type: 'dns' | 'registration' | 'resolution';
  strength: number;
}

interface NetworkTopologyDiagramProps {
  domain: string;
  whoisData?: any;
  dnsData?: any;
  rdapData?: any;
  className?: string;
}

export function NetworkTopologyDiagram({ 
  domain, 
  whoisData, 
  dnsData, 
  rdapData, 
  className 
}: NetworkTopologyDiagramProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<NetworkNode[]>([]);
  const [links, setLinks] = useState<NetworkLink[]>([]);
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  
  // Get theme-aware colors that update when theme changes
  const colors = useChartColors();

  // Process data to create network topology
  useEffect(() => {
    const networkNodes: NetworkNode[] = [];
    const networkLinks: NetworkLink[] = [];

    // Add domain as central node
    networkNodes.push({
      id: domain,
      name: domain,
      type: 'domain',
      status: 'healthy',
      details: { whois: whoisData, dns: dnsData }
    });

    // Add registrar node
    if (whoisData?.registrar?.name) {
      const registrarId = `registrar-${whoisData.registrar.name}`;
      networkNodes.push({
        id: registrarId,
        name: whoisData.registrar.name,
        type: 'registrar',
        status: 'healthy',
        details: whoisData.registrar
      });
      
      networkLinks.push({
        source: domain,
        target: registrarId,
        type: 'registration',
        strength: 0.8
      });
    }

    // Add nameserver nodes
    if (whoisData?.nameservers || dnsData?.nameservers) {
      const nameservers = whoisData?.nameservers || 
                         dnsData?.nameservers?.map((ns: any) => ns.name || ns) || [];
      
      nameservers.forEach((ns: string | any) => {
        const nsName = typeof ns === 'string' ? ns : ns.name;
        const nsId = `ns-${nsName}`;
        
        let status = 'unknown';
        let details = {};
        
        // Check if we have health data for this nameserver
        if (dnsData?.nameservers) {
          const nsHealth = dnsData.nameservers.find((n: any) => 
            (n.name === nsName) || (typeof n === 'string' && n === nsName)
          );
          
          if (nsHealth && typeof nsHealth === 'object') {
            status = nsHealth.reachable ? 'healthy' : 'error';
            details = nsHealth;
          }
        }
        
        networkNodes.push({
          id: nsId,
          name: nsName,
          type: 'nameserver',
          status: status as any,
          details
        });
        
        networkLinks.push({
          source: domain,
          target: nsId,
          type: 'dns',
          strength: 0.6
        });

        // Add IP nodes if available
        if (typeof ns === 'object' && ns.ip) {
          const ipId = `ip-${ns.ip}`;
          networkNodes.push({
            id: ipId,
            name: ns.ip,
            type: 'ip',
            status: ns.reachable ? 'healthy' : 'warning',
            details: { ip: ns.ip, responseTime: ns.responseTime }
          });
          
          networkLinks.push({
            source: nsId,
            target: ipId,
            type: 'resolution',
            strength: 0.4
          });
        }
      });
    }

    setNodes(networkNodes);
    setLinks(networkLinks);
  }, [domain, whoisData, dnsData, rdapData]);

  // D3 Force-Directed Graph
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const containerWidth = svgRef.current.clientWidth || 1000;
    const width = containerWidth;
    const height = 600;
    
    // Update SVG viewBox for responsiveness
    svg.attr('viewBox', `0 0 ${containerWidth} ${height}`);

    // Create simulation
    const simulation = d3.forceSimulation<NetworkNode>(nodes)
      .force('link', d3.forceLink<NetworkNode, NetworkLink>(links)
        .id(d => d.id)
        .distance(d => 100 / d.strength)
        .strength(d => d.strength)
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Color scale for node types
    const nodeColors = {
      domain: '#3b82f6',
      nameserver: '#10b981',
      registrar: '#f59e0b',
      ip: '#8b5cf6'
    };

    const statusColors = {
      healthy: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
      unknown: '#6b7280'
    };

    // Create links
    const link = svg.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', d => {
        switch (d.type) {
          case 'dns': return '#10b981';
          case 'registration': return '#f59e0b';
          case 'resolution': return '#8b5cf6';
          default: return '#6b7280';
        }
      })
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => Math.sqrt(d.strength * 10));

    // Create node groups
    const nodeGroup = svg.append('g')
      .attr('class', 'nodes')
      .selectAll('.node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .call(d3.drag<SVGGElement, NetworkNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
          setIsSimulating(true);
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
          setIsSimulating(false);
        })
      )
      .on('click', (event, d) => {
        setSelectedNode(d);
      });

    // Add circles for nodes
    nodeGroup.append('circle')
      .attr('r', d => d.type === 'domain' ? 20 : 15)
      .attr('fill', d => nodeColors[d.type])
      .attr('stroke', d => statusColors[d.status])
      .attr('stroke-width', 3);

    // Add status indicators
    nodeGroup.append('circle')
      .attr('r', 5)
      .attr('cx', 12)
      .attr('cy', -12)
      .attr('fill', d => statusColors[d.status])
      .attr('stroke', colors.background)
      .attr('stroke-width', 1);

    // Add labels
    nodeGroup.append('text')
      .attr('dx', 25)
      .attr('dy', '0.35em')
      .style('font-size', '12px')
      .style('font-weight', '500')
      .style('fill', colors.text)
      .text(d => d.name.length > 20 ? d.name.substring(0, 17) + '...' : d.name);

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as any).x)
        .attr('y1', d => (d.source as any).y)
        .attr('x2', d => (d.target as any).x)
        .attr('y2', d => (d.target as any).y);

      nodeGroup
        .attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Store simulation reference for cleanup
    return () => {
      simulation.stop();
    };
  }, [nodes, links, colors]);

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'domain':
        return <Globe className="h-4 w-4" />;
      case 'nameserver':
        return <Server className="h-4 w-4" />;
      case 'registrar':
        return <Network className="h-4 w-4" />;
      case 'ip':
        return <Zap className="h-4 w-4" />;
      default:
        return <Network className="h-4 w-4" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const resetSimulation = () => {
    if (svgRef.current) {
      // Re-trigger the useEffect by updating a state
      setNodes([...nodes]);
    }
  };

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Network Topology - {domain}
              </CardTitle>
              <CardDescription>
                DNS infrastructure and nameserver relationships
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={resetSimulation}
                disabled={isSimulating}
              >
                Reset Layout
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="w-full overflow-auto">
            <svg
              ref={svgRef}
              width="100%"
              height={600}
              className="border rounded min-w-full"
              style={{ backgroundColor: colors.background }}
              viewBox="0 0 1000 600"
            />
          </div>

          {/* Node Details Panel */}
          {selectedNode && (
            <div className="p-4 border rounded-lg" style={{ backgroundColor: colors.background }}>
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-2">
                  {getNodeIcon(selectedNode.type)}
                  <Badge variant="outline" className="capitalize">
                    {selectedNode.type}
                  </Badge>
                  {getStatusIcon(selectedNode.status)}
                  <Badge 
                    variant="outline" 
                    className={`capitalize ${
                      selectedNode.status === 'healthy' ? 'text-green-700 border-green-200' :
                      selectedNode.status === 'warning' ? 'text-yellow-700 border-yellow-200' :
                      selectedNode.status === 'error' ? 'text-red-700 border-red-200' :
                      'text-gray-700 border-gray-200'
                    }`}
                  >
                    {selectedNode.status}
                  </Badge>
                </div>
              </div>
              <div className="mt-2">
                <h4 className="font-semibold">{selectedNode.name}</h4>
                
                {/* Type-specific details */}
                {selectedNode.type === 'nameserver' && selectedNode.details && (
                  <div className="mt-2 space-y-1 text-sm">
                    {selectedNode.details.ip && (
                      <p><strong>IP:</strong> {selectedNode.details.ip}</p>
                    )}
                    {selectedNode.details.responseTime && (
                      <p><strong>Response Time:</strong> {selectedNode.details.responseTime}ms</p>
                    )}
                    {selectedNode.details.reachable !== undefined && (
                      <p><strong>Reachable:</strong> {selectedNode.details.reachable ? 'Yes' : 'No'}</p>
                    )}
                    <p>
                      <a
                        href={`/entity/ns/${encodeURIComponent(selectedNode.name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline-offset-4 hover:underline text-primary"
                      >
                        Related domains / deep link
                      </a>
                      {' · '}
                      <a
                        href={`/?domain=${encodeURIComponent(selectedNode.name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline-offset-4 hover:underline text-primary"
                      >
                        Analyze nameserver
                      </a>
                    </p>
                  </div>
                )}
                
                {selectedNode.type === 'registrar' && selectedNode.details && (
                  <div className="mt-2 space-y-1 text-sm">
                    {selectedNode.details.url && (
                      <p>
                        <strong>URL:</strong>{' '}
                        <a
                          href={selectedNode.details.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline-offset-4 hover:underline"
                        >
                          {selectedNode.details.url}
                        </a>
                      </p>
                    )}
                    {selectedNode.details.abuseContactEmail && (
                      <p><strong>Abuse Contact:</strong> {selectedNode.details.abuseContactEmail}</p>
                    )}
                    <p>
                      <a
                        href={`/entity/registrar/${encodeURIComponent(selectedNode.name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline-offset-4 hover:underline text-primary"
                      >
                        Related domains
                      </a>
                    </p>
                  </div>
                )}

                {selectedNode.type === 'ip' && selectedNode.details && (
                  <div className="mt-2 space-y-1 text-sm">
                    <p><strong>IP Address:</strong> {selectedNode.details.ip}</p>
                    {selectedNode.details.responseTime && (
                      <p><strong>Response Time:</strong> {selectedNode.details.responseTime}ms</p>
                    )}
                  </div>
                )}

                {selectedNode.type === 'domain' && (
                  <div className="mt-2 space-y-1 text-sm">
                    <p><strong>Root Domain:</strong> Central node in network topology</p>
                    <p><strong>Connected Services:</strong> {links.filter(l => 
                      l.source === selectedNode.id || l.target === selectedNode.id
                    ).length} connections</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <div className="text-sm font-medium mb-2" style={{ color: colors.text }}>Node Types:</div>
              <div className="space-y-1">
                {[
                  { type: 'domain', label: 'Domain', color: '#3b82f6' },
                  { type: 'nameserver', label: 'Nameserver', color: '#10b981' },
                  { type: 'registrar', label: 'Registrar', color: '#f59e0b' },
                  { type: 'ip', label: 'IP Address', color: '#8b5cf6' }
                ].map(item => (
                  <div key={item.type} className="flex items-center gap-2 text-sm">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    {item.label}
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <div className="text-sm font-medium mb-2" style={{ color: colors.text }}>Connection Types:</div>
              <div className="space-y-1">
                {[
                  { type: 'dns', label: 'DNS Resolution', color: '#10b981' },
                  { type: 'registration', label: 'Registration', color: '#f59e0b' },
                  { type: 'resolution', label: 'IP Resolution', color: '#8b5cf6' }
                ].map(item => (
                  <div key={item.type} className="flex items-center gap-2 text-sm">
                    <div 
                      className="w-6 h-0.5"
                      style={{ backgroundColor: item.color }}
                    />
                    {item.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {nodes.length === 0 && (
            <div className="text-center py-8" style={{ color: colors.textSecondary }}>
              <Network className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No network topology available</p>
              <p className="text-sm">Provide domain data to see network relationships</p>
            </div>
          )}

          {/* Instructions */}
          <div className="text-xs pt-2 border-t" style={{ color: colors.textSecondary }}>
            <p>Click and drag nodes to reposition them. Click on nodes to view details.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}