import KidTopChrome from '@/components/kids/KidTopChrome';
import { KID } from '@/lib/kidTheme';

// Kids-scoped layout. Mounts KidTopChrome once for every /kids/* route
// including /kids/story/[slug]. The chrome renders nothing until a kid
// profile is active (vp_active_kid_id in localStorage), so the picker
// state on /kids keeps a clean full-bleed shell.
//
// Chunk 7: the layout now owns the full-height cream background + the
// Source Serif body font. Pages drop their own `minHeight: 100vh` +
// `background` so the 64px sticky chrome doesn't add 64px of overflow
// past 100vh (Chunk 4 flag). 100dvh tracks the true viewport on mobile.

export default function KidsLayout({ children }) {
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
