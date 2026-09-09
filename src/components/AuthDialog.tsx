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
    <Dialog open={open} title={mode === 'signin' ? 'Sign in' : 'Create account'} onClose={close}>
      {auth.status === 'disabled' ? (
        <p className="muted">
          Sign-in is off in this setup: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not
          defined. You can keep using the app as a guest; your sets will stay in this browser
          only.
        </p>
      ) : (
        <div className="col">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void auth.signInWithGoogle()}
            disabled={auth.busy}
          >
            Continue with Google
          </button>

          <p className="faint auth-separator">or with an email</p>

          <input
            className="input"
            type="email"
            autoComplete="email"
            placeholder="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            className="input"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder="password (at least 6 characters)"
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
            {auth.busy ? 'working…' : mode === 'signin' ? 'sign in' : 'create account'}
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              auth.setMessage(null)
            }}
          >
            {mode === 'signin' ? 'no account yet? create one' : 'already have an account? sign in'}
          </button>

          {auth.message ? (
            <p className="error" role="alert">
              {auth.message}
            </p>
          ) : null}

          <p className="faint">
            You can build sets without signing in; then your sets are not saved to the server,
            they stay in this browser.
          </p>
        </div>
      )}
    </Dialog>
  )
}
