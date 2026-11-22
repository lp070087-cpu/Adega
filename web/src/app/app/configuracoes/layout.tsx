import { Suspense } from 'react';
import { SettingsNav } from '@/components/settings/SettingsNav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
      <Suspense fallback={<div className="h-11 lg:h-0" />}>
        <SettingsNav />
      </Suspense>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
