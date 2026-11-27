import { redirect } from 'next/navigation'

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

/**
 * `/painel/configuracoes`: the settings are a modal over the painel (see
 * `SettingsModal`), so this address opens the painel with it open.
 */
export default function SettingsRedirect(): never {
  redirect('/painel#configuracoes/conexoes')
}
