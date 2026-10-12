import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      /*
       * Server actions som brukes med useActionState MÅ ta forrige
       * tilstand som første argument, enten de bruker den eller ikke.
       * Uten dette unntaket må hver slik action ha en disable-kommentar.
       */
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  /*
   * Claude-økter legger git-worktrees med egne .next-bygg under .claude/.
   * Uten denne linja linter eslint tusenvis av genererte filer fra dem.
   */
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', '.claude/**']),
])

export default eslintConfig
