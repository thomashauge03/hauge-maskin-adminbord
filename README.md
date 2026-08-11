# Hauge Maskin Adminbord

Hovedkontoret for alle Hauge Maskin-systemene: hvor databasene og
Vercel-prosjektene ligger, om de virker, og hvem som har tilgang hvor.

- **Oversikt** – driftsstatus for hvert system, hentet live fra Supabase og
  Vercel. Verste først.
- **Systemer** – registeret. Per system: Supabase-prosjekt, Vercel-prosjekt,
  repo, produksjonsadresse, notat. Detaljside med tjenestehelse, diskbruk,
  radtall, utrullingshistorikk, domener og nøkler.
- **Brukere** – alle kontoer i alle systemene samlet på e-post. Opprett bruker,
  sett passord, sperr konto – i hvilket som helst av systemene, fra ett sted.
- **Logg** – hva som er gjort herfra. Kan ikke redigeres.
- **Innstillinger** – om tokenene virker.

Oversikten viser også Supabase- og Vercel-prosjekter som *ikke* står i
registeret. Et prosjekt ingen husker koster penger hver måned.

## Kom i gang

```bash
npm install
cp .env.local.example .env.local   # fyll inn
npm run dev
```

Fullt oppsett, inkludert migrasjonene og den første brukeren, står i
[docs/TEKNISK-PLAN.md](docs/TEKNISK-PLAN.md).

## Dokumentasjon

- [docs/TEKNISK-PLAN.md](docs/TEKNISK-PLAN.md) – arkitektur, sikkerhetsmodell,
  hvorfor ting er som de er.
- [docs/INNLOGGINGSPORTAL.md](docs/INNLOGGINGSPORTAL.md) – veien til én
  innlogging for alle appene. Les denne før du rører auth.
- [AGENTS.md](AGENTS.md) – konvensjoner.

## Skript

| | |
|---|---|
| `npm run dev` | Utviklingsserver |
| `npm run build` | Produksjonsbygg |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## Sikkerhet

Adminbordet holder nøklene til alle de andre systemene. Les
sikkerhetsmodellen i den tekniske planen før du legger til noe som leser en
nøkkel. Kortversjonen:

- Ingen hemmelighet skal kunne nå nettleseren. Alt som leser en nøkkel importerer
  `server-only`.
- Andre systemers nøkler ligger kryptert i databasen, ikke i miljøet.
- Hver server action sjekker tilgang selv. Layouten er ikke nok.
- `.env*` er i `.gitignore`. Sjekk aldri inn et token.
