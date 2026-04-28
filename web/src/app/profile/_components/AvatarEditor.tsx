// Avatar editor — fun spectrum picker. One channel at a time (Outer /
// Inner / Letters), one big color grid (72 swatches), plus a native
// color wheel and a hex input for full custom freedom. No curated
// themes; the spectrum + the live preview do the work.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import Avatar from '@/components/Avatar';
import { createClient } from '@/lib/supabase/client';
import type { Json } from '@/types/database';
import type { Tables } from '@/types/database-helpers';

import { Card } from './Card';
import {
  Field,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  inputStyle,
} from './Field';
import { useToast } from './Toast';
import { C, F, FONT, R, S } from '../_lib/palette';

type UserRow = Tables<'users'>;

interface AvatarShape {
  outer?: string;
  inner?: string;
  initials?: string;
  text?: string;
}

interface Props {
  user: UserRow;
  preview: boolean;
  onUserUpdated?: (next: UserRow) => void;
}

const DEFAULT_OUTER = '#0b5cff';
const DEFAULT_INNER = '#ffffff';
const DEFAULT_TEXT = '#ffffff';

type Channel = 'outer' | 'inner' | 'text';

// Build the 72-swatch spectrum grid perceptually:
//   - 12 hues × 6 lightness levels
//   - Plus a neutral row at the end (white → black)
// hsl() at 80% saturation gives clean, vivid colors at every lightness.
function hsl(h: number, s: number, l: number): string {
  // Convert to hex so the value persists into avatar.outer cleanly.
  const hh = h / 360;
  const ss = s / 100;
  const ll = l / 100;
  const f = (n: number) => {
    const k = (n + hh * 12) % 12;
    const a = ss * Math.min(ll, 1 - ll);
    const c = ll - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const HUES = [0, 20, 40, 60, 90, 140, 175, 200, 220, 255, 290, 325];
const LIGHTNESS_LEVELS = [88, 72, 58, 48, 36, 22];
const SAT = 78;

const SPECTRUM: string[] = [];
for (const l of LIGHTNESS_LEVELS) {
  for (const h of HUES) {
    SPECTRUM.push(hsl(h, SAT, l));
  }
}

const NEUTRALS = [
  '#ffffff',
  '#f5f5f5',
  '#e5e5e5',
  '#d4d4d4',
  '#a3a3a3',
  '#737373',
  '#525252',
  '#404040',
  '#262626',
  '#171717',
  '#0a0a0a',
  '#000000',
];

export function AvatarEditor({ user, preview, onUserUpdated }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const u = user as UserRow & {
    avatar?: AvatarShape | null;
    avatar_color?: string | null;
    username?: string | null;
  };

  const initialsFromUsername = u.username ? (Array.from(u.username)[0]?.toUpperCase() ?? '?') : '?';

  const [outer, setOuter] = useState<string>(u.avatar?.outer ?? u.avatar_color ?? DEFAULT_OUTER);
  const [inner, setInner] = useState<string>(u.avatar?.inner ?? DEFAULT_INNER);
  const [text, setText] = useState<string>(u.avatar?.text ?? DEFAULT_TEXT);
  const [initials, setInitials] = useState<string>(
    (u.avatar?.initials ?? initialsFromUsername).slice(0, 4)
  );
  const [activeChannel, setActiveChannel] = useState<Channel>('outer');
  const [saving, setSaving] = useState(false);

  const initialRef = useRef('');
  useEffect(() => {
    initialRef.current = JSON.stringify({
      outer: u.avatar?.outer ?? u.avatar_color ?? DEFAULT_OUTER,
      inner: u.avatar?.inner ?? DEFAULT_INNER,
      text: u.avatar?.text ?? DEFAULT_TEXT,
      initials: (u.avatar?.initials ?? initialsFromUsername).slice(0, 4),
    });
  }, [u.avatar, u.avatar_color, initialsFromUsername]);

  const dirty = JSON.stringify({ outer, inner, text, initials }) !== initialRef.current;

  const previewUser = {
    ...u,
    avatar_color: outer,
    avatar: { outer, inner, text, initials },
  };

  const onInitialsChange = (raw: string) => {
    const cleaned = raw
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 4)
      .toUpperCase();
    setInitials(cleaned);
  };

  const channelValue = activeChannel === 'outer' ? outer : activeChannel === 'inner' ? inner : text;
  const setChannelValue = (v: string) => {
    if (activeChannel === 'outer') setOuter(v);
    else if (activeChannel === 'inner') setInner(v);
    else setText(v);
  };

  const onReset = () => {
    setOuter(DEFAULT_OUTER);
    setInner(DEFAULT_INNER);
    setText(DEFAULT_TEXT);
    setInitials(initialsFromUsername);
  };

  const onSave = async () => {
    if (preview) {
      toast.info('Sign in on :3333 to save your avatar.');
      return;
    }
    if (initials.length === 0) {
      toast.error('Add at least one character.');
      return;
    }
    setSaving(true);
    const next: AvatarShape = { outer, inner, text, initials };
    const { error } = await supabase.rpc('update_own_profile', {
      p_fields: { avatar: next, avatar_color: outer } as unknown as Json,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message ?? 'Could not save avatar.');
      return;
    }
    toast.success('Avatar updated.');
    onUserUpdated?.({
      ...user,
      avatar: next,
      avatar_color: outer,
    } as UserRow);
    initialRef.current = JSON.stringify({ outer, inner, text, initials });
  };

  return (
    <Card
      title="Avatar"
      description="Pick your colors and set up to 4 characters for the monogram."
      footer={
        <>
          <button type="button" onClick={onReset} disabled={saving} style={buttonSecondaryStyle}>
            Reset
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saving || initials.length === 0}
            style={{
              ...buttonPrimaryStyle,
              opacity: dirty && !saving && initials.length > 0 ? 1 : 0.55,
              cursor: dirty && !saving && initials.length > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'Saving…' : 'Save avatar'}
          </button>
        </>
      }
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: S[5],
          alignItems: 'flex-start',
          fontFamily: FONT.sans,
        }}
      >
        {/* Live preview */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: S[2],
            padding: S[4],
            background: C.surfaceSunken,
            border: `1px solid ${C.border}`,
            borderRadius: R.lg,
            minWidth: 160,
          }}
        >
          <Avatar user={previewUser as never} size={104} />
          <div style={{ display: 'flex', gap: S[2], alignItems: 'center', marginTop: S[1] }}>
            <Avatar user={previewUser as never} size={36} />
            <Avatar user={previewUser as never} size={24} />
          </div>
          <div
            style={{
              fontSize: F.xs,
              color: C.inkMuted,
              marginTop: S[1],
              textAlign: 'center',
            }}
          >
            Live preview
          </div>
        </div>

        <div style={{ display: 'grid', gap: S[5], minWidth: 0 }}>
          {/* Initials */}
          <Field
            label="Initials or numbers"
            hint="Up to 4 characters. Letters or numbers — JD, AK12, 99, 4U all work."
          >
            {(id) => (
              <input
                id={id}
                type="text"
                value={initials}
                onChange={(e) => onInitialsChange(e.target.value)}
                maxLength={4}
                style={{ ...inputStyle, fontFamily: FONT.mono, letterSpacing: '0.05em' }}
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </Field>

          {/* Channel selector */}
          <div>
            <div style={labelStyle}>Editing</div>
            <div
              role="tablist"
              style={{
                marginTop: S[2],
                display: 'flex',
                gap: 4,
                padding: 3,
                background: C.surfaceSunken,
                border: `1px solid ${C.border}`,
                borderRadius: R.md,
              }}
            >
              {(['outer', 'inner', 'text'] as Channel[]).map((ch) => {
                const active = ch === activeChannel;
                const swatch = ch === 'outer' ? outer : ch === 'inner' ? inner : text;
                const labelMap = { outer: 'Outer ring', inner: 'Inner disc', text: 'Letters' };
                return (
                  <button
                    key={ch}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveChannel(ch)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: S[2],
                      padding: `${S[2]}px ${S[3]}px`,
                      background: active ? C.bg : 'transparent',
                      border: active ? `1px solid ${C.borderStrong}` : '1px solid transparent',
                      borderRadius: R.sm,
                      fontSize: F.sm,
                      fontWeight: active ? 700 : 600,
                      color: active ? C.ink : C.inkSoft,
                      cursor: 'pointer',
                      transition: 'background 120ms ease',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: swatch,
                        border:
                          swatch.toLowerCase() === '#ffffff'
                            ? `1px solid ${C.borderStrong}`
                            : '1px solid rgba(0,0,0,0.08)',
                        flexShrink: 0,
                      }}
                    />
                    {labelMap[ch]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Spectrum grid */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                marginBottom: S[2],
              }}
            >
              <span style={labelStyle}>Spectrum</span>
              <span
                style={{
                  fontSize: F.xs,
                  color: C.inkFaint,
                  fontFamily: FONT.mono,
                  letterSpacing: '0.04em',
                }}
              >
                {channelValue.toUpperCase()}
              </span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${HUES.length}, 1fr)`,
                gap: 3,
                padding: 4,
                background: C.surfaceSunken,
                border: `1px solid ${C.border}`,
                borderRadius: R.md,
              }}
            >
              {SPECTRUM.map((c) => {
                const active = c.toLowerCase() === channelValue.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChannelValue(c)}
                    title={c.toUpperCase()}
                    aria-label={c.toUpperCase()}
                    style={{
                      aspectRatio: '1 / 1',
                      width: '100%',
                      background: c,
                      border: active ? `2px solid ${C.ink}` : '1px solid rgba(0,0,0,0.08)',
                      borderRadius: 4,
                      cursor: 'pointer',
                      padding: 0,
                      transform: active ? 'scale(1.08)' : 'scale(1)',
                      transition: 'transform 120ms ease',
                    }}
                  />
                );
              })}
            </div>

            {/* Neutrals row */}
            <div
              style={{
                marginTop: S[2],
                display: 'grid',
                gridTemplateColumns: `repeat(${NEUTRALS.length}, 1fr)`,
                gap: 3,
                padding: 4,
                background: C.surfaceSunken,
                border: `1px solid ${C.border}`,
                borderRadius: R.md,
              }}
            >
              {NEUTRALS.map((c) => {
                const active = c.toLowerCase() === channelValue.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChannelValue(c)}
                    title={c.toUpperCase()}
                    aria-label={c.toUpperCase()}
                    style={{
                      aspectRatio: '1 / 1',
                      width: '100%',
                      background: c,
                      border: active
                        ? `2px solid ${C.ink}`
                        : c.toLowerCase() === '#ffffff'
                          ? `1px solid ${C.borderStrong}`
                          : '1px solid rgba(0,0,0,0.08)',
                      borderRadius: 4,
                      cursor: 'pointer',
                      padding: 0,
                      transform: active ? 'scale(1.08)' : 'scale(1)',
                      transition: 'transform 120ms ease',
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Wheel + hex */}
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
            <input
              type="color"
              value={channelValue}
              onChange={(e) => setChannelValue(e.target.value)}
              style={{
                width: 44,
                height: 44,
                padding: 0,
                border: `1px solid ${C.border}`,
                borderRadius: R.md,
                background: C.bg,
                cursor: 'pointer',
                flexShrink: 0,
              }}
              aria-label="Open color wheel"
            />
            <input
              type="text"
              value={channelValue}
              onChange={(e) => {
                const v = e.target.value.trim();
                setChannelValue(v.startsWith('#') ? v : `#${v}`);
              }}
              maxLength={9}
              style={{
                ...inputStyle,
                fontFamily: FONT.mono,
                fontSize: F.sm,
                letterSpacing: '0.05em',
                maxWidth: 160,
              }}
              spellCheck={false}
              aria-label="Hex color value"
            />
            <span
              style={{
                fontSize: F.xs,
                color: C.inkFaint,
              }}
            >
              Wheel · Hex
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: F.sm,
  fontWeight: 600,
  color: C.inkSoft,
};
