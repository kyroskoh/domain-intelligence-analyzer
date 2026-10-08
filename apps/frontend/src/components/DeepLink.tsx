'use client';

import React from 'react';

type DeepLinkProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
  /**
   * Keep navigation in the current tab (home/back chrome only).
   * Entity, analyze, and share deep links default to a new tab so the
   * current analysis view is preserved.
   */
  sameTab?: boolean;
};

/**
 * In-app or external deep link that opens in a new browser tab by default
 * so the current analysis dashboard stays mounted.
 */
export function DeepLink({
  href,
  children,
  className,
  title,
  sameTab = false,
}: DeepLinkProps) {
  const isMailto = href.startsWith('mailto:');
  const isTel = href.startsWith('tel:');
  const openInNewTab = !sameTab && !isMailto && !isTel;

  return (
    <a
      href={href}
      className={className}
      title={title}
      {...(openInNewTab
        ? { target: '_blank', rel: 'noopener noreferrer' }
        : {})}
    >
      {children}
    </a>
  );
}
