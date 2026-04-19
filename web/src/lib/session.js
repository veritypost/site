// Tiny client-side session id for ad frequency capping.
// Persisted in sessionStorage so it resets when the tab closes.
export function getSessionId() {
  if (typeof window === 'undefined') return null;
  let id = sessionStorage.getItem('vp_session_id');
  if (!id) {
    id = (crypto?.randomUUID?.() ||
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
    sessionStorage.setItem('vp_session_id', id);
  }
  return id;
}

// Article view count lives in localStorage so the "2nd article open"
// interstitial for anons survives reloads.
export function bumpArticleViewCount() {
  if (typeof window === 'undefined') return 0;
  const k = 'vp_article_views';
  const n = parseInt(localStorage.getItem(k) || '0', 10) + 1;
  localStorage.setItem(k, String(n));
  return n;
}

// Session quiz-completion counter for the D23 "interstitial every 3rd quiz".
export function bumpQuizCount() {
  if (typeof window === 'undefined') return 0;
  const k = 'vp_quiz_count_session';
  const n = parseInt(sessionStorage.getItem(k) || '0', 10) + 1;
  sessionStorage.setItem(k, String(n));
  return n;
}
