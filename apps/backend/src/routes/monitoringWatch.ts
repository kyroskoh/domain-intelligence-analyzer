import { Router, Request, Response } from 'express';
import { webhookDispatcher } from '@/services/webhooks/WebhookDispatcher';

const router = Router();

router.post('/watch', async (req: Request, res: Response) => {
  const type = String(req.body?.type || '').toLowerCase();
  const id = String(req.body?.id || '').trim();
  const webhookUrl = req.body?.webhookUrl as string | undefined;
  const allowed = new Set(['domain', 'ns', 'registrar', 'cert', 'asn']);
  if (!allowed.has(type) || !id) {
    res.status(400).json({ error: 'type and id required' });
    return;
  }
  await webhookDispatcher.addWatch(
    type as 'domain' | 'ns' | 'registrar' | 'cert' | 'asn',
    id,
    webhookUrl
  );
  res.json({ ok: true, type, id });
});

export default router;
