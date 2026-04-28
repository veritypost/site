export default function ArticleSlugLoading() {
  return (
    <div
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '48px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <div style={{ height: 36, background: 'var(--card)', borderRadius: 6, width: '85%' }} />
      <div style={{ height: 18, background: 'var(--card)', borderRadius: 6, width: '60%' }} />
      <div style={{ height: 14, background: 'var(--card)', borderRadius: 6, marginTop: 24 }} />
      <div style={{ height: 14, background: 'var(--card)', borderRadius: 6, width: '95%' }} />
      <div style={{ height: 14, background: 'var(--card)', borderRadius: 6, width: '90%' }} />
      <div style={{ height: 14, background: 'var(--card)', borderRadius: 6, width: '70%' }} />
    </div>
  );
}
