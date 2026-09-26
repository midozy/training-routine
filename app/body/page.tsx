'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Body tracking now lives in Progress → Body.
export default function BodyRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/progress?tab=body'); }, [router]);
  return null;
}
