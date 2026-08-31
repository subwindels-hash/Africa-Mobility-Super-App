import { Badge, DataTable, PortalShell, StatCard } from '@/components/ui';

export const metadata = { title: 'AMSA · WhatsApp AI Control Center' };

const NAV = [
  { label: 'Overview', icon: '▤', active: true },
  { label: 'Conversations', icon: '💬' },
  { label: 'Escalations', icon: '🧑🏾‍💻' },
  { label: 'Agent performance', icon: '👥' },
  { label: 'AI training data', icon: '🧠' },
  { label: 'Templates', icon: '📄' },
  { label: 'Broadcasts', icon: '📣' },
  { label: 'Analytics', icon: '📊' },
];

const CONVERSATIONS = [
  ['+234 801 234 5678', 'book_logistics', 'pcm', 'confirm', <Badge key="1" tone="brand">AI handling</Badge>, '2m ago'],
  ['+234 809 990 0011', 'roadside_assist', 'en', 'payment', <Badge key="2" tone="brand">AI handling</Badge>, '6m ago'],
  ['+234 805 552 8890', 'refund_support', 'en', 'with_agent', <Badge key="3" tone="danger">Agent: Tunde</Badge>, 'now'],
  ['+234 703 111 2233', 'book_travel', 'yo', 'collect_slots', <Badge key="4" tone="brand">AI handling</Badge>, '11m ago'],
  ['+234 812 776 4401', 'unknown', 'ig', 'escalated', <Badge key="5" tone="warning">Pending 1m</Badge>, '1m ago'],
];

const ESCALATIONS = [
  ['ESC-1042', 'low_confidence (38%)', 'Refund question on BKG-99012', <Badge key="a" tone="warning">Queued</Badge>],
  ['ESC-1041', 'refund', 'Wrong charge dispute ₦15,500', <Badge key="b" tone="danger">SLA 18m left</Badge>],
  ['ESC-1039', 'explicit_request', '"talk to a human"', <Badge key="c" tone="brand">Resolved by agent</Badge>],
];

const TEMPLATES = [
  ['booking_confirmation', 'UTILITY', 'en', <Badge key="1" tone="brand">Approved</Badge>, '12.4k sent'],
  ['driver_enroute', 'UTILITY', 'en', <Badge key="2" tone="brand">Approved</Badge>, '31.2k sent'],
  ['payment_confirmation', 'UTILITY', 'en', <Badge key="3" tone="brand">Approved</Badge>, '28.9k sent'],
  ['otp_verification', 'AUTHENTICATION', 'en', <Badge key="4" tone="brand">Approved</Badge>, '54.1k sent'],
  ['promo_broadcast', 'MARKETING', 'en', <Badge key="5" tone="warning">Pending Meta</Badge>, '—'],
];

const TRAINING = [
  ['book_security', '"I need security escort for my oga tomorrow"', <Badge key="1" tone="brand">intent ✓</Badge>],
  ['unknown', '"abeg wetin be dis wahala"', <Badge key="2" tone="warning">needs label</Badge>],
  ['book_logistics', 'voice: "I wan send cake go Surulere"', <Badge key="3" tone="brand">intent ✓</Badge>],
];

export default function WhatsAppAdminPage() {
  return (
    <PortalShell
      title="WhatsApp AI Control Center"
      subtitle="Ada — Smart AI Customer Service Platform"
      role="AI ops admin"
      nav={NAV}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Conversations today" value="3,412" delta="+14%" sub="2,890 active" />
        <StatCard label="AI resolution rate" value="78%" delta="+5%" sub="target ≥ 80%" />
        <StatCard label="Bookings from WhatsApp" value="412" delta="+22%" sub="₦3.1M GMV" />
        <StatCard label="Avg AI response" value="1.9s" sub="target < 3s" />
        <StatCard label="Escalation rate" value="12.4%" delta="-2%" sub="target < 20%" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-slate-900">Live conversations</h2>
            <Badge tone="brand">🟢 5 threads shown of 2,890</Badge>
          </div>
          <DataTable
            headers={['Customer', 'Intent', 'Lang', 'Node', 'Handling', 'Last msg']}
            rows={CONVERSATIONS}
          />
        </div>
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-slate-900">Escalation inbox</h2>
            <Badge tone="warning">2 awaiting agent</Badge>
          </div>
          <DataTable headers={['ID', 'Trigger', 'Context', 'Status']} rows={ESCALATIONS} />
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div>
          <h2 className="mb-3 font-display text-base font-bold text-slate-900">WhatsApp templates (Meta)</h2>
          <DataTable headers={['Name', 'Category', 'Locale', 'Status', 'Volume']} rows={TEMPLATES} />
        </div>
        <div>
          <h2 className="mb-3 font-display text-base font-bold text-slate-900">AI training review queue</h2>
          <DataTable headers={['Predicted intent', 'Utterance', 'Label']} rows={TRAINING} />
          <p className="mt-3 text-xs text-slate-500">
            Escalated transcripts flow here for labeling → weekly model retrain (champion/challenger, docs/19).
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">Broadcast campaign</h2>
            <p className="text-xs text-slate-500">Opt-in audiences only (NDPR + Meta policy) · approval gate before send</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="brand">Audience: 41,200 opted-in</Badge>
            <Badge tone="slate">Est. cost ₦820k</Badge>
            <Badge tone="warning">Pending approval</Badge>
          </div>
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-1/3 rounded-full bg-brand-500" />
        </div>
        <p className="mt-2 text-xs text-slate-500">Sending window 10:00–18:00 WAT · pause on quality-rating drop</p>
      </div>
    </PortalShell>
  );
}
