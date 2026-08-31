/**
 * Corporate logistics (docs/32 §corporate): accounts, departments,
 * transport-request approvals, budgets and invoices.
 */
import type { Shipment } from './shipments';

export interface CorporateDepartment {
  code: string;                      // dept/logistics
  name: string;
  budgetMinor: number;
  spentMinor: number;
  approvers: string[];               // users allowed to approve transport requests
}

export interface TransportRequest {
  id: string;                        // req_...
  accountId: string;
  departmentCode: string;
  requestedBy: string;
  shipmentIntent: { service: string; originState: string; destState: string; estimatedMinor: number };
  status: 'pending' | 'approved' | 'rejected' | 'booked';
  decidedBy?: string;
  at: Date;
  note?: string;
}

export interface CorporateInvoice {
  id: string;                        // inv_...
  accountId: string;
  period: string;                    // 2026-08
  lines: { shipmentId: string; description: string; amountMinor: number }[];
  totalMinor: number;
  status: 'draft' | 'issued' | 'paid';
}

export class CorporateLogistics {
  private accounts = new Map<string, { id: string; name: string; departments: Map<string, CorporateDepartment> }>();
  private requests: TransportRequest[] = [];
  private invoices: CorporateInvoice[] = [];
  private seq = 0;

  createAccount(id: string, name: string, departments: { code: string; name: string; budgetMinor: number; approvers: string[] }[]): CorporateDepartment[] {
    const map = new Map<string, CorporateDepartment>();
    for (const d of departments) map.set(d.code, { ...d, spentMinor: 0 });
    this.accounts.set(id, { id, name, departments: map });
    return [...map.values()];
  }

  getAccount(id: string) { return this.accounts.get(id); }

  /** § corporate: departments raise transport requests; approvers decide. */
  raiseRequest(p: { accountId: string; departmentCode: string; requestedBy: string; service: string; originState: string; destState: string; estimatedMinor: number; note?: string }): TransportRequest {
    const acc = this.accounts.get(p.accountId);
    if (!acc) throw new Error(`Unknown corporate account ${p.accountId}`);
    const dept = acc.departments.get(p.departmentCode);
    if (!dept) throw new Error(`Unknown department ${p.departmentCode} on ${p.accountId}`);
    const req: TransportRequest = {
      id: `req_${++this.seq}`, accountId: p.accountId, departmentCode: p.departmentCode,
      requestedBy: p.requestedBy,
      shipmentIntent: { service: p.service, originState: p.originState, destState: p.destState, estimatedMinor: p.estimatedMinor },
      status: 'pending', at: new Date(), note: p.note,
    };
    this.requests.push(req);
    return req;
  }

  /** Approval = approver membership + department budget check. */
  decide(requestId: string, approver: string, decision: 'approved' | 'rejected'): TransportRequest {
    const req = this.requests.find((r) => r.id === requestId);
    if (!req) throw new Error(`Unknown request ${requestId}`);
    if (req.status !== 'pending') throw new Error(`Request already ${req.status}`);
    const acc = this.accounts.get(req.accountId)!;
    const dept = acc.departments.get(req.departmentCode)!;
    if (!dept.approvers.includes(approver)) throw new Error(`${approver} is not an approver for ${dept.name}`);
    if (decision === 'approved' && dept.spentMinor + req.shipmentIntent.estimatedMinor > dept.budgetMinor) {
      throw new Error(`Budget exceeded for ${dept.name}: ${(dept.spentMinor + req.shipmentIntent.estimatedMinor) / 100} NGN > ${(dept.budgetMinor) / 100} NGN`);
    }
    req.status = decision;
    req.decidedBy = approver;
    if (decision === 'approved') dept.spentMinor += req.shipmentIntent.estimatedMinor;
    return req;
  }

  markBooked(requestId: string): TransportRequest {
    const req = this.requests.find((r) => r.id === requestId)!;
    req.status = 'booked';
    return req;
  }

  /** § corporate: generate invoices per period from settled shipments. */
  generateInvoice(accountId: string, period: string, shipments: Shipment[]): CorporateInvoice {
    const lines = shipments
      .filter((s) => s.party.corporateAccountId === accountId && s.payment?.mode === 'corporate_billing' && s.quoteMinor)
      .map((s) => ({ shipmentId: s.id, description: `${s.spec.label} ${s.stops[0]?.stateCode}→${s.stops[s.stops.length - 1]?.stateCode}`, amountMinor: s.quoteMinor! }));
    const inv: CorporateInvoice = {
      id: `inv_${accountId}_${period}`, accountId, period, lines,
      totalMinor: lines.reduce((a, l) => a + l.amountMinor, 0), status: 'issued',
    };
    this.invoices.push(inv);
    return inv;
  }

  listRequests(accountId?: string): TransportRequest[] {
    return this.requests.filter((r) => !accountId || r.accountId === accountId);
  }
  listInvoices(accountId?: string): CorporateInvoice[] {
    return this.invoices.filter((i) => !accountId || i.accountId === accountId);
  }
}
