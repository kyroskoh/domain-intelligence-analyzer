import { WhoisData, DnsData, RdapData } from './api';

/**
 * Transform WHOIS data from backend to frontend format
 */
export function transformWhoisData(data: any): WhoisData {
  if (!data) return data;

  return {
    ...data,
    domainName: data.domainName || data.domain,
    creationDate: data.creationDate || data.createdDate,
    expiryDate: data.expiryDate || data.expirationDate,
    rawData: data.rawData || data.raw,
  };
}

/**
 * Transform DNS data from backend to frontend format
 */
export function transformDnsData(data: any): DnsData {
  if (!data) return data;

  const transformed = { ...data };

  // Convert structured records to simple arrays for component compatibility
  if (data.records) {
    transformed.a = data.records.A?.map((r: any) => r.address) || [];
    transformed.aaaa = data.records.AAAA?.map((r: any) => r.address) || [];
    transformed.cname = data.records.CNAME?.map((r: any) => r.cname) || [];
    transformed.mx = data.records.MX?.map((r: any) => `${r.priority} ${r.exchange}`) || [];
    transformed.ns = data.records.NS?.map((r: any) => r.nsdname) || [];
    transformed.txt = data.records.TXT?.map((r: any) => r.data.join(' ')) || [];
    transformed.soa = data.records.SOA?.map((r: any) => 
      `${r.mname} ${r.rname} ${r.serial} ${r.refresh} ${r.retry} ${r.expire} ${r.minimum}`
    ) || [];
    transformed.srv = data.records.SRV?.map((r: any) => 
      `${r.priority} ${r.weight} ${r.port} ${r.target}`
    ) || [];
    transformed.ptr = data.records.PTR?.map((r: any) => r.ptrdname) || [];
  }

  // Alias nameserver health
  transformed.nameserverHealth = transformed.nameservers;

  return transformed;
}

/**
 * Transform RDAP data from backend to frontend format
 */
export function transformRdapData(data: any): RdapData {
  if (!data) return data;

  return {
    ...data,
    ldhName: data.ldhName || data.domain,
    rdapConformance: data.rdapConformance || ['rdap_level_0'],
  };
}

/**
 * Transform complete domain analysis response
 */
export function transformDomainAnalysisResponse(response: any) {
  if (!response) return response;

  return {
    ...response,
    whois: transformWhoisData(response.whois),
    dns: transformDnsData(response.dns),
    rdap: transformRdapData(response.rdap),
  };
}