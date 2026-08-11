'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Klient for nettleseren, mot adminbordets egen database.
 *
 * Brukes bevisst sparsomt: nesten alt i adminbordet henter data som
 * krever hemmeligheter, og det må skje på serveren. Denne finnes for
 * det som må skje i nettleseren likevel – som å lytte på at en
 * statusmåling er ferdig oppdatert.
 *
 * Leser process.env direkte i stedet for @/lib/env, fordi den fila er
 * `server-only`. NEXT_PUBLIC-verdier bakes inn i bunten ved bygg.
 */
export function lagNettleserKlient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
