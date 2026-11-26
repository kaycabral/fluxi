import { redirect } from 'next/navigation'

/**
 * `/painel/configuracoes`: the settings are a modal over the painel (see
 * `SettingsModal`), so this address opens the painel with it open.
 */
export default function SettingsRedirect(): never {
  redirect('/painel#configuracoes/conexoes')
}
