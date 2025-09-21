// @ts-ignore - No types available for whois module
import * as whois from 'whois';
import { promisify } from 'util';
import { logger } from '@/utils/logger';
import { TimeoutError } from '@/middleware/errorHandler';
import { WhoisData, ContactInfo } from '@/types/domain';

const whoisLookup = promisify(whois.lookup);

export class WhoisService {
  private readonly timeout: number;

  constructor() {
    this.timeout = parseInt(process.env.WHOIS_TIMEOUT_MS || '5000');
  }

  /**
   * Performs WHOIS lookup for a domain
   */
  async lookup(domain: string): Promise<WhoisData> {
    const startTime = Date.now();
    
    try {
      logger.info(`Starting WHOIS lookup for domain: ${domain}`);
      
      // Perform WHOIS lookup with timeout
      const rawWhois = await this.performLookupWithTimeout(domain);
      
      // Parse the raw WHOIS data
      const parsedData = this.parseWhoisData(rawWhois, domain);
      
      const duration = Date.now() - startTime;
      logger.info(`WHOIS lookup completed for ${domain} in ${duration}ms`);
      
      return parsedData;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`WHOIS lookup failed for ${domain} after ${duration}ms:`, error);
      throw error;
    }
  }

  /**
   * Performs WHOIS lookup with timeout
   */
  private async performLookupWithTimeout(domain: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new TimeoutError('WHOIS lookup'));
      }, this.timeout);

      whoisLookup(domain, { timeout: this.timeout })
        .then((result: string) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error: Error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Parses raw WHOIS data into structured format
   */
  private parseWhoisData(rawData: string, domain: string): WhoisData {
    const lines = rawData.split('\n').map(line => line.trim());
    
    const whoisData: WhoisData = {
      domain,
      nameservers: [],
      status: [],
      raw: rawData,
    };

    // Parse basic information
    for (const line of lines) {
      if (!line || line.startsWith('%') || line.startsWith('>>>')) continue;

      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();
      
      if (!key || !value) continue;

      const normalizedKey = key.toLowerCase().trim();

      // Parse registrar information
      if (normalizedKey.includes('registrar') && !whoisData.registrar) {
        whoisData.registrar = {
          name: value,
        };
      } else if (normalizedKey.includes('registrar url') && whoisData.registrar) {
        whoisData.registrar.url = value;
      } else if (normalizedKey.includes('abuse') && normalizedKey.includes('email') && whoisData.registrar) {
        whoisData.registrar.abuseContactEmail = value;
      } else if (normalizedKey.includes('abuse') && normalizedKey.includes('phone') && whoisData.registrar) {
        whoisData.registrar.abuseContactPhone = value;
      }

      // Parse nameservers
      else if (normalizedKey.includes('name server') || normalizedKey === 'nserver') {
        if (!whoisData.nameservers.includes(value.toLowerCase())) {
          whoisData.nameservers.push(value.toLowerCase());
        }
      }

      // Parse status
      else if (normalizedKey.includes('status')) {
        const statusValue = value.split(' ')[0]; // Take first word before any explanation
        if (!whoisData.status.includes(statusValue)) {
          whoisData.status.push(statusValue);
        }
      }

      // Parse dates
      else if (normalizedKey.includes('creation') || normalizedKey.includes('created')) {
        whoisData.createdDate = this.parseDate(value);
      } else if (normalizedKey.includes('updated') || normalizedKey.includes('modified')) {
        whoisData.updatedDate = this.parseDate(value);
      } else if (normalizedKey.includes('expir') || normalizedKey.includes('registry expiry')) {
        whoisData.expirationDate = this.parseDate(value);
      }

      // Parse lock status
      else if (normalizedKey.includes('lock')) {
        whoisData.registrarLockStatus = value.toLowerCase().includes('lock');
      }
    }

    // Parse contact information (simplified)
    whoisData.registrant = this.parseContactInfo(rawData, 'registrant');
    whoisData.administrative = this.parseContactInfo(rawData, 'admin');
    whoisData.technical = this.parseContactInfo(rawData, 'tech');
    whoisData.billing = this.parseContactInfo(rawData, 'billing');

    return whoisData;
  }

  /**
   * Parses contact information from raw WHOIS data
   */
  private parseContactInfo(rawData: string, contactType: string): ContactInfo | undefined {
    const lines = rawData.split('\n');
    const contact: ContactInfo = {};
    let foundContact = false;

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();
      
      if (trimmed.includes(contactType)) {
        foundContact = true;
        continue;
      }

      if (!foundContact) continue;

      // Stop parsing if we hit another contact section
      if (trimmed.includes('registrant') || trimmed.includes('admin') || 
          trimmed.includes('tech') || trimmed.includes('billing')) {
        if (!trimmed.includes(contactType)) break;
      }

      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();
      
      if (!key || !value) continue;

      const normalizedKey = key.toLowerCase().trim();

      if (normalizedKey.includes('name') && !normalizedKey.includes('org')) {
        contact.name = value;
      } else if (normalizedKey.includes('org')) {
        contact.organization = value;
      } else if (normalizedKey.includes('email')) {
        contact.email = value;
      } else if (normalizedKey.includes('phone')) {
        contact.phone = value;
      } else if (normalizedKey.includes('fax')) {
        contact.fax = value;
      } else if (normalizedKey.includes('address') || normalizedKey.includes('street')) {
        contact.address = contact.address ? `${contact.address}, ${value}` : value;
      } else if (normalizedKey.includes('city')) {
        contact.city = value;
      } else if (normalizedKey.includes('state') || normalizedKey.includes('province')) {
        contact.state = value;
      } else if (normalizedKey.includes('postal') || normalizedKey.includes('zip')) {
        contact.postalCode = value;
      } else if (normalizedKey.includes('country')) {
        contact.country = value;
      }
    }

    // Return contact info only if we found at least one field
    return Object.keys(contact).length > 0 ? contact : undefined;
  }

  /**
   * Parses date string into Date object
   */
  private parseDate(dateString: string): Date | undefined {
    if (!dateString) return undefined;

    // Common date formats in WHOIS
    const dateFormats = [
      /(\d{4}-\d{2}-\d{2})/,           // YYYY-MM-DD
      /(\d{2}-\d{2}-\d{4})/,           // MM-DD-YYYY
      /(\d{2}\/\d{2}\/\d{4})/,         // MM/DD/YYYY
      /(\d{4}\.\d{2}\.\d{2})/,         // YYYY.MM.DD
      /(\d{2}\.\d{2}\.\d{4})/,         // DD.MM.YYYY
    ];

    for (const format of dateFormats) {
      const match = dateString.match(format);
      if (match) {
        const parsed = new Date(match[1]);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }

    // Try parsing as-is
    const parsed = new Date(dateString);
    return !isNaN(parsed.getTime()) ? parsed : undefined;
  }

  /**
   * Validates if a domain is available for WHOIS lookup
   */
  isDomainValid(domain: string): boolean {
    // Basic domain validation
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(domain) && domain.length <= 253;
  }
}