'use client';

import React from 'react';
import { Shield, AlertTriangle, CheckCircle, XCircle, Info, TrendingUp, Lock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

// Type for security analysis data (to be defined in API types)
interface SecurityAnalysis {
  overallScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  checks: {
    ssl?: { passed: boolean; score: number; details: string };
    dnssec?: { passed: boolean; score: number; details: string };
    reputation?: { passed: boolean; score: number; details: string };
    malware?: { passed: boolean; score: number; details: string };
    phishing?: { passed: boolean; score: number; details: string };
    blacklist?: { passed: boolean; score: number; details: string };
  };
  recommendations: string[];
  lastChecked: string;
}

interface SecurityPanelProps {
  data?: SecurityAnalysis;
  isLoading: boolean;
  compact?: boolean;
  className?: string;
}

export default function SecurityPanel({ data, isLoading, compact = false, className }: SecurityPanelProps) {
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <CardTitle className="text-lg">Security Analysis</CardTitle>
          </div>
          <CardDescription>Domain security assessment and recommendations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <div className="space-y-2">
              {Array.from({ length: compact ? 3 : 5 }).map((_, i) => (
                <div key={i} className="flex justify-between items-center">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <CardTitle className="text-lg">Security Analysis</CardTitle>
          </div>
          <CardDescription>Domain security assessment and recommendations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-2" />
            <p>Security analysis not available</p>
            <p className="text-xs mt-1">Run a full analysis to get security insights</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getRiskLevelColor = (level: string) => {
    const colors = {
      low: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
      medium: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
      high: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
      critical: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
    };
    return colors[level as keyof typeof colors] || colors.medium;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const renderSecurityCheck = (name: string, check: any) => {
    if (!check) return null;

    const Icon = check.passed ? CheckCircle : XCircle;
    const iconColor = check.passed ? 'text-green-500' : 'text-red-500';

    return (
      <div className="flex items-center justify-between p-3 border rounded-lg">
        <div className="flex items-center space-x-3">
          <Icon className={cn("h-5 w-5", iconColor)} />
          <div>
            <div className="font-medium capitalize">{name.replace(/([A-Z])/g, ' $1')}</div>
            {!compact && check.details && (
              <div className="text-xs text-muted-foreground">{check.details}</div>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className={cn("font-bold", getScoreColor(check.score))}>
            {check.score}/100
          </div>
          {!compact && (
            <Badge variant={check.passed ? "default" : "destructive"} className="text-xs">
              {check.passed ? "Pass" : "Fail"}
            </Badge>
          )}
        </div>
      </div>
    );
  };

  const riskColors = getRiskLevelColor(data.riskLevel);
  const checksArray = Object.entries(data.checks).filter(([_, check]) => check);
  const passedChecks = checksArray.filter(([_, check]) => check.passed).length;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <CardTitle className={cn("text-lg", compact && "text-base")}>
              Security Analysis
            </CardTitle>
          </div>
          <Badge 
            variant="outline" 
            className={cn(riskColors.bg, riskColors.text, riskColors.border)}
          >
            {data.riskLevel.toUpperCase()} RISK
          </Badge>
        </div>
        <CardDescription>Domain security assessment and recommendations</CardDescription>
      </CardHeader>
      <CardContent className={cn("space-y-4", compact && "space-y-3")}>
        {/* Overall Score */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Overall Security Score</span>
            <span className={cn("text-2xl font-bold", getScoreColor(data.overallScore))}>
              {data.overallScore}/100
            </span>
          </div>
          <div className="relative">
            <Progress value={data.overallScore} className="h-2" />
            <div 
              className={cn(
                "absolute inset-0 h-2 rounded-full transition-all",
                getProgressColor(data.overallScore)
              )}
              style={{ width: `${data.overallScore}%` }}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {passedChecks} of {checksArray.length} security checks passed
          </div>
        </div>

        {/* Security Checks */}
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Security Checks</h4>
          <div className="space-y-2">
            {compact 
              ? checksArray.slice(0, 3).map(([name, check]) => renderSecurityCheck(name, check))
              : checksArray.map(([name, check]) => renderSecurityCheck(name, check))
            }
          </div>
          {compact && checksArray.length > 3 && (
            <p className="text-xs text-muted-foreground">
              +{checksArray.length - 3} more security checks
            </p>
          )}
        </div>

        {/* Recommendations */}
        {data.recommendations && data.recommendations.length > 0 && !compact && (
          <div className="space-y-2">
            <h4 className="font-semibold text-sm flex items-center space-x-2">
              <TrendingUp className="h-4 w-4" />
              <span>Recommendations</span>
            </h4>
            <div className="space-y-2">
              {data.recommendations.slice(0, 3).map((recommendation, index) => (
                <Alert key={index} className="py-2">
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    {recommendation}
                  </AlertDescription>
                </Alert>
              ))}
              {data.recommendations.length > 3 && (
                <p className="text-xs text-muted-foreground">
                  +{data.recommendations.length - 3} more recommendations
                </p>
              )}
            </div>
          </div>
        )}

        {/* Last Checked */}
        {data.lastChecked && (
          <div className="text-xs text-muted-foreground border-t pt-3">
            Last security scan: {new Date(data.lastChecked).toLocaleString()}
          </div>
        )}

        {/* Compact Mode Recommendations */}
        {compact && data.recommendations && data.recommendations.length > 0 && (
          <div className="space-y-2">
            <Alert className="py-2">
              <Info className="h-4 w-4" />
              <AlertDescription className="text-sm">
                {data.recommendations[0]}
              </AlertDescription>
            </Alert>
            {data.recommendations.length > 1 && (
              <p className="text-xs text-muted-foreground">
                +{data.recommendations.length - 1} more recommendations
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}