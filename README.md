# Camelot Setlist

rekordbox kütüphanenden **BPM** ve **Camelot key** uyumuna göre DJ setlisti kuran web
uygulaması. Birden çok kullanıcıyı destekler; her kullanıcı yalnızca kendi verisini görür.

Ne yapar:

- rekordbox koleksiyon XML'ini içe aktarır (parçalar, playlistler, iç içe klasörler).
- İmleçteki parçaya harmonik ve tempo olarak uyan adayları puanlayıp sıralar.
- Enerji eğrisi seçtirerek (yükselen / kemer / düz / inen) tüm seti otomatik kurar.
- Setlisti panoya, `.m3u8` dosyasına ya da YouTube aramalarına aktarır.
- Kütüphanende olmayan parçalar için Beatport Top 100'lerinden derlenmiş bir keşif
  katalogu ve GetSongBPM üzerinden tek parça araması sunar.

Arayüz Türkçe. Değişken ve fonksiyon adları İngilizce.

## Hızlı başlangıç

```bash
npm install
npm run dev
```

Hiçbir ortam değişkeni olmadan da çalışır: giriş kapalı kalır, uygulama misafir kipine
düşer ve her şey tarayıcının `localStorage`'ında durur.

```bash
npm test           # vitest (297 test)
npm run typecheck  # tsc -b --noEmit
npm run lint       # eslint
npm run build      # tsc -b && vite build
```

## Hesaplar ve misafir kipi

Üç durum var:

| durum | ne olur |
|---|---|
| **giriş kapalı** (Supabase tanımsız) | Uygulama tam çalışır, kayıt yalnızca tarayıcıda. Üstte uyarı bandı durur. |
| **misafir** (giriş var ama yapılmamış) | Aynı: set kurulabilir, öneriler gelir, **sunucuya hiçbir şey yazılmaz**. Banttan giriş yapılabilir. |
| **girişli** | Kütüphane, setlistler ve ayarlar hesaba kaydedilir; başka cihazda aynı yerden devam edilir. |

Giriş yöntemleri: **Google ile devam et** ve **e-posta + parola**.

Misafirken kurduğun çalışma giriş yaptığında **hesabındaki kaydın üzerine yazılmaz**.
Hesaptaki kayıt yüklenir ve "misafirken kurduğun seti hesabına taşı" seçeneği çıkar;
kararı sen verirsin.

## Camelot çemberi ve puanlama

Çemberde bir numara ilerlemek bir beşli, yani **7 yarım ton**. Buradan `+7 numara ≡ +1
yarım ton` ve `+5 numara ≡ −1 yarım ton` çıkar. A halkası minör, B halkası majör:
`8A = Am`, `8B = C`.

Tanımlı geçişler (`src/lib/camelot.ts` içindeki `RELATIONS` tablosu):

| id | etiket | 8A'dan | puan | varsayılan |
|---|---|---|---|---|
| `same` | Aynı key | 8A | 100 | açık |
| `up` | +1 · enerji ↑ | 9A | 94 | açık |
| `down` | −1 · yumuşak | 7A | 92 | açık |
| `relative` | Relatif | 8B | 88 | açık |
| `boost` | +2 · sıçrama | 10A | 72 | açık |
| `diagonal` | Diyagonal | 9B | 64 | kapalı |
| `semiUp` | +7 · yarım ton ↑ | 3A | 62 | kapalı |
| `semiDown` | −7 · yarım ton ↓ | 1A | 56 | kapalı |

Bir adayın puanı:

```
puan = ilişki puanı × 0.66 + tempo yakınlığı × 0.34
```

