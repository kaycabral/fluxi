'use client'

import {
  ButtonSkeleton,
  MoneySkeleton,
  TextSkeleton,
} from '@/app/painel/_components/skeletons/parts'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  List,
  Main,
  Skeleton,
  Typography,
} from '@cbrl/design'
import { ListChecks, Search, SlidersHorizontal } from 'lucide-react'

/** Rows shown while loading: a screenful (the real page lists 50 per page). */
const ROWS = Array.from({ length: 12 }, (_, i) => i)

/** `/painel/transacoes` loading: the header, the search bar and the list rows blank. */
export function TransactionsSkeleton() {
  return (
    <Main aria-busy="true" aria-label="Carregando">
      <div className="grid grid-cols-1 gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <Typography variant="pageTitle" as="h1">
              Transações
            </Typography>
            <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
              <TextSkeleton sample="0000 transações" />
              <span className="flex gap-1.5 whitespace-nowrap">
                Saldo <MoneySkeleton sample="R$ 000.000,00" />
              </span>
              <span className="flex gap-1.5 whitespace-nowrap">
                Entradas <MoneySkeleton sample="R$ 0.000.000,00" />
              </span>
              <span className="flex gap-1.5 whitespace-nowrap">
                Saídas <MoneySkeleton sample="-R$ 000.000,00" />
              </span>
            </div>
          </div>
          <ButtonSkeleton label="Nova transação" />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <InputGroup className="sm:max-w-xs">
            <InputGroupAddon align="inline-start">
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              disabled
              placeholder="Buscar por descrição"
              aria-label="Buscar transações"
            />
          </InputGroup>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <ButtonSkeleton variant="outline" size="sm" icon={<ListChecks />} label="Selecionar" />
            <ButtonSkeleton
              variant="outline"
              size="sm"
              icon={<SlidersHorizontal />}
              label="Filtros"
            />
          </div>
        </div>
        <List
          items={ROWS}
          getKey={(i) => String(i)}
          renderItem={() => ({
            leading: <Skeleton className="size-2.5 shrink-0 rounded-xs" />,
            title: <TextSkeleton sample="Descrição da transação" />,
            badge: (
              <span className="hidden gap-1 sm:flex">
                <Skeleton className="h-5 w-16 rounded-4xl" />
              </span>
            ),
            description: <TextSkeleton sample="Banco · Conta · Categoria" />,
            meta: <TextSkeleton sample="00/00/00" />,
            trailing: <MoneySkeleton sample="-R$ 000,00" />,
          })}
        />
      </div>
    </Main>
  )
}
