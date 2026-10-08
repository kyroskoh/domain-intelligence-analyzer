import tls from 'tls';
import { createHash, X509Certificate } from 'crypto';
import { logger } from '@/utils/logger';
import { SslCertificateData } from '@/types/domain';

const CLOUDFLARE_ORIGIN_RE = /cloudflare\s+origin\s+ca/i;

export class SslService {
  private readonly timeoutMs: number;

  constructor() {
    this.timeoutMs = parseInt(process.env.SSL_TIMEOUT_MS || '10000', 10);
  }

  async probe(domain: string, port = 443): Promise<SslCertificateData | null> {
    const host = domain.replace(/\.$/, '').toLowerCase();
    const start = Date.now();

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: SslCertificateData | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const socket = tls.connect(
        {
          host,
          port,
          servername: host,
          rejectUnauthorized: false,
          timeout: this.timeoutMs,
        },
        () => {
          try {
            const peer = socket.getPeerCertificate(true);
            const handshakeMs = Date.now() - start;
            const protocol = socket.getProtocol() || undefined;
            const cipher = socket.getCipher()?.name;

            if (!peer || !peer.raw) {
              socket.end();
              finish(null);
              return;
            }

            const x509 = new X509Certificate(peer.raw);
            const fingerprintSha256 = createHash('sha256')
              .update(peer.raw)
              .digest('hex');

            const sans = this.extractSans(x509, peer);
            const peerCn = this.asString(peer.subject?.CN);
            const subject = this.asString(x509.subject) || peerCn || host;
            const issuer =
              this.asString(x509.issuer) || this.formatIssuer(peer.issuer) || 'unknown';
            const validFrom = x509.validFrom;
            const validTo = x509.validTo;
            const validToDate = new Date(validTo);
            const daysRemaining = Math.floor(
              (validToDate.getTime() - Date.now()) / (24 * 3600 * 1000)
            );
            const isCloudflareOriginCa = CLOUDFLARE_ORIGIN_RE.test(issuer);

            const cn = peerCn || this.subjectCn(subject) || undefined;
            const hostnameMatch = this.matchesHostname(host, cn, sans);

            socket.end();
            finish({
              subject,
              issuer,
              subjectCn: cn,
              sans,
              sanCount: sans.length,
              fingerprintSha256,
              serial: x509.serialNumber,
              validFrom,
              validTo,
              daysRemaining,
              handshakeMs,
              protocol,
              cipher,
              isCloudflareOriginCa,
              hostnameMatch,
            });
          } catch (error) {
            logger.debug(`SSL parse failed for ${host}:`, error);
            socket.destroy();
            finish(null);
          }
        }
      );

      socket.on('error', (error) => {
        logger.debug(`SSL probe failed for ${host}:`, error);
        finish(null);
      });

      socket.on('timeout', () => {
        socket.destroy();
        finish(null);
      });

      setTimeout(() => {
        if (!settled) {
          socket.destroy();
          finish(null);
        }
      }, this.timeoutMs + 500);
    });
  }

  private extractSans(x509: X509Certificate, peer: tls.PeerCertificate): string[] {
    const names = new Set<string>();
    try {
      const san = x509.subjectAltName;
      if (san) {
        for (const part of san.split(',')) {
          const trimmed = part.trim();
          const dns = trimmed.match(/^DNS:(.+)$/i);
          if (dns?.[1]) names.add(dns[1].toLowerCase().replace(/\.$/, ''));
        }
      }
    } catch {
      /* ignore */
    }
    if (peer.subjectaltname) {
      for (const part of peer.subjectaltname.split(',')) {
        const trimmed = part.trim();
        const dns = trimmed.match(/^DNS:(.+)$/i);
        if (dns?.[1]) names.add(dns[1].toLowerCase().replace(/\.$/, ''));
      }
    }
    return Array.from(names);
  }

  private formatIssuer(issuer: tls.PeerCertificate['issuer']): string {
    if (!issuer) return '';
    return [issuer.O, issuer.CN, issuer.OU].filter(Boolean).join(', ');
  }

  private asString(value: string | string[] | undefined | null): string {
    if (!value) return '';
    return Array.isArray(value) ? value.join(', ') : value;
  }

  private subjectCn(subject: string): string | undefined {
    const m = subject.match(/CN=([^,\n]+)/i);
    return m?.[1]?.trim();
  }

  private matchesHostname(host: string, cn?: string, sans: string[] = []): boolean {
    const candidates = [cn, ...sans].filter(Boolean).map((s) => s!.toLowerCase());
    return candidates.some((name) => {
      if (name === host) return true;
      if (name.startsWith('*.')) {
        const base = name.slice(2);
        return host.endsWith(`.${base}`) || host === base;
      }
      return false;
    });
  }
}

export const sslService = new SslService();
