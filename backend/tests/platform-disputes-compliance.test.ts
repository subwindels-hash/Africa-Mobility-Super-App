import { describe, expect, it } from 'vitest';
import { DisputeService, SLA_HOURS } from '../libs/disputes/src/index';
import { KycService, idNumberValid, screen, PrivacyService, PciTracker, PCI_REQUIREMENTS } from '../libs/compliance/src/index';

describe('disputes — arbitration lifecycle & chargebacks', () => {
  function opened(ps = new DisputeService()) {
    return ps.open({ subject: 'shipment', subjectRef: 'shp_1', reason: 'damaged_goods', openedBy: 'cus_1', againstVendor: 'vnd_1', amountInPlayMinor: 8_000_000, evidence: [{ by: 'cus_1', kind: 'photo', ref: 'img_1' }] });
  }

  it('flows open → acknowledged → under_review → resolved with escrow execution', () => {
    const movements: string[] = [];
    const ds = new DisputeService({
      refundCustomer: (ref, amt) => movements.push(`refund:${ref}:${amt}`),
      releaseVendor: (ref, amt) => movements.push(`release:${ref}:${amt}`),
    });
    const c = ds.open({ subject: 'booking', subjectRef: 'bkg_9', reason: 'late_delivery', openedBy: 'cus_2', againstVendor: 'vnd_2', amountInPlayMinor: 5_000_000 });
    ds.acknowledge(c.id, 'officer_1');
    ds.review(c.id);
    ds.resolve(c.id, { type: 'split', customerMinor: 2_000_000, vendorMinor: 3_000_000 }, 'officer_1');
    expect(ds.get(c.id).state).toBe('resolved');
    expect(movements).toEqual(['refund:bkg_9:2000000', 'release:bkg_9:3000000']);
  });

  it('resolutions cannot exceed the amount in play', () => {
    const ds = new DisputeService();
    const c = opened(ds);
    ds.acknowledge(c.id, 'o'); ds.review(c.id);
    expect(() => ds.resolve(c.id, { type: 'refund_customer', amountMinor: 9_000_000 }, 'o')).toThrow(/exceeds/);
  });

  it('state machine refuses skips (resolve before review)', () => {
    const ds = new DisputeService();
    const c = opened(ds);
    expect(() => ds.resolve(c.id, { type: 'release_vendor' }, 'o')).toThrow(/cannot resolve from open/);
  });

  it('evidence accumulates and appeals reopen resolved cases', () => {
    const ds = new DisputeService();
    const c = opened(ds);
    ds.acknowledge(c.id, 'o'); ds.review(c.id);
    ds.resolve(c.id, { type: 'reject' }, 'o');
    expect(() => ds.appeal(c.id, 'vnd_1', 'vendor disagrees')).not.toThrow();
    expect(ds.get(c.id).state).toBe('escalated');
    expect(() => ds.appeal(c.id, 'vnd_1', 'again')).toThrow(/already filed/);
  });

  it('SLA breach detection and PSP chargebacks escalate with fee', () => {
    const ds = new DisputeService();
    const c = opened(ds);
    expect(ds.slaBreached(c.id, new Date(Date.now() + (SLA_HOURS.resolve + 1) * 3600_000))).toBe(true);
    ds.chargeback(c.id, 'paystack', 150_000);
    expect(ds.get(c.id).chargeback).toMatchObject({ psp: 'paystack', feeMinor: 150_000 });
    expect(ds.get(c.id).state).toBe('escalated');
  });
});

describe('compliance — KYC, AML, GDPR/NDPR, PCI DSS', () => {
  it('BVN/NIN checksum gates the KYC flow; steps are sequential', () => {
    expect(idNumberValid('12345678901')).toBe(false);
    const validBvn = '12345670000';                 // digits sum 28 → ÷7 exact
    const validNin = '12345670000';
    expect(idNumberValid(validBvn)).toBe(true);
    const ks = new KycService();
    const c = ks.initiate('usr_1', validBvn, validNin);
    expect(c.state).toBe('identity_verified');
    ks.verifyAddress(c.id, '12 Marina Rd, Lagos');
    ks.liveness(c.id, true);
    expect(ks.approve(c.id).state).toBe('approved');
    const rejected = new KycService().initiate('usr_2', '11111111111', validNin);
    expect(rejected.state).toBe('rejected');
  });

  it('AML screening flags sanctions/PEP hits and velocity for SAR', () => {
    const clean = screen('chidi okafor', 5, 0);
    expect(clean.hit).toBe(false);
    expect(clean.sar).toBe(false);
    const pep = screen('governor adebayo', 3, 0);
    expect(pep.lists).toContain('pep');
    const smurf = screen('normal person', 80, 200_000_000);
    expect(smurf.riskScore).toBeGreaterThanOrEqual(60);
    expect(smurf.sar).toBe(true);                   // suspicious activity report
  });

  it('GDPR/NDPR: access exports a manifest; erasure honors retention exceptions', () => {
    const p = new PrivacyService();
    const sar = p.request('usr_9', 'access');
    p.verify(sar.id);
    p.fulfill(sar.id, ['wallet.transactions', 'chat.messages', 'identity.kyc']);
    expect(p.listRequests('usr_9')[0].fulfillment!.exportManifest).toHaveLength(3);
    const erase = p.request('usr_9', 'erasure');
    p.verify(erase.id);
    p.fulfill(erase.id, ['wallet.transactions', 'chat.messages', 'identity.kyc', 'disputes.cases', 'ledger.transactions']);
    const f = p.listRequests('usr_9').find((r) => r.type === 'erasure')!.fulfillment!;
    expect(f.erased).toEqual(['chat.messages']);
    expect(f.retained!.map((r) => r.system)).toEqual(expect.arrayContaining(['ledger.transactions', 'identity.kyc', 'disputes.cases']));
    expect(f.retained!.every((r) => r.legalBasis.length > 0)).toBe(true);
  });

  it('PCI DSS tracker covers the 12 requirements and reports readiness', () => {
    const pci = new PciTracker();
    expect(PCI_REQUIREMENTS).toHaveLength(12);
    expect(pci.readiness().readyPct).toBe(0);
    for (const r of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']) pci.setStatus(r, 'compliant', 'evidence.pdf');
    expect(pci.readiness()).toMatchObject({ compliant: 12, readyPct: 100, gaps: [] });
  });
});
