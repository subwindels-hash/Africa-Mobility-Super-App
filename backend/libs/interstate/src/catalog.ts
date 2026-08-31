/**
 * Interstate Logistics catalog (docs/32 §services/§vehicles/§vendors).
 *
 * The platform does NOT own trucks — every transportation service is provided
 * by verified third-party logistics partners (see VENDOR_TYPES + the 7-step
 * verification chain). This file is pure data + pure functions so FAMS can
 * gate every slice (cargo category / vehicle type / route / vendor).
 */

// ── § Interstate Logistics Services (21) ────────────────────────────────────

export type InterstateService =
  | 'ftl'                        // Full Truck Load
  | 'ltl'                        // Less Than Truck Load
  | 'shared_cargo'               // Shared Cargo
  | 'bulk_cargo'                 // Bulk Cargo Transportation
  | 'container'                  // Container Transportation
  | 'cold_chain'                 // Refrigerated (Cold Chain) Logistics
  | 'heavy_equipment'            // Heavy Equipment Transportation
  | 'construction_material'      // Construction Material Transportation
  | 'agricultural_produce'       // Agricultural Produce Transportation
  | 'fmcg'                       // FMCG Distribution
  | 'manufacturing'              // Manufacturing Logistics
  | 'warehouse_to_warehouse'     // Warehouse-to-Warehouse Transport
  | 'b2b'                        // Business-to-Business Logistics
  | 'b2c'                        // Business-to-Customer Logistics
  | 'government'                 // Government Logistics
  | 'ngo_humanitarian'           // NGO & Humanitarian Logistics
  | 'medical_pharma'             // Medical & Pharmaceutical Logistics
  | 'ecommerce_line_haul'        // E-commerce Line Haul
  | 'livestock'                  // Livestock Transportation (where legally permitted)
  | 'vehicle_transport'          // Vehicle Transportation
  | 'machinery';                 // Machinery Transportation

export interface ServiceSpec {
  code: InterstateService;
  label: string;
  /** Cargo categories that must be FAMS-enabled for this service to book. */
  cargoCategories: string[];
  /** Cargo traits used by matching/pricing/security. */
  requiresReefer?: boolean;
  requiresSpecialPermit?: boolean;   // livestock/heavy haul legal gating
  typicalMode: 'ftl' | 'ltl' | 'both';
  riskClass: 'standard' | 'high_value' | 'regulated' | 'permitted';
}

export const SERVICES: ServiceSpec[] = [
  { code: 'ftl', label: 'Full Truck Load (FTL)', cargoCategories: ['general'], typicalMode: 'ftl', riskClass: 'standard' },
  { code: 'ltl', label: 'Less Than Truck Load (LTL)', cargoCategories: ['general'], typicalMode: 'ltl', riskClass: 'standard' },
  { code: 'shared_cargo', label: 'Shared Cargo', cargoCategories: ['general'], typicalMode: 'ltl', riskClass: 'standard' },
  { code: 'bulk_cargo', label: 'Bulk Cargo Transportation', cargoCategories: ['bulk'], typicalMode: 'ftl', riskClass: 'standard' },
  { code: 'container', label: 'Container Transportation', cargoCategories: ['container'], typicalMode: 'ftl', riskClass: 'standard' },
  { code: 'cold_chain', label: 'Refrigerated (Cold Chain) Logistics', cargoCategories: ['cold_chain'], requiresReefer: true, typicalMode: 'both', riskClass: 'regulated' },
  { code: 'heavy_equipment', label: 'Heavy Equipment Transportation', cargoCategories: ['heavy'], requiresSpecialPermit: true, typicalMode: 'ftl', riskClass: 'permitted' },
  { code: 'construction_material', label: 'Construction Material Transportation', cargoCategories: ['construction'], typicalMode: 'ftl', riskClass: 'standard' },
  { code: 'agricultural_produce', label: 'Agricultural Produce Transportation', cargoCategories: ['agricultural'], typicalMode: 'both', riskClass: 'standard' },
  { code: 'fmcg', label: 'FMCG Distribution', cargoCategories: ['fmcg'], typicalMode: 'both', riskClass: 'standard' },
  { code: 'manufacturing', label: 'Manufacturing Logistics', cargoCategories: ['industrial'], typicalMode: 'both', riskClass: 'standard' },
  { code: 'warehouse_to_warehouse', label: 'Warehouse-to-Warehouse Transport', cargoCategories: ['general', 'palletized'], typicalMode: 'both', riskClass: 'standard' },
  { code: 'b2b', label: 'Business-to-Business (B2B) Logistics', cargoCategories: ['general', 'palletized'], typicalMode: 'both', riskClass: 'standard' },
  { code: 'b2c', label: 'Business-to-Customer (B2C) Logistics', cargoCategories: ['general'], typicalMode: 'ltl', riskClass: 'standard' },
  { code: 'government', label: 'Government Logistics', cargoCategories: ['general', 'official'], typicalMode: 'both', riskClass: 'high_value' },
  { code: 'ngo_humanitarian', label: 'NGO & Humanitarian Logistics', cargoCategories: ['humanitarian'], typicalMode: 'both', riskClass: 'regulated' },
  { code: 'medical_pharma', label: 'Medical & Pharmaceutical Logistics', cargoCategories: ['pharma'], requiresReefer: true, typicalMode: 'both', riskClass: 'regulated' },
  { code: 'ecommerce_line_haul', label: 'E-commerce Line Haul Services', cargoCategories: ['general', 'palletized'], typicalMode: 'ftl', riskClass: 'standard' },
  { code: 'livestock', label: 'Livestock Transportation', cargoCategories: ['livestock'], requiresSpecialPermit: true, typicalMode: 'ftl', riskClass: 'permitted' },
  { code: 'vehicle_transport', label: 'Vehicle Transportation', cargoCategories: ['vehicles'], typicalMode: 'ftl', riskClass: 'standard' },
  { code: 'machinery', label: 'Machinery Transportation', cargoCategories: ['heavy', 'machinery'], requiresSpecialPermit: true, typicalMode: 'ftl', riskClass: 'permitted' },
];

