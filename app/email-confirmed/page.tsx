import Link from 'next/link';
import AuthCard from '@/components/AuthCard';

export const metadata = { title: 'Email confirmed · Heavy' };

/** Where the "confirm your email" link lands. */
export default function EmailConfirmed() {
  return (
    <AuthCard title="Email confirmed">
      <p role="status">Thanks. Your email address is confirmed. Open the Heavy app and sign in.</p>
      <Link href="/login/" className="btn-line w-full">Sign in on the web instead</Link>
    </AuthCard>
  );
}
