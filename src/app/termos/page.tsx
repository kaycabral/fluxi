import { LegalPage } from '@/components/legal-page'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Termos de uso — Fluxi',
  description: 'Termos de uso do Fluxi.',
}

const LAST_UPDATED = '24/11/2026'
const CONTACT_EMAIL = 'contato@cbrl.dev'

export default function TermosPage() {
  return (
    <LegalPage title="Termos de uso" lastUpdated={LAST_UPDATED}>
      <h2>1. Aceitação</h2>
      <p>
        Ao acessar o Fluxi você concorda com estes termos. Se discordar de qualquer parte, não use o
        serviço.
      </p>

      <h2>2. Sobre o serviço</h2>
      <p>
        O Fluxi é uma ferramenta gratuita, para uso pessoal, de planejamento do fluxo de caixa: você
        cadastra lançamentos (inclusive recorrentes), acompanha o saldo projetado ao longo do tempo,
        as contas a pagar e o orçamento. É preciso entrar com uma conta Google para usar.
      </p>

      <h2>3. Sem aconselhamento financeiro</h2>
      <p>
        O Fluxi apenas organiza e projeta as informações que você mesmo cadastra. Nada no serviço
        constitui aconselhamento financeiro, contábil, jurídico ou de investimentos.
      </p>

      <h2>4. Suas responsabilidades</h2>
      <ul>
        <li>Você é responsável pela exatidão dos dados que cadastra;</li>
        <li>Você é responsável pelas decisões que toma com base nas projeções do app;</li>
        <li>Mantenha o acesso à sua conta Google seguro;</li>
        <li>
          Não tente abusar do serviço (acesso automatizado em massa, burlar limites, explorar falhas
          ou acessar dados de outras pessoas).
        </li>
      </ul>

      <h2>5. Serviço “como está”</h2>
      <p>
        O Fluxi é oferecido “como está”, sem garantias de disponibilidade contínua, ausência de
        erros ou adequação a um propósito específico. Na máxima extensão permitida pela lei, não
        respondemos por perdas decorrentes do uso ou da impossibilidade de uso do serviço, incluindo
        decisões financeiras tomadas com base nas projeções.
      </p>

      <h2>6. Propriedade intelectual</h2>
      <p>
        O código, o design e a marca do Fluxi são nossos. Os dados que você cadastra continuam sendo
        seus.
      </p>

      <h2>7. Encerramento</h2>
      <p>
        Você pode parar de usar o Fluxi a qualquer momento e pedir a exclusão da sua conta e dos
        seus dados conforme a <Link href="/privacidade">política de privacidade</Link>. Podemos
        suspender ou encerrar contas que violarem estes termos, ou descontinuar o serviço mediante
        aviso prévio razoável.
      </p>

      <h2>8. Mudanças</h2>
      <p>
        Atualizações nestes termos são publicadas aqui com nova data de &quot;última
        atualização&quot;. Continuar usando o serviço após a mudança significa concordar com a nova
        versão.
      </p>

      <h2>9. Foro e legislação</h2>
      <p>
        Estes termos são regidos pelas leis brasileiras. Fica eleito o foro da comarca de Manaus/AM,
        salvo quando a lei do consumidor determinar o foro do domicílio do consumidor.
      </p>

      <h2>10. Contato</h2>
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>

      <h2>Histórico de versões</h2>
      <ul>
        <li>
          <strong>{LAST_UPDATED}</strong>: versão inicial.
        </li>
      </ul>
    </LegalPage>
  )
}
