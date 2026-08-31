import Link from 'next/link';
import { Badge, Button, Container, DataTable, Logo, SectionTitle, StatCard } from '@/components/ui';

export const metadata = { title: 'AMSA · Live tracking' };

const CHECKPOINTS = [
  { at: '08:12', label: 'Loaded at Ewekoro · seals applied ✓' },
  { at: '10:47', label: 'Checkpoint: Ogbomoso · ETA 17:20' },
  { at: '13:02', label: 'Checkpoint: Kaduna bypass · ETA 17:45' },
  { at: '14:39', label: '⚠️ Geofence alert — 4.2 km off corridor (auto-notified fleet ops)' },
  { at: '17:31', label: 'Delivered · signature + 3 photos captured' },
];

export default function TrackPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <Container className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5"><Logo /><span className="font-display text-xl font-extrabold text-slate-900">AMSA</span></Link>
          <div className="flex items-center gap-3">
            <Link href="/book"><Button variant="ghost">Book</Button></Link>
            <Link href="/wallet"><Button variant="ghost">Wallet</Button></Link>
            <Link href="/track"><Button>Tracking</Button></Link>
          </div>
        </Container>
      </header>

      <Container className="py-12">
        <SectionTitle eyebrow="Live tracking" title="Where is my ride / cargo / flight?" sub="Real-time GPS, checkpoints, geofence monitoring, ETA updates and route playback — shareable with anyone you authorize." />

        <div className="mx-auto mt-8 flex max-w-xl gap-3">
          <input
            className="h-12 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
            placeholder="Booking, shipment (shp_2) or PNR…"
          />
          <Button>Track</Button>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Shipment" value="SHP-1042" sub="20t cement · flatbed" />
          <StatCard label="Corridor" value="Lagos → Kano" sub="A2 expressway · 570 km" />
          <StatCard label="ETA" value="17:45" delta="on time" sub="live from GPS + traffic" />
          <StatCard label="Cargo security" value="Sealed ✓" sub="insured · tamper-monitored" />
        </div>

        <div className="mt-10 grid gap-6 xl:grid-cols-3">
          <section className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Checkpoint timeline</h3>
              <Badge tone="brand">live</Badge>
            </div>
            <ol className="mt-5 space-y-4">
              {CHECKPOINTS.map((c, i) => (
                <li key={c.at} className="flex gap-4">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i === 3 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {i === 3 ? '!' : i + 1}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">{c.label}</div>
                    <div className="text-xs text-slate-500">{c.at} WAT</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-slate-900">Your live trips</h3>
            <div className="mt-4">
              <DataTable
                headers={['Ref', 'Service', 'Status']}
                rows={[
                  ['BKG-8812', 'Ride · Comfort', <Badge key="a" tone="brand">driver 6 min away</Badge>],
                  ['SHP-1042', 'Interstate FTL', <Badge key="b" tone="warning">geofence alert</Badge>],
                  ['PNR-4F7KQ2', 'LOS → ABV flight', <Badge key="c" tone="sky">ticketed</Badge>],
                  ['DSP-3311', 'Dispatch parcel', <Badge key="d" tone="brand">delivered</Badge>],
                ]}
              />
            </div>
            <div className="mt-5 rounded-xl bg-slate-900 p-4 font-mono text-[11px] text-slate-300">
              GET /v1/interstate/shipments/shp_1042 · WS room track:shp_1042 · POST /v1/interstate/shipments/:id/tracking-link
            </div>
          </section>
        </div>
      </Container>
    </div>
  );
}
