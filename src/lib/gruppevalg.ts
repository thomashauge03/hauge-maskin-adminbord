/*
 * Sidene i valget for én gruppe, under Appen › Grupper.
 *
 * Alt som står under «Gir:» skal kunne tas ut her. Valget viser sidene
 * telefonen kan vise, og i tillegg det gruppa gir som telefonen ikke viser:
 * sider merket for PC, og id-er som ikke står i sidelista (skjult eller
 * slettet i sider.json). De står med en merknad. Gir gruppa dem ikke, står
 * de ikke – å legge dem til ville ikke gjort noe.
 *
 * Ingen import, med vilje: testene kjører fila direkte i Node.
 */

export type Valgside = {
  id: string
  navn: string
  gruppe: string
  gir: boolean
  /** Hvorfor siden ikke vises på telefonen, når den ikke gjør det */
  merknad: string | null
}

export function siderIValget(
  sider: readonly { id: string; navn: string; gruppe: string; barePC: boolean }[],
  gir: readonly string[],
): Valgside[] {
  const gis = new Set(gir)
  const kjente = new Set(sider.map((s) => s.id))
  return [
    ...sider
      .filter((s) => !s.barePC || gis.has(s.id))
      .map((s) => ({
        id: s.id,
        navn: s.navn,
        gruppe: s.gruppe,
        gir: gis.has(s.id),
        merknad: s.barePC ? 'Bare PC – vises ikke på telefonen' : null,
      })),
    ...gir
      .filter((id) => !kjente.has(id))
      .map((id) => ({
        id,
        navn: id,
        gruppe: '',
        gir: true,
        merknad: 'Skjult eller slettet i sider.json',
      })),
  ]
}
