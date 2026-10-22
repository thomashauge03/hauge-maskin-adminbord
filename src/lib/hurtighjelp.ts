/* Windows-appen legger window.hmApp.hurtighjelp på adminbordets fane, og bare der
   (hauge-maskin-app/src/adminbord-bro.js). En nettside kan ikke starte programmer på PC-en,
   så uten broen finnes ingen knapp å vise – en knapp som bare sier «virker ikke her» ville
   stått i veien for alle som bruker adminbordet i nettleseren. */

export type Hurtighjelpbro = { start: () => Promise<unknown> }

export function finnBro(w: unknown): Hurtighjelpbro | null {
  const bro = (w as { hmApp?: { hurtighjelp?: { start?: unknown } } } | undefined)?.hmApp?.hurtighjelp
  return typeof bro?.start === 'function' ? (bro as Hurtighjelpbro) : null
}

export function svarTekst(svar: unknown): string {
  if (svar === 'app' || svar === 'gammel') {
    return 'Hurtighjelp er åpnet. Velg «Hjelp noen» og gi koden til den som ringer.'
  }
  if (svar === 'butikk') {
    return 'Hurtighjelp mangler på denne PC-en. Microsoft Store er åpnet: trykk Hent, og prøv igjen.'
  }
  const feil = (svar as { feil?: unknown } | null | undefined)?.feil
  return typeof feil === 'string' ? feil : 'Fikk ikke startet Hurtighjelp. Søk etter den i Start-menyen.'
}
