import { redirect } from 'next/navigation'

/** `/painel/conexoes` moved into the settings modal: kept so old links still land there. */
export default function ConnectionsRedirect(): never {
  redirect('/painel#configuracoes/conexoes')
}
