import { krevAdmin } from '@/lib/auth'
import { Seksjonstittel } from '@/components/ui'
import { Underfaner } from './underfaner'

export default async function AppenLayout({ children }: { children: React.ReactNode }) {
  await krevAdmin()

  return (
    <div className="space-y-6">
      <Seksjonstittel under="Hvem som slipper inn i mobilappen, og hvilke sider de ser. Ingen ser noe før de er i en gruppe – ansatte og kunder likt.">
        Appen
      </Seksjonstittel>
      <Underfaner />
      {children}
    </div>
  )
}
