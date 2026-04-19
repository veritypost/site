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
          '/profile/settings',
          '/reset-password',
          '/verify-email',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
