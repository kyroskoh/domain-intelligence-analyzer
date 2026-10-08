'use client';

import React from 'react';
import { Globe2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, DateDisplayTimezone, getTimezoneLabel } from '@/lib/utils';

interface DateTimezoneToggleProps {
  value: DateDisplayTimezone;
  onChange: (value: DateDisplayTimezone) => void;
  className?: string;
}

export function DateTimezoneToggle({ value, onChange, className }: DateTimezoneToggleProps) {
  const localLabel = getTimezoneLabel('local');

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 text-xs text-muted-foreground',
        className
      )}
    >
      <Globe2 className="h-3.5 w-3.5 shrink-0" />
      <span>
        Dates shown as <span className="font-medium text-foreground">DD/MMM/YYYY</span>
        {' '}in{' '}
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 align-middle">
          {getTimezoneLabel(value)}
        </Badge>
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant={value === 'utc' ? 'default' : 'outline'}
          className="h-7 px-2 text-xs"
          onClick={() => onChange('utc')}
        >
          UTC
        </Button>
        <Button
          type="button"
          size="sm"
          variant={value === 'local' ? 'default' : 'outline'}
          className="h-7 px-2 text-xs"
          onClick={() => onChange('local')}
          title={`Use your local timezone (${localLabel})`}
        >
          Local ({localLabel})
        </Button>
      </div>
    </div>
  );
}

export default DateTimezoneToggle;
