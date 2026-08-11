import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /*
   * Sikkerhetshoder på alle svar. Adminbordet er strengere enn de andre
   * appene fordi det er det eneste stedet som har nøklene til alle
   * systemene: her er det ingen kundeflyt som trenger kamera eller
   * posisjon, så alt slås av.
   *
   * Ingen CSP: den krever nøye tilpasning til Next sine inline-skript
   * og ville lett brutt appen. Hodene under er trygge og fanger de
   * vanligste angrepene.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Hindrer at siden legges i en <iframe> på et fremmed
          // nettsted (clickjacking).
          { key: 'X-Frame-Options', value: 'DENY' },
          // Nettleseren skal ikke gjette filtype og f.eks. kjøre en
          // fil som skript.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Lekk aldri full URL – stiene her inneholder prosjekt-ID-er.
          { key: 'Referrer-Policy', value: 'no-referrer' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), geolocation=(), microphone=(), payment=()',
          },
          // Adminbordet skal aldri havne i en søkemotor eller i et
          // arkiv, uansett om noen deler en lenke ut av vanvare.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
    ]
  },
}

export default nextConfig
