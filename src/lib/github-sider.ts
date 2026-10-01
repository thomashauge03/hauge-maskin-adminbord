import 'server-only'

import { env } from '@/lib/env'
import { hentSidefila, skrivSidefila, type RaaSide } from '@/lib/sidefila'

export type { RaaSide, SkriveSvar } from '@/lib/sidefila'

/*
 * Lesingen og skrivingen står i sidefila.ts. Den har ingen importer, så Node
 * kan teste den direkte – og dermed kan den heller ikke lese tokenet selv.
 * Det skjer her, i en fil som importerer server-only.
 */
const github = { token: env.HM_GITHUB_TOKEN }

export const kanRedigereSider = () => Boolean(env.HM_GITHUB_TOKEN)

export const hentRaaSider = () => hentSidefila(github)

export const skrivRaaSider = (
  sider: RaaSide[],
  sha: string,
  melding: string,
  hylse: Record<string, unknown> | null,
) => skrivSidefila(github, sider, sha, melding, hylse)
