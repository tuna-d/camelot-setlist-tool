# Camelot Setlist

rekordbox kütüphanenden **BPM** ve **Camelot key** uyumuna göre DJ setlisti kuran web
uygulaması. Tek kullanıcı için tasarlandı, Vercel'de özel dağıtım olarak çalışır.

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

Uygulama açıldığında sağ üstteki **rekordbox XML** düğmesiyle koleksiyonunu içe aktar
(rekordbox → Dosya → Koleksiyonu dışa aktar → rekordbox xml). Sunucu tarafı olmadan da
çalışır: her şey tarayıcının `localStorage`'ında tutulur.

```bash
npm test           # vitest (263 test)
npm run typecheck  # tsc -b --noEmit
npm run lint       # eslint
npm run build      # tsc -b && vite build
```

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

## Vercel kurulumu

1. Vercel → **Add New → Project** → bu depoyu içe aktar. Framework otomatik `vite`
   olarak gelir (`vercel.json` içinde de yazılı).
2. **Storage → Create → Blob** ile bir Blob deposu aç, projeye bağla. `BLOB_READ_WRITE_TOKEN`
   otomatik eklenir.
3. Ortam değişkenlerini gir (tablo aşağıda).
4. **Settings → Deployment Protection → Vercel Authentication**'ı **aç**. Site yalnızca
   sana açık kalsın; uygulamada kişisel kütüphane verisi duruyor.

| değişken | ne işe yarar | nereden | yoksa ne olur |
|---|---|---|---|
| `GETSONGBPM_API_KEY` | Tek parça araması | [getsongbpm.com/api](https://getsongbpm.com/api) (ücretsiz) | "internette ara" sonuç yerine açıklama verir; yerel arama ve elle giriş çalışır |
| `BLOB_READ_WRITE_TOKEN` | Cihazlar arası kayıt ve sunucudaki katalog | Vercel Blob deposu bağlanınca otomatik | Kayıt yalnızca tarayıcıda tutulur |
| `CRON_SECRET` | Haftalık katalog tazelemesini korur | `openssl rand -hex 32` | Tazeleme hiç çalışmaz, katalog okuma etkilenmez |
| `APP_SECRET` | Sunucu uç noktalarını korur | `openssl rand -hex 32` | Uç noktalar korumasız kalır — Deployment Protection şart |
| `VITE_APP_SECRET` | Yukarıdakinin tarayıcı kopyası | `APP_SECRET` ile birebir aynı | İstemci 401 alır |

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
  state.ts, types.ts, ui.ts

src/store/        Durum ve kalıcılık
  store.ts          zustand mağazası + saf seçiciler
  sync.ts           localStorage + /api/state, çakışma çözümü

src/components/   Arayüz (Türkçe metin)
  SetlistPanel, SuggestPanel, CamelotWheel, TempoCurve,
  ImportDialog, TrackSearchDialog, AutoBuildDialog, common

api/              Vercel fonksiyonları
  _lib.ts           APP_SECRET doğrulama, Blob oku/yaz, CORS (uç nokta değil)
  state.ts          GET/PUT durum, çakışmada 409
  track-search.ts   GetSongBPM istemcisi
  catalog.ts        katalog okuma ve cron ile tazeleme

scripts/
  refresh-catalog.ts  public/catalog.json'u elle tazeler (--dry ile yazmadan)
  smoke.mjs           gerçek tarayıcıda uçtan uca duman testi
```

## Kalıcılık nasıl çalışır

İki katman var:

1. **`localStorage`** — her değişiklikte, anında. Sunucu olmasa da uygulama çalışır.
2. **`/api/state`** — Blob deposundaki tek bir kayıt. Yazma ~2.5 saniye geciktirilir,
   arka arkaya değişiklikler tek isteğe iner.

Açılışta iki kaydın `savedAt` damgası karşılaştırılır, yeni olan kazanır; uzaktaki kayıt
kazandıysa kullanıcıya söylenir. Yazarken sunucudaki kayıt daha yeniyse uç nokta `409` ve
kendi kaydını döndürür: o kayıt yüklenir, **sessizce üzerine yazılmaz**.

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
otomatik set kurma → çoklu setlist → not yazma → sunucuya kayıt → yenileme sonrası
kalıcılık → mobilde yatay kaydırma yok → konsolda hata yok.
