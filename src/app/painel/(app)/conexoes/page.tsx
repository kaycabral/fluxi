import { redirect } from 'next/navigation'

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

/** `/painel/conexoes` moved into the settings modal: kept so old links still land there. */
export default function ConnectionsRedirect(): never {
  redirect('/painel#configuracoes/conexoes')
}
