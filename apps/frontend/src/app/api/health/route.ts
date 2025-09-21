import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check if the API backend is reachable
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    let backendStatus = 'unknown';
    
    try {
      const response = await fetch(`${apiUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add a timeout to prevent hanging
        signal: AbortSignal.timeout(5000),
      });
      
      backendStatus = response.ok ? 'healthy' : 'unhealthy';
    } catch (error) {
      backendStatus = 'unreachable';
    }

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'domain-intelligence-analyzer-frontend',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      backend: {
        status: backendStatus,
        url: apiUrl,
      },
      uptime: process.uptime(),
      memory: {
        used: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,
        total: Math.round((process.memoryUsage().heapTotal / 1024 / 1024) * 100) / 100,
      },
    }, { status: 200 });
    
  } catch (error) {
    console.error('Health check failed:', error);
    
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'domain-intelligence-analyzer-frontend',
      error: 'Health check failed',
      environment: process.env.NODE_ENV || 'development',
    }, { status: 500 });
  }
}

export async function HEAD() {
  // Support HEAD requests for simple health checks
  return new NextResponse(null, { status: 200 });
}