// ── § Vehicle Categories (14) ───────────────────────────────────────────────

export type FreightVehicleCategory =
  | 'mini_van' | 'cargo_van' | 'pickup_truck' | 'light_truck' | 'medium_truck'
  | 'heavy_truck' | 'flatbed_truck' | 'box_truck' | 'refrigerated_truck' | 'tanker'
  | 'low_loader' | 'container_truck' | 'articulated_trailer' | 'specialized_heavy_haul';

export interface FreightVehicleSpec {
  category: FreightVehicleCategory;
  label: string;
  /** Max payload in kg. */
  capacityKg: number;
  /** Cargo box L×W×H in metres (0 for flatbed/open deck). */
  dimensionsM: { l: number; w: number; h: number };
  cargoSupport: string[];            // cargo categories this vehicle can carry
  refrigerated?: boolean;
  /** Relative cost index per km (1 = mini van baseline). */
  rateIndex: number;
  /** Corridor/road class this vehicle needs (feeds routing restrictions). */
  minRoadClass: 'street' | 'secondary' | 'primary' | 'highway' | 'truck_route';
}

export const FREIGHT_VEHICLES: FreightVehicleSpec[] = [
  { category: 'mini_van', label: 'Mini Van', capacityKg: 600, dimensionsM: { l: 1.8, w: 1.3, h: 1.2 }, cargoSupport: ['general', 'fmcg', 'pharma'], rateIndex: 1.0, minRoadClass: 'street' },
  { category: 'cargo_van', label: 'Cargo Van', capacityKg: 1_200, dimensionsM: { l: 3.0, w: 1.6, h: 1.7 }, cargoSupport: ['general', 'fmcg', 'ecommerce', 'pharma'], rateIndex: 1.25, minRoadClass: 'street' },
  { category: 'pickup_truck', label: 'Pickup Truck', capacityKg: 1_500, dimensionsM: { l: 2.4, w: 1.5, h: 0.6 }, cargoSupport: ['general', 'construction', 'agricultural'], rateIndex: 1.35, minRoadClass: 'street' },
  { category: 'light_truck', label: 'Light Truck', capacityKg: 3_500, dimensionsM: { l: 4.2, w: 2.0, h: 1.9 }, cargoSupport: ['general', 'fmcg', 'agricultural', 'palletized'], rateIndex: 1.8, minRoadClass: 'secondary' },
  { category: 'medium_truck', label: 'Medium Truck', capacityKg: 8_000, dimensionsM: { l: 5.5, w: 2.2, h: 2.2 }, cargoSupport: ['general', 'fmcg', 'agricultural', 'construction', 'palletized', 'industrial'], rateIndex: 2.4, minRoadClass: 'primary' },
  { category: 'heavy_truck', label: 'Heavy Truck', capacityKg: 18_000, dimensionsM: { l: 7.0, w: 2.4, h: 2.5 }, cargoSupport: ['general', 'bulk', 'construction', 'industrial', 'palletized'], rateIndex: 3.2, minRoadClass: 'truck_route' },
  { category: 'flatbed_truck', label: 'Flatbed Truck', capacityKg: 15_000, dimensionsM: { l: 6.5, w: 2.4, h: 0 }, cargoSupport: ['heavy', 'machinery', 'construction', 'vehicles', 'steel'], rateIndex: 3.0, minRoadClass: 'truck_route' },
  { category: 'box_truck', label: 'Box Truck', capacityKg: 10_000, dimensionsM: { l: 6.0, w: 2.3, h: 2.4 }, cargoSupport: ['general', 'fmcg', 'palletized', 'ecommerce', 'household'], rateIndex: 2.6, minRoadClass: 'primary' },
  { category: 'refrigerated_truck', label: 'Refrigerated Truck', capacityKg: 9_000, dimensionsM: { l: 5.8, w: 2.2, h: 2.2 }, cargoSupport: ['cold_chain', 'pharma', 'agricultural', 'fmcg'], refrigerated: true, rateIndex: 3.4, minRoadClass: 'primary' },
  { category: 'tanker', label: 'Tanker', capacityKg: 33_000, dimensionsM: { l: 9.0, w: 2.5, h: 2.8 }, cargoSupport: ['liquid_bulk', 'fuel', 'chemicals'], rateIndex: 4.2, minRoadClass: 'truck_route' },
  { category: 'low_loader', label: 'Low Loader', capacityKg: 40_000, dimensionsM: { l: 12.0, w: 2.9, h: 0.9 }, cargoSupport: ['heavy', 'machinery', 'vehicles', 'construction'], rateIndex: 4.6, minRoadClass: 'truck_route' },
  { category: 'container_truck', label: 'Container Truck', capacityKg: 30_000, dimensionsM: { l: 12.2, w: 2.5, h: 2.9 }, cargoSupport: ['container', 'general', 'palletized'], rateIndex: 4.0, minRoadClass: 'truck_route' },
  { category: 'articulated_trailer', label: 'Articulated Trailer', capacityKg: 34_000, dimensionsM: { l: 13.6, w: 2.5, h: 2.7 }, cargoSupport: ['general', 'bulk', 'container', 'palletized', 'industrial'], rateIndex: 4.4, minRoadClass: 'truck_route' },
  { category: 'specialized_heavy_haul', label: 'Specialized Heavy Haul Equipment', capacityKg: 80_000, dimensionsM: { l: 16.0, w: 3.5, h: 1.0 }, cargoSupport: ['heavy', 'machinery', 'power_transformers', 'wind_blades'], rateIndex: 6.5, minRoadClass: 'truck_route' },
];

