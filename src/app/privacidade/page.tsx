import { LegalPage } from '@/components/legal-page'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacidade — Fluxi',
  description: 'Política de privacidade do Fluxi.',
}

const LAST_UPDATED = '24/11/2026'
const CONTACT_EMAIL = 'privacidade@cbrl.dev'
const GOOGLE_USER_DATA_POLICY = 'https://developers.google.com/terms/api-services-user-data-policy'

export default function PrivacidadePage() {
  return (
    <LegalPage title="Política de privacidade" lastUpdated={LAST_UPDATED}>
      <p>
        Esta política descreve como o Fluxi trata os seus dados, em conformidade com a Lei Geral de
        Proteção de Dados (LGPD, Lei 13.709/2018). Segurança e minimização de dados são pilares do
        produto: coletamos apenas o necessário para o serviço funcionar.
      </p>

      <h2>O que coletamos</h2>
      <ul>
        <li>
          <strong>Dados da sua conta Google</strong>: nome, e-mail e foto do perfil, recebidos
          quando você entra com o Google. Servem apenas para identificar você e exibir sua conta.
          Base legal: execução de contrato (LGPD Art. 7º, V).
        </li>
        <li>
          <strong>Os registros financeiros que você cadastra</strong>: bancos, contas, transações,
          categorias, orçamentos e o status de pagamento (pago/recebido). Esses dados são digitados
          por você e existem só para montar o seu planejamento. Base legal: execução de contrato
          (LGPD Art. 7º, V).
        </li>
        <li>
          <strong>Registros técnicos mínimos</strong>: informações de acesso (como endereço IP e
          data/hora) mantidas por pouco tempo para segurança e estabilidade do serviço, além de
          métricas de visitas agregadas e anônimas, sem cookies. Base legal: legítimo interesse
          (LGPD Art. 7º, IX).
        </li>
      </ul>
      <p>
        O Fluxi não se conecta ao seu banco e não pede senhas bancárias: tudo o que aparece no app
        foi informado por você.
      </p>

      <h2>Para que usamos</h2>
      <p>
        Usamos os seus dados exclusivamente para oferecer o serviço: autenticar você, guardar e
        exibir o seu planejamento de fluxo de caixa. Não usamos seus dados para publicidade, não
        exibimos anúncios e não criamos perfis para fins de marketing.
      </p>

      <h2>Dados obtidos do Google</h2>
      <p>
        Os dados obtidos das APIs do Google (nome, e-mail e foto do perfil) são usados apenas para o
        login e para identificar a sua conta no Fluxi. O uso e a transferência, pelo Fluxi, de
        informações recebidas das APIs do Google para qualquer outro aplicativo seguem a{' '}
        <a href={GOOGLE_USER_DATA_POLICY} target="_blank" rel="noopener noreferrer">
          Política de Dados do Usuário dos Serviços de API do Google
        </a>{' '}
        (Google API Services User Data Policy), incluindo os requisitos de Uso Limitado (Limited
        Use). Não vendemos esses dados, não os usamos para publicidade e não os transferimos a
        terceiros, exceto quando necessário para operar o serviço ou exigido por lei.
      </p>

      <h2>Compartilhamento</h2>
      <p>
        Não vendemos, alugamos nem cedemos seus dados a terceiros. Para operar o serviço, contamos
        com provedores de infraestrutura em nuvem e de autenticação, que tratam os dados apenas em
        nosso nome, sob obrigações de confidencialidade e segurança. Podemos compartilhar dados
        quando exigido por lei ou ordem judicial.
      </p>

      <h2>Cookies</h2>
      <p>
        Usamos apenas cookies essenciais de sessão, necessários para manter você conectado. Não
        usamos cookies de publicidade, analytics ou rastreamento.
      </p>

      <h2>Segurança</h2>
      <p>
        Os seus registros financeiros ficam acessíveis apenas para a sua própria conta. A
        comunicação entre o seu navegador e o Fluxi é criptografada em trânsito, e adotamos medidas
        técnicas e organizacionais para proteger os dados contra acesso não autorizado.
      </p>

      <h2>Retenção</h2>
      <p>
        Mantemos os seus dados enquanto a sua conta existir. Se você pedir a exclusão da conta,
        apagamos a conta e os registros financeiros associados, salvo o que a lei obrigar a guardar.
        Registros técnicos são mantidos apenas pelo tempo necessário à segurança do serviço.
      </p>

      <h2>Seus direitos (LGPD Art. 18)</h2>
      <ul>
        <li>Confirmar a existência de tratamento dos seus dados;</li>
        <li>Acessar seus dados;</li>
        <li>Corrigir dados incompletos, inexatos ou desatualizados;</li>
        <li>Solicitar a anonimização, bloqueio ou eliminação;</li>
        <li>Solicitar a portabilidade dos dados;</li>
        <li>Revogar o consentimento a qualquer momento.</li>
      </ul>
      <p>
        Para exercer qualquer direito, escreva para{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> a partir do e-mail da sua conta.
        Respondemos em até 15 dias.
      </p>

      <h2>Encarregado de dados (DPO)</h2>
      <p>
        Kayron Cabral. Contato: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Mudanças nesta política</h2>
      <p>
        Atualizações nesta política são publicadas nesta página com nova data de &quot;última
        atualização&quot;. Continuar usando o serviço após a mudança significa concordar com a nova
        versão.
      </p>

      <h2>Histórico de versões</h2>
      <ul>
        <li>
          <strong>{LAST_UPDATED}</strong>: versão inicial, em vigor a partir desta data.
        </li>
      </ul>
    </LegalPage>
  )
}
