/** Egen fil uten `server-only`, så testen kan laste den. */
export function hentBearer(header: string | null): string | null {
  const treff = /^Bearer\s+(\S+)$/i.exec(header?.trim() ?? '')
  return treff ? treff[1] : null
}
