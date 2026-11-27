import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const alt = 'Fluxi — seu fluxo de caixa pessoal'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpengraphImage() {
  const icon = await readFile(join(process.cwd(), 'src/app/icon.svg'))
  const src = `data:image/svg+xml;base64,${icon.toString('base64')}`

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 64,
        padding: '0 96px',
        background: '#F3FFF6',
        color: '#0B3D32',
      }}
    >
      <img
        src={src}
        width={260}
        height={260}
        alt=""
        style={{ borderRadius: 60, boxShadow: '0 24px 48px rgba(0,0,0,0.18)' }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
        <div style={{ fontSize: 112, fontWeight: 700, letterSpacing: -4, lineHeight: 1 }}>
          Fluxi
        </div>
        <div style={{ fontSize: 44, lineHeight: 1.2, opacity: 0.92 }}>
          seu fluxo de caixa pessoal
        </div>
        <div
          style={{
            display: 'flex',
            width: 120,
            height: 10,
            borderRadius: 5,
            background: '#0B5D4B',
            marginTop: 12,
          }}
        />
      </div>
    </div>,
    size,
  )
}
