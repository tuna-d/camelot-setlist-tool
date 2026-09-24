import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { NOTE_NAME, keyColor } from '../lib/camelot'
import { isFavorite } from '../lib/favorites'
import { seenIn } from '../lib/seen'
import { selectSeenIndex, useStore } from '../store/store'
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

const STARS = [1, 2, 3, 4, 5]

export interface EnergyStarsProps {
  /** Rated energy; wins over the estimate whenever present. */
  value: number | undefined
  /** Shown faintly until the DJ rates; null when the track has no tempo. */
  estimate?: number | null
  onChange: (value: number) => void
  label: string
}

export function EnergyStars({ value, estimate = null, onChange, label }: EnergyStarsProps) {
  const rated = value !== undefined
  const shown = rated ? value : (estimate ?? 0)
  const kind = rated ? 'rated' : estimate !== null ? 'estimated' : 'none'
  const summary = rated
    ? `Rated energy ${value}/5`
    : estimate !== null
      ? `Estimated energy ${estimate}/5 from the tempo within its genre — touch a star to rate it`
      : 'No tempo, so no estimate — touch a star to rate it'

  return (
    <span className="stars" role="group" aria-label={label} data-energy={kind} title={summary}>
      {STARS.map((star) => (
        <button
          key={star}
          type="button"
          className={!rated && star <= shown ? 'star star-estimated' : 'star'}
          aria-pressed={rated && star <= shown}
          aria-label={`${star} stars`}
          title={
            rated
              ? `Energy ${star}/5 — press the same star again to clear it`
              : `Rate energy ${star}/5`
          }
          onClick={(event) => {
            event.stopPropagation()
            onChange(star)
          }}
        >
          {star <= shown ? '★' : '☆'}
        </button>
      ))}
    </span>
  )
}

/** Drawn rather than typed: "♥" turns into a colour emoji on some phones. */
export function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="heart-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 20.5s-7.5-4.6-9.4-9.3C1.4 8.2 3.3 4.5 6.8 4.5c2.1 0 3.6 1.2 5.2 3.1 1.6-1.9 3.1-3.1 5.2-3.1 3.5 0 5.4 3.7 4.2 6.7-1.9 4.7-9.4 9.3-9.4 9.3Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function FavoriteButton({ track }: { track: Track }) {
  const favorites = useStore((state) => state.favorites)
  const toggleFavorite = useStore((state) => state.toggleFavorite)
  const active = isFavorite(favorites, track)

  return (
    <button
      type="button"
      className="fav-btn"
      aria-pressed={active}
      aria-label={active ? `Remove ${track.title} from favorites` : `Add ${track.title} to favorites`}
      title={active ? 'In your favorites — press to remove' : 'Add to favorites'}
      onClick={(event) => {
        // Rows select the track on click; the heart must not move the cursor.
        event.stopPropagation()
        toggleFavorite(track)
      }}
    >
      <HeartIcon filled={active} />
    </button>
  )
}

function SeenIcon() {
  return (
    <svg className="seen-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Marks a track already in another set; renders nothing otherwise. The arrow
    hints at why it matters (it may already be downloaded), the text names the sets. */
export function SeenBadge({ track }: { track: Track }) {
  const index = useStore(selectSeenIndex)
  const sets = seenIn(index, track)
  if (sets.length === 0) return null

  const label = `Already in another set: ${sets.join(', ')}`
  return (
    <span className="seen-badge" role="img" aria-label={label} title={label}>
      <SeenIcon />
    </span>
  )
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
        <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">
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
        className="link-btn link-bp"
        href={`https://www.beatport.com/search?q=${term}`}
        target="_blank"
        rel="noreferrer"
        title="Search on Beatport"
      >
        BP
      </a>
      <a
        className="link-btn link-yt"
        href={`https://www.youtube.com/results?search_query=${term}`}
        target="_blank"
        rel="noreferrer"
        title="Search on YouTube"
      >
        YT
      </a>
    </span>
  )
}

export function youtubeSearchUrl(track: Track): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(searchTerm(track))}`
}
