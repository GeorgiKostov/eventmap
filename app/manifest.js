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
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any' },
    ],
  };
}
