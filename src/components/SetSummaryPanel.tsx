import { useMemo, useState } from 'react'
import { toM3u8 } from '../lib/rekordbox'
import { setStats } from '../lib/setstats'
import { formatBpm, formatTotal } from '../lib/ui'
import { selectActive, selectEntries, useStore } from '../store/store'
import { TempoCurve } from './TempoCurve'
import { youtubeSearchUrl } from './common'
import type { Track } from '../lib/types'

const MAX_YOUTUBE_TABS = 8

function setlistText(tracks: Track[]): string {
  return tracks
    .map((track, index) => {
      const bpm = track.bpm === null ? '—' : track.bpm
      return `${index + 1}. ${track.artist} - ${track.title} · ${bpm} BPM · ${track.key ?? '—'}`
    })
    .join('\n')
}

export function SetSummaryPanel() {
  const state = useStore()
  const [notice, setNotice] = useState<string | null>(null)

  const active = selectActive(state)
  const tracks = useMemo(() => selectEntries(state), [state])
  const stats = useMemo(() => setStats(tracks, state.tolerance), [tracks, state.tolerance])

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(setlistText(tracks))
      setNotice('Setlist copied to the clipboard.')
    } catch {
      setNotice('No clipboard permission. Select the text and copy it by hand.')
    }
  }

  function openOnYoutube() {
    for (const track of tracks.slice(0, MAX_YOUTUBE_TABS)) {
      window.open(youtubeSearchUrl(track), '_blank', 'noopener')
    }
    setNotice(
      tracks.length > MAX_YOUTUBE_TABS
        ? `Opened the first ${MAX_YOUTUBE_TABS} tracks. The browser blocks more; open the rest one by one from the list. If no tab opened, allow pop-ups.`
        : 'Tabs opened. If nothing appeared, allow pop-ups in your browser.',
    )
  }

  function downloadM3u8() {
    const withPath = tracks.filter((track) => track.location)
    if (withPath.length === 0) {
      setNotice(
        'No track in the set has a file path. m3u8 can only write tracks that came from your rekordbox library.',
      )
      return
    }
    const blob = new Blob([toM3u8(tracks, active.name)], { type: 'audio/x-mpegurl' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${active.name}.m3u8`
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice(`${withPath.length} tracks downloaded as m3u8.`)
  }

  function clearAll() {
    if (tracks.length === 0) return
    if (window.confirm(`Delete the ${tracks.length} tracks in "${active.name}"?`)) {
      state.clearSetlist()
      setNotice('Set temizlendi.')
    }
  }

  const tempoText =
    stats.minBpm === null
      ? '—'
      : stats.minBpm === stats.maxBpm
        ? formatBpm(stats.minBpm)
        : `${formatBpm(stats.minBpm)}–${formatBpm(stats.maxBpm)}`

  return (
    <aside className="panel col summary-panel" aria-label="Set flow">
      <h3>Flow</h3>

      <div className="curve-card">
        {tracks.length > 1 ? (
          <TempoCurve
            points={tracks.map((track) => ({
              bpm: track.bpm,
              key: track.key,
              label: `${track.artist} - ${track.title}`,
            }))}
            height={80}
          />
        ) : (
          <p className="faint">The tempo curve needs at least two tracks with a tempo.</p>
        )}
      </div>

      <div className="summary-stats">
        <div className="stat">
          <span className="stat-label">length</span>
          <span className="stat-value">{formatTotal(stats.seconds)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">tracks</span>
          <span className="stat-value">{stats.count}</span>
        </div>
        <div className="stat">
          <span className="stat-label">tempo</span>
          <span className="stat-value">{tempoText}</span>
        </div>
        <div className="stat">
          <span className="stat-label">rough transitions</span>
          <span
            className="stat-value"
            style={{ color: stats.rough > 0 ? 'var(--danger)' : 'var(--ok)' }}
            title={
              stats.rough > 0
                ? 'Some transitions strain the key or the tempo; they are flagged red in the list.'
                : 'Every transition is inside the key and tempo tolerance.'
            }
          >
            {stats.rough}
          </span>
        </div>
      </div>

      <h3>Notes</h3>
      <textarea
        className="textarea"
        placeholder="set note — where it plays, what time, how it should feel"
        value={active.note ?? ''}
        onChange={(event) => state.setSetlistNote(event.target.value)}
      />

      <div className="row-wrap">
        <button type="button" className="btn btn-sm" onClick={() => void copyToClipboard()}>
          copy
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={openOnYoutube}
          disabled={tracks.length === 0}
        >
          open on YouTube
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={downloadM3u8}
          disabled={tracks.length === 0}
        >
          .m3u8
        </button>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-sm btn-danger"
          onClick={clearAll}
          disabled={tracks.length === 0}
        >
          clear
        </button>
      </div>

      {notice ? <p className="muted">{notice}</p> : null}
    </aside>
  )
}
