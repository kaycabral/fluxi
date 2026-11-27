import { withConnectedBanks } from '@/features/ledger/core/dashboard'
import { describe, expect, it } from 'vitest'
import {
  connectionBankKey,
  connectionHealth,
  connectionStatusOf,
  healthByBank,
  lastSyncLabel,
  NEVER_CHECKED,
  oldestCheck,
  updatedLabel,
  worstHealth,
  type ConnectionStatus,
} from './health'

// 2026-11-26 10:00 in São Paulo (UTC-3).
const NOW = new Date('2026-11-26T13:00:00.000Z')

const healthy: ConnectionStatus = {
  itemStatus: 'UPDATED',
  executionStatus: 'SUCCESS',
  errorCode: null,
  // 06:02 in São Paulo.
  lastUpdatedAt: '2026-11-26T09:02:00.000Z',
  nextSyncAt: '2026-11-27T09:00:00.000Z',
  consentExpiresAt: '2027-06-01T00:00:00.000Z',
  institutionHealth: 'ONLINE',
  checkedAt: '2026-11-26T09:30:00.000Z',
}

const health = (patch: Partial<ConnectionStatus>) => connectionHealth({ ...healthy, ...patch }, NOW)

describe('connectionHealth', () => {
  it('is ok when UPDATED and fresh, with the next update', () => {
    expect(health({})).toEqual({
      level: 'ok',
      reason: 'Atualizada hoje às 06:02',
      inProgress: false,
      next: 'Próxima atualização: amanhã às 06:00',
      checkedAt: '2026-11-26T09:30:00.000Z',
    })
  })

  it('says yesterday within 36h and omits a past or missing next update', () => {
    const h = health({ lastUpdatedAt: '2026-11-25T12:00:00.000Z', nextSyncAt: null })
    expect(h).toMatchObject({ level: 'ok', reason: 'Atualizada ontem às 09:00', next: null })
    expect(health({ nextSyncAt: '2026-11-25T00:00:00.000Z' }).next).toBeNull()
    expect(health({ nextSyncAt: '2026-11-29T09:00:00.000Z' }).next).toBe(
      'Próxima atualização: 29/11 às 06:00',
    )
    expect(health({ nextSyncAt: '2026-11-26T20:00:00.000Z' }).next).toBe(
      'Próxima atualização: hoje às 17:00',
    )
  })

  it('is unknown when never checked', () => {
    expect(health({ checkedAt: null })).toMatchObject({
      level: 'unknown',
      reason: 'Ainda não verificada pela sincronização',
    })
    expect(health({ itemStatus: null }).level).toBe('unknown')
  })

  it.each([
    { itemStatus: 'LOGIN_ERROR' },
    { itemStatus: 'WAITING_USER_INPUT' },
    { itemStatus: 'OUTDATED', executionStatus: 'INVALID_CREDENTIALS' },
    { itemStatus: 'OUTDATED', errorCode: 'CONSENT_REVOKED' },
  ])('asks to reconnect on %o', (patch) => {
    expect(health(patch)).toMatchObject({
      level: 'error',
      reason: 'O banco pediu nova autorização: reconecte no Meu Pluggy',
    })
  })

  it('is an error when the consent expired', () => {
    const expired = { level: 'error', reason: 'Consentimento vencido: renove no Meu Pluggy' }
    expect(health({ consentExpiresAt: '2026-11-26T12:00:00.000Z' })).toMatchObject(expired)
    expect(health({ itemStatus: 'OUTDATED', executionStatus: 'CONSENT_EXPIRED' })).toMatchObject(
      expired,
    )
  })

  it.each([{ executionStatus: 'ERROR' }, { errorCode: 'SITE_NOT_AVAILABLE' }])(
    'is an error when the execution failed (%o)',
    (patch) => {
      expect(health({ itemStatus: 'OUTDATED', ...patch })).toMatchObject({
        level: 'error',
        reason: 'A última atualização falhou',
      })
    },
  )

  it('warns while updating, with the in-progress flag', () => {
    expect(health({ itemStatus: 'UPDATING' })).toMatchObject({
      level: 'warn',
      reason: 'Atualizando agora…',
      inProgress: true,
    })
  })

  it('warns when OUTDATED', () => {
    expect(health({ itemStatus: 'OUTDATED', executionStatus: 'PARTIAL_SUCCESS' }).reason).toBe(
      'Dados desatualizados: a última atualização não terminou (última hoje às 06:02)',
    )
    expect(health({ itemStatus: 'OUTDATED', lastUpdatedAt: null }).reason).toBe(
      'Dados desatualizados: a última atualização não terminou',
    )
  })

  it('warns when our sync has not checked it in 36h', () => {
    expect(health({ checkedAt: '2026-11-24T09:00:00.000Z' })).toMatchObject({
      level: 'warn',
      reason: 'Última verificação do Fluxi: há 2 dias',
    })
  })

  it('warns when the last update is older than 36h or unknown', () => {
    expect(health({ lastUpdatedAt: '2026-11-24T09:02:00.000Z' })).toMatchObject({
      level: 'warn',
      reason: 'Atualizada há 2 dias',
    })
    expect(health({ lastUpdatedAt: null }).reason).toBe('Sem data da última atualização')
  })

  it('warns when the institution is not online', () => {
    expect(health({ institutionHealth: 'UNSTABLE' })).toMatchObject({
      level: 'warn',
      reason: 'Instituição instável no momento',
    })
    expect(health({ institutionHealth: null }).level).toBe('ok')
  })

  it('warns when the consent expires within 30 days', () => {
    expect(health({ consentExpiresAt: '2026-12-08T13:00:00.000Z' }).reason).toBe(
      'Consentimento vence em 12 dias',
    )
    expect(health({ consentExpiresAt: '2026-11-27T00:00:00.000Z' }).reason).toBe(
      'Consentimento vence em 1 dia',
    )
    expect(health({ consentExpiresAt: null }).level).toBe('ok')
  })
})

