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
          : `Dosya okunamadı: ${problem instanceof Error ? problem.message : String(problem)}. Başka bir dosya dene.`,
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
    <Dialog open={open} title="rekordbox koleksiyonu içe aktar" onClose={close}>
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
        <p>XML dosyasını buraya sürükle</p>
        <p className="faint">ya da</p>
        <input
          type="file"
          accept=".xml,text/xml,application/xml"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <p className="faint">
          rekordbox → Dosya → Koleksiyonu dışa aktar (rekordbox xml) ile çıkan dosyayı seç.
        </p>
      </div>

      {busy ? <p className="muted">Dosya okunuyor…</p> : null}

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {summary ? (
        <div className="col" role="status">
          <h3>İçe aktarıldı</h3>
          <p>
            <strong>{summary.tracks}</strong> parça, <strong>{summary.playlists}</strong> playlist
            {summary.version ? ` · rekordbox ${summary.version}` : ''}
          </p>
          <ul className="muted">
            <li>{summary.missingBpm} parçanın temposu yok</li>
            <li>{summary.missingKey} parçanın key’i yok</li>
            <li>{summary.missingLocation} parçanın dosya yolu yok</li>
            {summary.skipped > 0 ? <li>{summary.skipped} kayıt kimliksiz olduğu için atlandı</li> : null}
            {summary.ghostReferences > 0 ? (
              <li>{summary.ghostReferences} playlist atıfı koleksiyonda bulunamadı</li>
            ) : null}
          </ul>
          {summary.missingBpm + summary.missingKey > 0 ? (
            <p className="faint">
              Tempo ya da key’i olmayan parçalar öneri havuzuna girmiyor. Hepsini kullanmak için
              rekordbox’ta analiz edip yeniden dışa aktar.
            </p>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={close}>
            tamam
          </button>
        </div>
      ) : null}
    </Dialog>
  )
}
