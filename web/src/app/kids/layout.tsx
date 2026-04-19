// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
import KidTopChrome from '@/components/kids/KidTopChrome';
import { KID } from '@/lib/kidTheme';

export default function KidsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100dvh',
      background: KID.bg,
      fontFamily: 'var(--font-serif)',
      color: KID.text,
    }}>
      <KidTopChrome>
        {children}
      </KidTopChrome>
    </div>
  );
}
