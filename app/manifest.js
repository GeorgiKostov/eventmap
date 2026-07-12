export default function manifest() {
  return {
    name: 'Okolo — Events rund um Linz',
    short_name: 'Okolo',
    description:
      'Familien-Events und lokale Veranstaltungen rund um Linz auf einer Karte.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f2f2ee',
    theme_color: '#c93a5b',
    lang: 'de-AT',
    categories: ['events', 'lifestyle', 'navigation'],
    orientation: 'portrait',
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any' },
      { src: '/icon-192.png', type: 'image/png', sizes: '192x192', purpose: 'any' },
      { src: '/icon-512.png', type: 'image/png', sizes: '512x512', purpose: 'any' },
      { src: '/icon-maskable-192.png', type: 'image/png', sizes: '192x192', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' },
    ],
  };
}
