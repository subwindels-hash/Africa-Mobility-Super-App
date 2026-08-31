import Link from 'next/link';

/* ───────────────────────── Shared UI primitives (design-system atoms) ───── */

export function Container({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}

export function Button({
  children, variant = 'primary', href, className = '', onClick,
}: {
  children: React.ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'gold'; href?: string; className?: string; onClick?: () => void;
}) {
  const styles = {
    primary: 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm',
    secondary: 'bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-100',
    ghost: 'bg-transparent hover:bg-slate-100 text-slate-700',
    gold: 'bg-gold-600 hover:bg-gold-500 text-white shadow-sm',
  }[variant];
  const cls = `inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${styles} ${className}`;
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return <button className={cls} onClick={onClick}>{children}</button>;
}

export function Badge({ children, tone = 'brand' }: { children: React.ReactNode; tone?: 'brand' | 'gold' | 'sky' | 'teal' | 'slate' | 'danger' | 'warning' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700 ring-brand-100',
    gold: 'bg-gold-100 text-gold-600 ring-gold-100',
    sky: 'bg-sky-50 text-sky-500 ring-sky-100',
    teal: 'bg-teal-50 text-teal-500 ring-teal-100',
    slate: 'bg-slate-100 text-slate-600 ring-slate-200',
    danger: 'bg-red-50 text-danger-600 ring-red-100',
    warning: 'bg-amber-50 text-amber-600 ring-amber-100',
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tones}`}>
      {children}
    </span>
  );
}

export function StatCard({ label, value, delta, sub }: { label: string; value: string; delta?: string; sub?: string }) {
  const positive = delta?.startsWith('+');
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 font-display text-2xl font-bold text-slate-900">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {delta && (
          <span className={`font-semibold ${positive ? 'text-brand-600' : 'text-slate-400'}`}>{delta}</span>
        )}
        {sub && <span className="text-slate-400">{sub}</span>}
      </div>
    </div>
  );
}

export function SectionTitle({ eyebrow, title, sub, center = false }: { eyebrow?: string; title: string; sub?: string; center?: boolean }) {
  return (
    <div className={`${center ? 'text-center mx-auto' : ''} max-w-2xl`}>
      {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">{eyebrow}</p>}
      <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-base leading-7 text-slate-600">{sub}</p>}
    </div>
  );
}

export function PortalShell({
  title, subtitle, role, nav, children,
}: {
  title: string; subtitle: string; role: string; nav: { label: string; icon: string; active?: boolean }[]; children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
          <Logo small />
          <div className="leading-tight">
            <p className="font-display text-sm font-bold text-slate-900">{title}</p>
            <p className="text-[11px] text-slate-400">AMSA Platform</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((n) => (
            <div
              key={n.label}
              className={`flex cursor-default items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                n.active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span aria-hidden>{n.icon}</span>{n.label}
            </div>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4 text-xs text-slate-400">
          <Badge tone="brand">🔐 {role} · MFA verified</Badge>
        </div>
      </aside>
      <main className="flex-1">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-6 backdrop-blur">
          <div>
            <h1 className="font-display text-lg font-bold text-slate-900">{title}</h1>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500 sm:block">🔍 Search…</span>
            <span className="relative">
              <span aria-hidden className="text-lg">🔔</span>
              <span className="absolute -right-1 -top-1 rounded-full bg-danger-600 px-1.5 text-[10px] font-bold text-white">3</span>
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700">AO</div>
          </div>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}

export function DataTable({ headers, rows }: { headers: string[]; rows: (React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
          <tr>{headers.map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50/70">{r.map((c, j) => <td key={j} className="px-4 py-3 text-slate-700">{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-xl bg-brand-500 font-display font-extrabold text-white ${small ? 'h-8 w-8 text-sm' : 'h-10 w-10 text-lg'}`}>
      A
    </span>
  );
}
