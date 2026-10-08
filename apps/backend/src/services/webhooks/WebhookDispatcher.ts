import axios from 'axios';
import { createHmac } from 'crypto';
import { logger } from '@/utils/logger';
import { connectRedis, getRedisClient } from '@/services/cache/redisClient';

export type WebhookEvent = {
  type: string;
  entityType?: string;
  entityId?: string;
  domain?: string;
  payload: Record<string, unknown>;
  at: string;
};

const WATCH_KEY = (type: string, id: string) =>
  `watch:${type}:${id.toLowerCase()}`;

/**
 * Minimal entity watchlist + signed outbound webhooks.
 */
export class WebhookDispatcher {
  async addWatch(
    type: 'domain' | 'ns' | 'registrar' | 'cert' | 'asn',
    id: string,
    webhookUrl?: string
  ): Promise<void> {
    const client = getRedisClient() ?? (await connectRedis());
    if (!client?.isOpen) return;
    await client.sAdd(WATCH_KEY(type, id), webhookUrl || 'in-app');
    await client.expire(WATCH_KEY(type, id), 30 * 24 * 3600);
  }

  async listWatches(type: string, id: string): Promise<string[]> {
    const client = getRedisClient() ?? (await connectRedis());
    if (!client?.isOpen) return [];
    return client.sMembers(WATCH_KEY(type, id));
  }

  async notify(event: WebhookEvent): Promise<void> {
    const urls = new Set<string>();
    if (event.domain) {
      for (const u of await this.listWatches('domain', event.domain)) urls.add(u);
    }
    if (event.entityType && event.entityId) {
      for (const u of await this.listWatches(event.entityType, event.entityId)) {
        urls.add(u);
      }
    }

    const globalUrl = process.env.WEBHOOK_URL;
    if (globalUrl) urls.add(globalUrl);

    const secret = process.env.WEBHOOK_SECRET || '';
    const body = JSON.stringify(event);

    for (const url of urls) {
      if (!url || url === 'in-app') continue;
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'DomainPeek-Webhook/1.0',
        };
        if (secret) {
          headers['X-DomainPeek-Signature'] = createHmac('sha256', secret)
            .update(body)
            .digest('hex');
        }
        await axios.post(url, event, { timeout: 8000, headers });
      } catch (error) {
        logger.warn(`Webhook delivery failed to ${url}:`, error);
      }
    }
  }
}

export const webhookDispatcher = new WebhookDispatcher();
