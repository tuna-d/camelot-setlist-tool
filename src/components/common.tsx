import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { NOTE_NAME, keyColor } from '../lib/camelot'
import { formatBpm } from '../lib/ui'
import type { Track } from '../lib/types'

export function KeyChip({ code }: { code: string | null }) {
  const name = code ? NOTE_NAME[code] : null
  return (
    <span className="key-chip" title={name ? `${code} · ${name}` : 'Key bilinmiyor'}>
      <span className="key-dot" style={{ background: keyColor(code) }} />
      {code ?? '—'}
      {name ? <span className="faint">{name}</span> : null}
    </span>
  )
}

export function Bpm({ value }: { value: number | null | undefined }) {
  return <span className="bpm">{formatBpm(value)}</span>
}

export interface DialogProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  actions?: ReactNode
}

export function Dialog({ open, title, onClose, children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose}>
      <div className="dialog-head">
        <h2>{title}</h2>
        <span className="spacer" />
        {actions}
        <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Kapat">
          ✕
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  )
}

function searchTerm(track: Track): string {
  return [track.artist, track.title].filter(Boolean).join(' ')
}

export function TrackLinks({ track }: { track: Track }) {
  const term = encodeURIComponent(searchTerm(track))
  return (
    <span className="track-links">
      <a
        href={`https://www.beatport.com/search?q=${term}`}
        target="_blank"
        rel="noreferrer"
        title="Beatport'ta ara"
      >
        BP
      </a>
      <a
        href={`https://www.youtube.com/results?search_query=${term}`}
        target="_blank"
        rel="noreferrer"
        title="YouTube'da ara"
      >
        YT
      </a>
    </span>
  )
}

export function youtubeSearchUrl(track: Track): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(searchTerm(track))}`
}
