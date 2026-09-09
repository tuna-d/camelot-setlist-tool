import { useEffect, useRef, useState } from 'react'
import { selectActive, useStore } from '../store/store'

export function SetlistMenu() {
  const state = useStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const active = selectActive(state)

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function rename(id: string, current: string) {
    const name = window.prompt('Setlist adı', current)
    if (name !== null) state.renameSetlist(id, name)
  }

  function remove(id: string, name: string, count: number) {
    const sure =
      count === 0 || window.confirm(`"${name}" setindeki ${count} parça ile birlikte silinsin mi?`)
    if (sure) state.removeSetlist(id)
  }

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="btn menu-button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        setlerim · {active.name}
        <span className="menu-caret" aria-hidden="true">
          ▼
        </span>
      </button>

      {open ? (
        <div className="menu-panel" aria-label="Kayıtlı setler">
          {state.setlists.map((setlist) => (
            <div key={setlist.id} className="menu-row" aria-current={setlist.id === state.activeId}>
              <button
                type="button"
                className="menu-name"
                onClick={() => {
                  state.selectSetlist(setlist.id)
                  setOpen(false)
                }}
              >
                {setlist.name} · {setlist.entries.length}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => rename(setlist.id, setlist.name)}
                aria-label={`${setlist.name} setini yeniden adlandır`}
                title="Yeniden adlandır"
              >
                ✎
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-danger"
                onClick={() => remove(setlist.id, setlist.name, setlist.entries.length)}
                aria-label={`${setlist.name} setini sil`}
                title="Seti sil"
              >
                ✕
              </button>
            </div>
          ))}

          <hr className="menu-separator" />

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              state.newSetlist()
              setOpen(false)
            }}
          >
            + yeni set
          </button>
        </div>
      ) : null}
    </div>
  )
}
