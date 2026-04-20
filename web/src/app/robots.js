export default function robots() {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://veritypost.com';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/admin/',
          '/api/',
          '/bookmarks',
          '/forgot-password',
          '/logout',
          '/messages',
          '/notifications',
          '/preview',
          '/profile/settings',
          '/reset-password',
          '/verify-email',
          '/welcome',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