// ── § Vendor types (7) + verification chain (7 steps) ──────────────────────

export type LogisticsVendorType =
  | 'trucking_company' | 'fleet_operator' | 'independent_truck_owner' | 'freight_broker'
  | 'warehouse_operator' | 'cold_chain_operator' | 'distribution_company';

export const LOGISTICS_VENDOR_TYPES: { type: LogisticsVendorType; label: string }[] = [
  { type: 'trucking_company', label: 'Trucking Company' },
  { type: 'fleet_operator', label: 'Fleet Operator' },
  { type: 'independent_truck_owner', label: 'Independent Truck Owner' },
  { type: 'freight_broker', label: 'Freight Broker' },
  { type: 'warehouse_operator', label: 'Warehouse Operator' },
  { type: 'cold_chain_operator', label: 'Cold Chain Operator' },
  { type: 'distribution_company', label: 'Distribution Company' },
];

export const VENDOR_VERIFICATION_STEPS = [
  'business_verification',
  'identity_verification',
  'tax_verification',
  'insurance_verification',
  'vehicle_verification',
  'driver_verification',
  'compliance_approval',            // admin approval — activation only after ALL steps pass
] as const;
export type VerificationStep = (typeof VENDOR_VERIFICATION_STEPS)[number];

export interface VendorVerification {
  vendorId: string;
  type: LogisticsVendorType;
  steps: Record<VerificationStep, { status: 'pending' | 'approved' | 'rejected'; at?: Date; by?: string }>;
  /** true only when every step is approved — the marketplace lists verified vendors only. */
  active(): boolean;
}

export function createVendorVerification(vendorId: string, type: LogisticsVendorType): VendorVerification {
  const steps = {} as VendorVerification['steps'];
  for (const s of VENDOR_VERIFICATION_STEPS) steps[s] = { status: 'pending' };
  return {
    vendorId, type, steps,
    active: () => VENDOR_VERIFICATION_STEPS.every((s) => steps[s].status === 'approved'),
  };
}

/** Approve/reject one step (admin-driven; compliance_approval is the final gate). */
export function decideStep(v: VendorVerification, step: VerificationStep, status: 'approved' | 'rejected', by: string): VendorVerification {
  v.steps[step] = { status, at: new Date(), by };
  return v;
}

// ── matching helpers ────────────────────────────────────────────────────────

export interface CargoDescriptor {
  categories: string[];        // ['pharma'] etc.
  weightKg: number;
  volumeM3?: number;
  declaredValueMinor?: number; // cargo value for insurance
}

/** Vehicles that can legally/physically carry this cargo — smallest sufficient first. */
export function eligibleVehicles(cargo: CargoDescriptor, service: ServiceSpec): FreightVehicleSpec[] {
  const categories = cargo.categories?.length ? cargo.categories : ['general']; // callers may omit → general cargo
  return FREIGHT_VEHICLES
    .filter((v) => v.capacityKg >= cargo.weightKg)
    .filter((v) => categories.some((c) => v.cargoSupport.includes(c)))
    .filter((v) => !service.requiresReefer || v.refrigerated === true)
    .sort((a, b) => a.capacityKg - b.capacityKg);
}

/** Best vehicle = eligible with the smallest surplus capacity (utilization). */
export function bestVehicle(cargo: CargoDescriptor, service: ServiceSpec): FreightVehicleSpec | null {
  const eligible = eligibleVehicles(cargo, service);
  return eligible[0] ?? null;
}
