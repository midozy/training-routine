'use client';

import { useRouter } from 'next/navigation';

export default function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: { h: string; p: string[] }[] }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-xl px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+40px)]">
      <button onClick={() => (history.length > 1 ? router.back() : router.push('/'))} className="eyebrow text-ink h-10">← Back</button>
      <h1 className="display text-[52px] mt-2">{title}</h1>
      <div className="eyebrow mt-3">Last updated {updated}</div>
      <div className="mt-8 border-t-2 border-ink">
        {sections.map((s) => (
          <section key={s.h} className="py-5 border-b border-rule">
            <h2 className="font-display font-bold uppercase text-xl tracking-wide">{s.h}</h2>
            {s.p.map((t, i) => <p key={i} className="mt-2 text-[15px] leading-relaxed">{t}</p>)}
          </section>
        ))}
      </div>
    </div>
  );
}
