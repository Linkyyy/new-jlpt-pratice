import { Suspense } from 'react';
import ActivationForm from '@/components/activation-form';
import { safeAccessReturnPath } from '@/lib/visit-access.mjs';

async function Access({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  return <ActivationForm returnTo={safeAccessReturnPath((await searchParams).returnTo ?? '/frequency')} />;
}
export default function AccessPage({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  return <Suspense fallback={<main className="min-h-screen bg-slate-50" />}><Access searchParams={searchParams} /></Suspense>;
}