Tempo yakınlığı tolerans penceresine göre hesaplanır: tam isabette 100, tolerans
sınırında 0. Varsayılan tolerans **%6** (Pioneer DDJ-FLX4'ün pitch aralığı), ayar
aralığı %1–12. Tolerans dışındaki tempo ve kapalı ilişki elenir. Yarım/çift tempo
geçerli eşleşme sayılır: 128 ↔ 64 ↔ 256.

Otomatik kurucu ışın araması (beam search) kullanır. Açgözlü seçim, bir sonraki adımda
hiç uyumlu aday kalmayan çıkmazlara sokuyordu; aynı anda birkaç kısmi seti canlı tutmak
bunu çözüyor. Adım puanı `ilişki × 0.55 + eğriye uyum × 0.45`; son birkaç parçada aynı
sanatçı ve üst üste üçüncü aynı key ceza alır, ardışık aynı sanatçı başka aday varken
hiç seçilmez.

## Kurulum

### 1. Supabase

1. [supabase.com](https://supabase.com) → **New project** (ücretsiz katman yeterli).
2. **SQL Editor** → `supabase/schema.sql` dosyasının içeriğini yapıştır ve çalıştır.
   Tabloları, tetikleyicileri ve Row Level Security politikalarını kurar. Yeniden
   çalıştırmak güvenlidir.
3. **Settings → API** sayfasından `Project URL` ve `anon public` anahtarını al →
   `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY`.
4. Aynı sayfadaki `service_role` anahtarını al → `SUPABASE_SERVICE_ROLE_KEY`
   (yalnızca sunucu tarafı, asla `VITE_` öneki verme).

Ücretsiz Supabase projeleri 7 gün hareketsiz kalırsa duraklatılır. Haftalık katalog
tazelemesi veritabanına yazdığı için projeyi uyanık tutar; ek bir iş gerekmez.

### 2. Google ile giriş

1. [Google Cloud Console](https://console.cloud.google.com) → yeni proje.
2. **APIs & Services → OAuth consent screen**: External, uygulama adı ve destek
   e-postası. Test kullanıcısı olarak kendini ve giriş yapacak kişileri ekle.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorized redirect URI: `https://<proje-ref>.supabase.co/auth/v1/callback`
     (bu adres Supabase → Authentication → Providers → Google altında yazılı).
4. Çıkan **Client ID** ve **Client secret** değerlerini Supabase →
   **Authentication → Providers → Google** altına yapıştır ve sağlayıcıyı aç.
5. Supabase → **Authentication → URL Configuration** → Site URL alanına dağıtım
   adresini yaz (yerelde `http://localhost:5173`).

E-posta + parola girişi Supabase'de varsayılan olarak açıktır. Ücretsiz katmanın
yerleşik e-posta gönderimi saatte birkaç mesajla sınırlıdır; birkaç kişilik kullanımda
sorun olmaz, istersen **Authentication → Providers → Email** altından e-posta
doğrulamasını kapatabilirsin.

### 3. Vercel

1. Vercel → **Add New → Project** → depoyu içe aktar. Framework `vite` olarak gelir
   (`vercel.json` içinde de yazılı).
2. Ortam değişkenlerini gir (tablo aşağıda).
3. **Deployment Protection'ı açma.** Uygulamanın kendi girişi var; site geneli koruma
   açık olursa davet ettiğin kişiler siteye hiç ulaşamaz.

| değişken | ne işe yarar | nereden | yoksa ne olur |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Tarayıcının Supabase adresi | Supabase → Settings → API | Giriş kapalı, uygulama misafir kipinde |
| `VITE_SUPABASE_ANON_KEY` | Tarayıcının genel anahtarı | aynı sayfa | Aynı |
| `SUPABASE_URL` | Sunucu tarafı adres | yukarıdakiyle aynı değer | Katalog yazılamaz, internet araması giriş doğrulayamaz |
| `SUPABASE_SERVICE_ROLE_KEY` | Katalog yazma ve oturum doğrulama | Supabase → Settings → API | Aynı |
| `GETSONGBPM_API_KEY` | Tek parça araması | [getsongbpm.com/api](https://getsongbpm.com/api) | "internette ara" açıklama verir, elle giriş çalışır |
| `CRON_SECRET` | Haftalık tazelemeyi korur | `openssl rand -hex 32` | Tazeleme çalışmaz, okuma etkilenmez |

`.env.example` aynı bilgiyi yerel geliştirme için tutar.

Katalog haftada bir pazartesi 06:00 UTC'de `/api/catalog?refresh=1` ile tazelenir
(`vercel.json` → `crons`).

## Mimari

```
src/lib/          Saf mantık — React'e, DOM'a ve window'a dokunmaz, her modülün testi var
  camelot.ts        key ayrıştırma (nota / Camelot / Open Key), ilişki tablosu, renkler
  rekordbox.ts      koleksiyon XML ayrıştırıcı, m3u8 dışa aktarım
  suggest.ts        aday puanlama, tempo farkı, imza tekilleştirme
  setbuilder.ts     ışın aramalı otomatik set kurucu, enerji eğrileri
  search.ts         Türkçe karakter duyarsız yerel arama
  beatport.ts       katalog çıkarımı (üç strateji) ve doğrulama
  catalog.ts        tür sayfalarını tazeleme, tür başına rapor
  getsongbpm.ts     tek parça arama sorgusu ve yanıt okuma
  state-rows.ts     uygulama durumu ↔ veritabanı satırları eşlemesi
  auth-message.ts   Supabase hatalarını Türkçe ve yol gösteren metne çevirir
  state.ts, types.ts, ui.ts

src/store/        Durum, oturum ve kalıcılık
  store.ts          zustand mağazası + saf seçiciler
  auth.ts           oturum durumu, Google ve e-posta girişi
  supabase.ts       istemci kurulumu (env yoksa null → misafir kipi)
  remote.ts         kullanıcı başına okuma/yazma, çakışma çözümü
  sync.ts           localStorage + uzak depo, misafir/girişli açılış

src/components/   Arayüz (Türkçe metin)
  SetlistPanel, SuggestPanel, CamelotWheel, TempoCurve, AuthDialog,
  ImportDialog, TrackSearchDialog, AutoBuildDialog, common

api/              Vercel fonksiyonları
  _lib.ts           CORS, cron sırrı, service-role istemcisi, oturum doğrulama
  track-search.ts   GetSongBPM istemcisi (giriş ister)
  catalog.ts        katalog okuma ve cron ile tazeleme

scripts/
  refresh-catalog.ts  public/catalog.json'u elle tazeler (--dry ile yazmadan)
  smoke.mjs           gerçek tarayıcıda uçtan uca duman testi

supabase/
  schema.sql        tablolar, tetikleyiciler ve Row Level Security politikaları
```

## Kalıcılık nasıl çalışır

İki katman var:

1. **`localStorage`** — her değişiklikte, anında, herkes için (misafir dahil). Sunucu
   olmasa da uygulama çalışır.
2. **Supabase** — yalnızca giriş yapmışlar için. Yazma ~2.5 saniye geciktirilir, arka
   arkaya değişiklikler tek isteğe iner.

Veri üç tabloya bölünür: `libraries` (koleksiyon, kullanıcı başına tek satır),
`setlists` (set başına bir satır) ve `settings` (süzgeçler, imleç, kayıt damgası).
Kütüphanenin ayrı durmasının sebebi büyüklüğü: her not değişikliğinde 20 bin parçayı
tekrar göndermek istemiyoruz.

**Kullanıcılar birbirinin verisini göremez** ve bunu uygulama değil veritabanı zorlar:
her tabloda `auth.uid() = user_id` koşullu Row Level Security politikası var.

Açılışta hesaptaki kayıt yüklenir. Yazarken sunucudaki `saved_at` damgası gönderilenden
yeniyse yazma yapılmaz; sunucudaki kayıt geri alınır ve kullanıcıya söylenir —
**sessizce üzerine yazılmaz.**

Playlist seçiliyken bile kayda **tam koleksiyon** yazılır; süzgeç yalnızca görünümü
daraltır. (Süzülmüş listeyi yazmak, sayfa yenilenince koleksiyonun geri kalanını
kaybettiriyordu.)

## Beatport kazıma hakkında dürüst not

Beatport'un açık bir API'si yok. Keşif katalogu tür Top 100 sayfalarından çıkarılıyor ve
**bu kırılgan**: sayfa yapısı haber vermeden değişebilir.

Buna karşı üç şey yapılıyor:

- **Üç ayrı strateji** sırayla denenir — `__NEXT_DATA__` bloğu, gömülü JSON / RSC akışı,
  düz HTML metni. 10'dan az parça bulan stratejiye güvenilmez ve hangisinin tuttuğu
  katalogda `strategy` alanında yazar.
- **Doğrulama**: en az 100 parça, key okunma oranı ≥%95, BPM'lerin ≥%90'ı 90–165 arası,
  en az 3 tür, yeni katalog eskisinin yarısından büyük.
- **Doğrulama geçmezse eski katalog korunur.** Bozuk veri iyi veriyi ezmez; tazeleme
  neden geçmediğini rapor eder.

Sayfa yapısı değiştiğinde `npm run refresh:catalog -- --dry` hangi stratejinin kaç parça
bulduğunu söyler; düzeltme `src/lib/beatport.ts` içindeki çıkarım stratejilerinde yapılır.

Son çekimde dokuz türden 875 parça alındı, key okunma oranı %100, tutan strateji
`__NEXT_DATA__`.

## Duman testi

Playwright bilerek bağımlılık listesinde değil (kurulumu ~150 MB tarayıcı indirmesi
ekliyor). Çalıştırmak için:

```bash
npm install --no-save playwright
npx playwright install chromium
npm run build && node scripts/smoke.mjs
```

Test sahte bir API sunucusu kurar, üretim derlemesini gerçek Chromium'da açar ve şu akışı
yürür: XML içe aktarma → playlist seçme → yerel arama → internet araması → öneri ekleme →
otomatik set kurma → çoklu setlist → not yazma → misafir çalışmasının sunucuya
gitmediğini doğrulama → yenileme sonrası kalıcılık → mobilde yatay kaydırma yok →
konsolda hata yok.

Not: `npm install` çalıştırdığında `--no-save` ile kurulan Playwright silinir; duman
testini tekrar çalıştırmadan önce yukarıdaki kurulum satırını yinelemen gerekir.
