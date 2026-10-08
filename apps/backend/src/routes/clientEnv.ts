import { Router, Request, Response } from 'express';
import { asnGeoService } from '@/services/asn/AsnGeoService';

const router = Router();

function clientIp(req: Request): string {
  const trusted = (process.env.TRUST_PROXY_HOPS || '1') === '0' ? false : true;
  if (trusted) {
    const xff = req.get('x-forwarded-for');
    if (xff) {
      return xff.split(',')[0].trim();
    }
  }
  return (req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}

router.get('/', async (req: Request, res: Response) => {
  const ip = clientIp(req);
  if (!ip || ip === '127.0.0.1' || ip === '::1') {
    res.json({
      ip: ip || 'unknown',
      note: 'Loopback or unknown client IP — geo skipped',
    });
    return;
  }

  try {
    const intel = await asnGeoService.lookupIp(ip);
    res.json({
      ip: intel.ip,
      asn: intel.asn,
      asOrg: intel.asOrg,
      country: intel.country,
      city: intel.city,
      isp: intel.isp,
      coveringPrefix: intel.coveringPrefix,
      prefixMatch: intel.prefixMatch,
    });
  } catch {
    res.json({ ip, note: 'Geo lookup unavailable' });
  }
});

export default router;
