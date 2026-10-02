import type { MetadataRoute } from 'next'

/**
 * Gjør at «Legg til på Hjem-skjerm» gir HM-ikonet og åpner adminbordet i
 * fullskjerm. Ingen service worker: alt her er live, og en mellomlagret side
 * ville vist gammel status som om den var ny.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HM Adminbord',
    short_name: 'Adminbord',
    description: 'Driftsoversikt og brukerstyring for alle Hauge Maskin-systemer.',
    lang: 'nb',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0b0c',
    theme_color: '#0b0b0c',
    icons: [
      { src: '/ikon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/ikon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/ikon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
