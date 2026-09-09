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
      setNotice('Setlist panoya kopyalandı.')
    } catch {
      setNotice('Pano izni yok. Metni seçip elle kopyalaman gerekiyor.')
    }
  }

  function openOnYoutube() {
    for (const track of tracks.slice(0, MAX_YOUTUBE_TABS)) {
      window.open(youtubeSearchUrl(track), '_blank', 'noopener')
    }
    setNotice(
      tracks.length > MAX_YOUTUBE_TABS
        ? `İlk ${MAX_YOUTUBE_TABS} parça açıldı. Tarayıcı daha fazlasını engelliyor; kalanları listeden tek tek aç. Sekme açılmadıysa açılır pencere iznini ver.`
        : 'Sekmeler açıldı. Açılmadıysa tarayıcının açılır pencere iznini ver.',
    )
  }

  function downloadM3u8() {
    const withPath = tracks.filter((track) => track.location)
    if (withPath.length === 0) {
      setNotice(
        'Sette dosya yolu olan parça yok. m3u8 yalnızca rekordbox kütüphanenden gelen parçaları yazabilir.',
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
    setNotice(`${withPath.length} parça m3u8 olarak indirildi.`)
  }

  function clearAll() {
    if (tracks.length === 0) return
    if (window.confirm(`"${active.name}" setindeki ${tracks.length} parça silinsin mi?`)) {
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
    <aside className="panel col" aria-label="Setin gidişatı">
      <h3>Gidişat</h3>

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
          <p className="faint">Tempo eğrisi için sette en az iki tempolu parça gerekiyor.</p>
        )}
      </div>

      <div className="summary-stats">
        <div className="stat">
          <span className="stat-label">süre</span>
          <span className="stat-value">{formatTotal(stats.seconds)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">parça</span>
          <span className="stat-value">{stats.count}</span>
        </div>
        <div className="stat">
          <span className="stat-label">tempo</span>
          <span className="stat-value">{tempoText}</span>
        </div>
        <div className="stat">
          <span className="stat-label">zorlayan geçiş</span>
          <span
            className="stat-value"
            style={{ color: stats.rough > 0 ? 'var(--danger)' : 'var(--ok)' }}
            title={
              stats.rough > 0
                ? 'Key ya da tempo bakımından zorlayan geçişler var; listede kırmızı işaretli.'
                : 'Bütün geçişler key ve tempo toleransının içinde.'
            }
          >
            {stats.rough}
          </span>
        </div>
      </div>

      <h3>Notlar</h3>
      <textarea
        className="textarea"
        placeholder="set notu — nerede çalınacak, hangi saat, ne hissettirmeli"
        value={active.note ?? ''}
        onChange={(event) => state.setSetlistNote(event.target.value)}
      />

      <div className="row-wrap">
        <button type="button" className="btn btn-sm" onClick={() => void copyToClipboard()}>
          kopyala
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={openOnYoutube}
          disabled={tracks.length === 0}
        >
          YouTube'da aç
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
          temizle
        </button>
      </div>

      {notice ? <p className="muted">{notice}</p> : null}
    </aside>
  )
}
