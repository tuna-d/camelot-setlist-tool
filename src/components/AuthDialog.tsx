import { useState } from 'react'
import { useAuth } from '../store/auth'
import { Dialog } from './common'

export interface AuthDialogProps {
  open: boolean
  onClose: () => void
}

export function AuthDialog({ open, onClose }: AuthDialogProps) {
  const auth = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function close() {
    setEmail('')
    setPassword('')
    setMode('signin')
    auth.setMessage(null)
    onClose()
  }

  async function submit() {
    if (mode === 'signin') await auth.signInWithPassword(email.trim(), password)
    else await auth.signUpWithPassword(email.trim(), password)
    if (useAuth.getState().status === 'signed-in') close()
  }

  const ready = email.trim().length > 3 && password.length >= 6

  return (
    <Dialog open={open} title={mode === 'signin' ? 'Giriş yap' : 'Hesap aç'} onClose={close}>
      {auth.status === 'disabled' ? (
        <p className="muted">
          Giriş bu kurulumda kapalı: VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY tanımlı değil.
          Uygulamayı misafir olarak kullanmaya devam edebilirsin; setlerin yalnızca bu tarayıcıda
          kalır.
        </p>
      ) : (
        <div className="col">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void auth.signInWithGoogle()}
            disabled={auth.busy}
          >
            Google ile devam et
          </button>

          <p className="faint auth-separator">ya da e-posta ile</p>

          <input
            className="input"
            type="email"
            autoComplete="email"
            placeholder="e-posta"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            className="input"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder="parola (en az 6 karakter)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && ready) void submit()
            }}
          />

          <button
            type="button"
            className="btn"
            onClick={() => void submit()}
            disabled={!ready || auth.busy}
          >
            {auth.busy ? 'bekle…' : mode === 'signin' ? 'giriş yap' : 'hesap aç'}
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              auth.setMessage(null)
            }}
          >
            {mode === 'signin' ? 'hesabın yok mu? hesap aç' : 'zaten hesabın var mı? giriş yap'}
          </button>

          {auth.message ? (
            <p className="error" role="alert">
              {auth.message}
            </p>
          ) : null}

          <p className="faint">
            Giriş yapmadan da set kurabilirsin; o zaman setlerin sunucuya kaydedilmez, yalnızca bu
            tarayıcıda durur.
          </p>
        </div>
      )}
    </Dialog>
  )
}
