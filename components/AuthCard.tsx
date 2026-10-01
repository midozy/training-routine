import Link from 'next/link';

/** Shared look for the pages an e-mailed link lands on (reset password, email confirmed). */
export default function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col px-6 pt-[calc(env(safe-area-inset-top)+36px)] pb-[calc(env(safe-area-inset-bottom)+24px)] max-w-md mx-auto page-in">
      <Link href="/login/" className="display text-3xl">Heavy</Link>
      <h1 className="display text-[56px] mt-10">{title}</h1>
      <div className="mt-6 space-y-3">{children}</div>
    </div>
  );
}
