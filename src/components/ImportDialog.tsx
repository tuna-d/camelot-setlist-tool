import { useState } from 'react'
import { RekordboxParseError, parseRekordboxXml } from '../lib/rekordbox'
import type { ImportStats } from '../lib/rekordbox'
import { useStore } from '../store/store'
import { Dialog } from './common'

interface Summary extends ImportStats {
  tracks: number
  playlists: number
  version: string | null
}

export interface ImportDialogProps {
  open: boolean
  onClose: () => void
}

export function ImportDialog({ open, onClose }: ImportDialogProps) {
  const importLibrary = useStore((state) => state.importLibrary)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleFile(file: File | null | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    setSummary(null)
    try {
      const text = await file.text()
      const library = parseRekordboxXml(text)
      importLibrary(library)
      setSummary({
        ...library.stats,
        tracks: library.tracks.length,
        playlists: library.playlists.length,
        version: library.version,
      })
    } catch (problem) {
      setError(
        problem instanceof RekordboxParseError
          ? problem.message
          : `Could not read the file: ${problem instanceof Error ? problem.message : String(problem)}. Try another file.`,
      )
    } finally {
      setBusy(false)
    }
  }

  function close() {
    setSummary(null)
    setError(null)
    setDragging(false)
    onClose()
  }

  return (
    <Dialog open={open} title="Import rekordbox collection" onClose={close}>
      <div
        className={dragging ? 'dropzone dropzone-active' : 'dropzone'}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          void handleFile(event.dataTransfer.files[0])
        }}
      >
        <p>Drag the XML file here</p>
        <p className="faint">or</p>
        <input
          type="file"
          accept=".xml,text/xml,application/xml"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <p className="faint">
          Pick the file produced by rekordbox → File → Export Collection (rekordbox xml).
        </p>
      </div>

      {busy ? <p className="muted">Reading the file…</p> : null}

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {summary ? (
        <div className="col" role="status">
          <h3>Imported</h3>
          <p>
            <strong>{summary.tracks}</strong> tracks, <strong>{summary.playlists}</strong> playlists
            {summary.version ? ` · rekordbox ${summary.version}` : ''}
          </p>
          <ul className="muted">
            <li>{summary.missingBpm} tracks have no tempo</li>
            <li>{summary.missingKey} tracks have no key</li>
            <li>{summary.missingLocation} tracks have no file path</li>
            {summary.skipped > 0 ? <li>{summary.skipped} entries were skipped for having no id</li> : null}
            {summary.ghostReferences > 0 ? (
              <li>{summary.ghostReferences} playlist references were not in the collection</li>
            ) : null}
          </ul>
          {summary.missingBpm + summary.missingKey > 0 ? (
            <p className="faint">
              Tracks without a tempo or a key never enter the suggestion pool. To use them all,
              analyse them in rekordbox and export again.
            </p>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={close}>
            done
          </button>
        </div>
      ) : null}
    </Dialog>
  )
}
