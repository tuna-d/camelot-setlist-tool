export interface AuthProblem {
  message?: string
  code?: string
  status?: number
}

const RULES: { match: RegExp; text: string }[] = [
  {
    match: /invalid login credentials/i,
    text: 'Wrong email or password. If you forgot the password you may need a new account.',
  },
  {
    match: /email not confirmed/i,
    text: 'Your email is not confirmed yet. Click the link in your inbox, then try again.',
  },
  {
    match: /user already registered|already been registered/i,
    text: 'That email is already registered. Sign in instead of signing up.',
  },
  {
    match: /password should be at least/i,
    text: 'Password is too short. Use at least 6 characters.',
  },
  {
    match: /unable to validate email|invalid email/i,
    text: 'That email address looks invalid. Check the spelling.',
  },
  {
    match: /rate limit|too many requests|over_email_send_rate_limit/i,
    text: 'Too many attempts. Wait a few minutes and try again.',
  },
  {
    match: /provider is not enabled|oauth/i,
    text: 'This sign-in method is not enabled in the Supabase project. Turn it on under Authentication → Providers.',
  },
  {
    match: /failed to fetch|network/i,
    text: 'Could not reach the server. Check your connection; you can keep working as a guest.',
  },
]

export function authMessage(problem: AuthProblem | null | undefined): string {
  const raw = problem?.message?.trim() ?? ''
  if (!raw) return 'Something unknown went wrong while signing in. Try again.'
  const rule = RULES.find((item) => item.match.test(raw))
  if (rule) return rule.text
  return `Could not sign in: ${raw}. Try again or use another method.`
}
