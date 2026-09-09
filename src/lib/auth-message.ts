export interface AuthProblem {
  message?: string
  code?: string
  status?: number
}

const RULES: { match: RegExp; text: string }[] = [
  {
    match: /invalid login credentials/i,
    text: 'E-posta ya da parola yanlış. Parolanı unuttuysan yeni bir hesap açman gerekebilir.',
  },
  {
    match: /email not confirmed/i,
    text: 'E-posta adresin henüz doğrulanmamış. Gelen kutuna gelen bağlantıya tıkla, sonra tekrar dene.',
  },
  {
    match: /user already registered|already been registered/i,
    text: 'Bu e-posta zaten kayıtlı. Kayıt yerine giriş yap.',
  },
  {
    match: /password should be at least/i,
    text: 'Parola çok kısa. En az 6 karakter yaz.',
  },
  {
    match: /unable to validate email|invalid email/i,
    text: 'E-posta adresi geçersiz görünüyor. Yazımını kontrol et.',
  },
  {
    match: /rate limit|too many requests|over_email_send_rate_limit/i,
    text: 'Çok fazla deneme yapıldı. Birkaç dakika bekleyip tekrar dene.',
  },
  {
    match: /provider is not enabled|oauth/i,
    text: 'Bu giriş yöntemi Supabase projesinde açık değil. Authentication → Providers altından etkinleştir.',
  },
  {
    match: /failed to fetch|network/i,
    text: 'Sunucuya ulaşılamadı. Bağlantını kontrol et; misafir olarak çalışmaya devam edebilirsin.',
  },
]

export function authMessage(problem: AuthProblem | null | undefined): string {
  const raw = problem?.message?.trim() ?? ''
  if (!raw) return 'Giriş sırasında bilinmeyen bir sorun çıktı. Tekrar dene.'
  const rule = RULES.find((item) => item.match.test(raw))
  if (rule) return rule.text
  return `Giriş yapılamadı: ${raw}. Tekrar dene ya da başka bir yöntemle gir.`
}