describe('updatedLabel', () => {
  it('counts calendar days in São Paulo', () => {
    // 01:00 UTC on the 26th is still the 25th in São Paulo.
    expect(updatedLabel(new Date('2026-11-26T01:00:00.000Z'), NOW)).toBe('ontem às 22:00')
  })
})

describe('connectionStatusOf', () => {
  it('serializes stored timestamps', () => {
    expect(
      connectionStatusOf({
        itemStatus: 'UPDATED',
        executionStatus: null,
        errorCode: null,
        lastUpdatedAt: new Date('2026-11-26T09:02:00.000Z'),
        nextSyncAt: null,
        consentExpiresAt: null,
        institutionHealth: 'ONLINE',
        checkedAt: new Date('2026-11-26T09:30:00.000Z'),
      }),
    ).toEqual({
      ...NEVER_CHECKED,
      itemStatus: 'UPDATED',
      lastUpdatedAt: '2026-11-26T09:02:00.000Z',
      institutionHealth: 'ONLINE',
      checkedAt: '2026-11-26T09:30:00.000Z',
    })
  })
})

describe('healthByBank', () => {
  it('keys linked banks by id (worst wins), unlinked ones by institution, skips the rest', () => {
    const byBank = healthByBank(
      [
        { bankIds: ['b1', 'b2'], institution: 'Inter', status: healthy },
        {
          bankIds: ['b2'],
          institution: 'Inter',
          status: { ...healthy, itemStatus: 'LOGIN_ERROR' },
        },
        {
          bankIds: [],
          institution: 'Nubank Empresas',
          status: { ...healthy, itemStatus: 'UPDATING' },
        },
        { bankIds: [], institution: null, status: healthy },
      ],
      NOW,
    )
    expect(Object.keys(byBank).sort()).toEqual(['b1', 'b2', connectionBankKey('Nubank Empresas')])
    expect(byBank.b1?.level).toBe('ok')
    expect(byBank.b2?.level).toBe('error')
    expect(byBank[connectionBankKey('Nubank Empresas')]?.inProgress).toBe(true)
  })

  it('uses the same key as the dashboard for unlinked connections', () => {
    expect(withConnectedBanks([], ['Nubank'])[0]?.bankId).toBe(connectionBankKey('Nubank'))
  })
})

describe('worstHealth', () => {
  it('picks the most severe', () => {
    const ok = health({})
    const warn = health({ itemStatus: 'UPDATING' })
    const error = health({ itemStatus: 'LOGIN_ERROR' })
    expect(worstHealth([ok, error, warn])).toBe(error)
    expect(worstHealth([ok, warn])).toBe(warn)
    expect(worstHealth([])).toBeNull()
  })
})

describe('lastSyncLabel', () => {
  it('says today and yesterday with the time, the full date past that', () => {
    // 06:00 in São Paulo.
    expect(lastSyncLabel('2026-11-26T09:00:00.000Z', '2026-11-26')).toBe('hoje, 06:00')
    expect(lastSyncLabel('2026-11-26T09:00:00.000Z', '2026-11-27')).toBe('ontem, 06:00')
    expect(lastSyncLabel('2026-11-26T09:00:00.000Z', '2026-11-29')).toBe('26/11 às 06:00')
    expect(lastSyncLabel('2025-12-30T09:00:00.000Z', '2026-01-05')).toBe('30/12/2025 às 06:00')
  })

  it('uses the São Paulo day, not UTC', () => {
    // 02:30 UTC on the 27th is 23:30 of the 26th in São Paulo.
    expect(lastSyncLabel('2026-11-27T02:30:00.000Z', '2026-11-27')).toBe('ontem, 23:30')
  })
})

describe('oldestCheck', () => {
  it('is the oldest instant, or null when one was never read', () => {
    expect(oldestCheck(['2026-11-26T09:00:00.000Z', '2026-11-25T09:00:00.000Z'])).toBe(
      '2026-11-25T09:00:00.000Z',
    )
    expect(oldestCheck(['2026-11-26T09:00:00.000Z', null])).toBeNull()
    expect(oldestCheck([])).toBeNull()
  })
})
