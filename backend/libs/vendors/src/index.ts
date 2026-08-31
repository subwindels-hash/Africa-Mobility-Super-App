/**
 * Vendor Service (docs/03 §vendor marketplace; 16 vendor types).
 * The platform-wide 11-step verification chain with admin approval before
 * activation, onboarding state machine, and the 4 subscription tiers
 * (Free/Standard/Professional/Enterprise) with limits + commission overrides.
 */
export const VENDOR_TYPES = [
  'taxi_operator', 'chauffeur_service', 'logistics_company', 'dispatch_rider_fleet',
  'interstate_freighter', 'luxury_vehicle_owner', 'vehicle_rental', 'driving_school',
  'aviation_charter', 'hotel', 'tour_operator', 'security_company', 'roadside_assistance',
  'cold_chain_operator', 'warehouse_operator', 'corporate_services_firm',
] as const;
export type VendorType = (typeof VENDOR_TYPES)[number];

/** 11-step platform-wide verification chain (docs/03 §5.4). */
export const VERIFICATION_STEPS = [
  'account_created', 'business_registration_cac', 'tax_id_tin_verified', 'identity_kyc_bvn_nin',
  'address_verification', 'insurance_certificate', 'asset_vehicle_inspection',
  'driver_staff_background_check', 'safety_compliance_audit', 'bank_account_verification',
  'admin_final_approval',       // ← admin approval BEFORE activation
] as const;
export type VerificationStep = (typeof VERIFICATION_STEPS)[number];

export type OnboardingState = 'draft' | 'submitted' | 'under_review' | 'approved' | 'returned' | 'suspended';

export interface VendorProfile {
  vendorId: string;
  type: VendorType;
  name: string;
  state: OnboardingState;
  steps: Record<VerificationStep, 'pending' | 'approved' | 'rejected'>;
  subscription: SubscriptionTier;
  commissionOverridePct?: number;
  createdAt: Date;
}

// ── Subscription tiers (docs/02 §revenue) ──────────────────────────────────

export const SUBSCRIPTION_TIERS = ['free', 'standard', 'professional', 'enterprise'] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export interface TierSpec {
  tier: SubscriptionTier;
  monthlyMinor: number;
  bookingLimitPerMonth: number;     // -1 = unlimited
  fleetLimit: number;
  commissionPct: number;            // platform take-rate
  features: string[];
}

export const TIER_SPECS: Record<SubscriptionTier, TierSpec> = {
  free:          { tier: 'free',          monthlyMinor: 0,          bookingLimitPerMonth: 20,   fleetLimit: 2,   commissionPct: 20, features: ['marketplace listing'] },
  standard:      { tier: 'standard',      monthlyMinor: 1_500_000,  bookingLimitPerMonth: 200,  fleetLimit: 15,  commissionPct: 17, features: ['marketplace listing', 'priority matching', 'analytics'] },
  professional:  { tier: 'professional',  monthlyMinor: 6_000_000,  bookingLimitPerMonth: 1000, fleetLimit: 75,  commissionPct: 14, features: ['marketplace listing', 'priority matching', 'analytics', 'api access', 'dedicated support'] },
  enterprise:    { tier: 'enterprise',    monthlyMinor: 25_000_000, bookingLimitPerMonth: -1,   fleetLimit: 500, commissionPct: 10, features: ['marketplace listing', 'priority matching', 'analytics', 'api access', 'dedicated support', 'sla 99.9%', 'custom integration'] },
};

export class VendorError extends Error { constructor(msg: string) { super(msg); this.name = 'VendorError'; } }

export class VendorService {
  private vendors = new Map<string, VendorProfile>();

  register(vendorId: string, type: VendorType, name: string): VendorProfile {
    if (this.vendors.has(vendorId)) throw new VendorError(`vendor ${vendorId} exists`);
    if (!VENDOR_TYPES.includes(type)) throw new VendorError(`unknown vendor type ${type}`);
    const steps = {} as VendorProfile['steps'];
    for (const s of VERIFICATION_STEPS) steps[s] = 'pending';
    steps.account_created = 'approved';                          // registration itself completes step 1
    const v: VendorProfile = { vendorId, type, name, state: 'draft', steps, subscription: 'free', createdAt: new Date() };
    this.vendors.set(vendorId, v);
    return v;
  }

  submit(vendorId: string): VendorProfile {
    const v = this.get(vendorId);
    v.state = 'submitted';
    return v;
  }

  /** Sequential chain — a step can only be decided when all prior steps passed. */
  decideStep(vendorId: string, step: VerificationStep, decision: 'approved' | 'rejected', by: string): VendorProfile {
    void by;
    const v = this.get(vendorId);
    const idx = VERIFICATION_STEPS.indexOf(step);
    for (const prior of VERIFICATION_STEPS.slice(0, idx)) {
      if (v.steps[prior] !== 'approved') throw new VendorError(`step ${step} blocked — ${prior} not approved`);
    }
    v.steps[step] = decision;
    if (decision === 'rejected') { v.state = 'returned'; return v; }
    if (step === 'admin_final_approval') v.state = 'approved';   // activation ONLY after admin approval
    else if (v.state === 'submitted') v.state = 'under_review';
    return v;
  }

  /** Marketplace visibility — full chain + approved state only. */
  isActivatable(vendorId: string): boolean {
    const v = this.vendors.get(vendorId);
    return !!v && v.state === 'approved' && VERIFICATION_STEPS.every((s) => v.steps[s] === 'approved');
  }

  activate(vendorId: string): VendorProfile {
    if (!this.isActivatable(vendorId)) throw new VendorError('vendor cannot activate — verification incomplete or admin approval missing');
    const v = this.get(vendorId);
    if (v.state !== 'approved') throw new VendorError('not approved');
    return v;   // approved = active on marketplace
  }

  suspend(vendorId: string): VendorProfile { const v = this.get(vendorId); v.state = 'suspended'; return v; }

  /** Subscription change with proration note; commission follows tier unless overridden. */
  setSubscription(vendorId: string, tier: SubscriptionTier, commissionOverridePct?: number): VendorProfile {
    const v = this.get(vendorId);
    v.subscription = tier;
    v.commissionOverridePct = commissionOverridePct;
    return v;
  }

  /** Booking allowance under the current tier. */
  canAcceptBooking(vendorId: string, bookingsThisMonth: number): { allowed: boolean; reason?: string } {
    const v = this.get(vendorId);
    if (v.state === 'suspended') return { allowed: false, reason: 'vendor suspended' };
    const spec = TIER_SPECS[v.subscription];
    if (spec.bookingLimitPerMonth !== -1 && bookingsThisMonth >= spec.bookingLimitPerMonth) {
      return { allowed: false, reason: `${v.subscription} tier limit ${spec.bookingLimitPerMonth}/month reached — upgrade` };
    }
    return { allowed: true };
  }

  commissionFor(vendorId: string): number {
    const v = this.get(vendorId);
    return v.commissionOverridePct ?? TIER_SPECS[v.subscription].commissionPct;
  }

  get(vendorId: string): VendorProfile {
    const v = this.vendors.get(vendorId);
    if (!v) throw new VendorError(`unknown vendor ${vendorId}`);
    return v;
  }

  list(filter?: { type?: VendorType; state?: OnboardingState }): VendorProfile[] {
    return [...this.vendors.values()].filter((v) => !filter?.type || v.type === filter.type).filter((v) => !filter?.state || v.state === filter.state);
  }

  static get tierSpecs() { return TIER_SPECS; }
}
