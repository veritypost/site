'use client';
import { useState } from 'react';
// TODO: swap to real App Store URL once app is published
const KIDS_APP_INFO_URL = '/kids-app';
const KIDS_APP_SCHEME = 'veritypostkids://';
export default function OpenKidsAppButton() {
  const [tried, setTried] = useState(false);
  const open = () => {
    setTried(true);
    window.location.href = KIDS_APP_SCHEME;
    setTimeout(() => {
      window.location.href = KIDS_APP_INFO_URL;
    }, 1500);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        onClick={open}
        style={{
          padding: '10px 16px',
          borderRadius: 8,
          border: '1px solid #111',
          background: '#111',
          color: '#fff',
          fontSize: 13,
          fontWeight: 700,
          alignSelf: 'flex-start',
        }}
      >
        Open Kids App
      </button>
      {tried && (
        <p style={{ fontSize: 12, color: '#666', margin: 0 }}>
          Not installed? <a href={KIDS_APP_INFO_URL}>Learn about Verity Post Kids</a>.
        </p>
      )}
    </div>
  );
}
