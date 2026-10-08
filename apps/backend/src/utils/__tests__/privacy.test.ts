import { redactText, redactEntity } from '../privacy';

describe('privacy helpers', () => {
  it('redacts emails and phones in text', () => {
    expect(redactText('reach me at a@b.co or +1 555-123-4567')).toBe(
      'reach me at [redacted] or [redacted]'
    );
  });

  it('redacts entity contact fields', () => {
    const redacted = redactEntity({
      handle: 'H1',
      roles: ['registrant'],
      email: 'a@b.co',
      tel: '+15551212',
      addr: '1 Main St',
      org: 'Acme',
      fn: 'Jane',
    });
    expect(redacted.email).toBe('[redacted]');
    expect(redacted.tel).toBe('[redacted]');
    expect(redacted.addr).toBe('[redacted]');
    expect(redacted.org).toBe('Acme');
  });
});
