import baseConfig from '@cbrl/eslint-config'

export default [
  ...baseConfig,
  {
    // Edge Function entrypoints are Deno (outside tsconfig): checked with
    // `deno check`/`deno lint`. Their logic lives in src/ and is linted here.
    ignores: ['.husky/**', 'supabase/functions/**'],
  },
  // Server code logs through `@cbrl/log` (structured, PII-redacted, correlation
  // id); `@cbrl/log` is Node-only, so client code surfaces failures in the UI
  // instead. Scripts and tests may print.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
    rules: { 'no-console': 'error' },
  },
]
