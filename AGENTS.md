# Camelot Setlist — çalışma kuralları

Bu dosyayı her oturumda okuyorsun. Kurallar bağlayıcı.

## Proje

rekordbox kütüphanesinden **BPM** ve **Camelot key** uyumuna göre DJ setlisti kuran
web uygulaması. Tek kullanıcı (proje sahibi), Vercel'de özel dağıtım.

Yığın: Vite + React 19 + TypeScript (strict) · zustand · vitest · Vercel Functions.
Arayüz dili **İngilizce** — kullanıcıya görünen her metin, kod yorumları, README ve
betik çıktıları İngilizce. Test adları Türkçe kaldı.

## Commit kapısı — en önemli kural

**Kendi başına asla commit atma.** Bir adımın kodunu yazdıktan sonra dur ve şunu yap:

1. `npm test` ve `npm run typecheck` ve `npm run lint` çalıştır, sonucu yaz.
2. `git status --short` ve `git diff --stat` çıktısını göster.
3. Ne eklediğini 3–5 maddede özetle: hangi dosya, ne yapıyor, neden böyle.
4. **Dur ve onay iste.** "Commit atayım mı?" diye sor, cevabı bekle.

Onay gelince `git add` + `git commit` yap. Onay gelmeden `git commit`, `git push`,
`git reset --hard`, `git checkout -- .` yok.

Commit mesajı biçimi — `tip(kapsam): özet` (72 karakteri geçmesin), sonra boş satır,
sonra **neden** böyle yaptığını anlatan 2–4 satır. Ne yaptığını diff zaten söylüyor.

```
feat(camelot): key dönüşümleri ve harmonik ilişkiler

Çemberde bir numara ilerlemek bir beşli (7 yarım ton). Bu yüzden +7 numara
bir yarım tona denk geliyor; testler her key çifti için perde sınıfı hesaplayıp
bu iddiayı bağımsız doğruluyor.
```

Commit mesajına `Co-Authored-By` ya da başka bir araç imzası **ekleme**.

## Kod kuralları

- **Saf mantık `src/lib/` altında, React'ten bağımsız.** Bir fonksiyon DOM'a,
  `window`'a ya da React'e dokunuyorsa `lib/`'e girmez. Bu ayrım testleri ucuzlatıyor.
- **Her `lib/` modülünün yanında `.test.ts` dosyası olur.** Mutlu yol yetmez:
  sınır durumları, bozuk girdi, boş girdi ve *kararlılık* (aynı girdi → aynı çıktı) test edilir.
- Test adları Türkçe ve davranışı anlatır: `it('yarım ve çift tempoyu yakalar')`.
- `any` yok. `strict: true` kapalı bırakılmaz.
- Yorum satırı **neden**i anlatır, neyi değil. Bir seçim şaşırtıcıysa yorumu hak eder.
- Kullanıcıya gösterilen hata mesajı ne olduğunu **ve** ne yapılacağını söyler.
  "Bir hata oluştu" yasak.
- Dış veri (XML, JSON, API yanıtı) her zaman şüphelidir: doğrula, çökme.

## Alan bilgisi — bunları yeniden keşfetme

### Camelot çemberi
Bir numara ilerlemek = bir beşli = **7 yarım ton**. Buradan:
`+7 numara ≡ +1 yarım ton`, `+5 numara ≡ −1 yarım ton`.
A halkası minör, B halkası majör. `8A = Am`, `8B = C`.

### Bilinen tuzaklar (hepsi gerçekten yaşandı)
- **Key ayrıştırma büyük/küçük harf duyarsız olmalı.** Beatport `"G Minor"` yazıyor;
  regex'te `i` bayrağı yoksa sessizce `null` döner ve katalog boş çıkar.
- **Regex ile JSON kesme.** İç içe süslü parantezli nesnelerde bozuk JSON üretir.
  Parantez sayan, dize ve kaçış karakteri duyarlı bir tarayıcı yaz.
- **HTML attribute'una JSON gömme.** Parça adındaki kesme işareti (`Becca's Booty`)
  attribute'u erken kapatır ve buton sessizce kırılır. Veriyi indeksle taşı.
- **React: effect içinde `setState` çağırma.** Sıfırlamayı olay işleyicisine taşı.
- **rekordbox `Tonality` alanı üç biçimde gelebilir:** nota (`Am`, `F#m`), Camelot (`8A`),
  Open Key (`1m`). Üçünü de kabul et.
- **XML ayrıştırırken `querySelector` kullanma.** `childNodes` üzerinde yürü — hem daha
  hızlı hem test ortamından bağımsız.

### Veri kaynakları
- **Tek parça arama → GetSongBPM** (resmî, ücretsiz):
  `https://api.getsong.co/search/?api_key=…&type=both&lookup=song:X artist:Y`
  → `tempo`, `key_of` (`"Em"`), `open_key` (`"2m"`).
- **Keşif katalogu → Beatport tür Top 100 sayfaları.** Açık API yok; sayfa sunucu
  tarafında render ediliyor, satırlarda `"125 BPM - G Minor"` gibi düz metin var.
  Kırılgan olduğunu kabul et: çok stratejili çıkar, sonucu doğrula, **doğrulama
  geçmezse eski katalogu koru**. Bozuk veri iyi veriyi asla ezmesin.
- Beatport'un arama sayfası istemci tarafında render ediliyor ve gömülü verisi yok —
  tek parça araması için kullanma.

## Komutlar

```bash
npm run dev        # geliştirme sunucusu
npm test           # vitest
npm run typecheck  # tsc -b --noEmit
npm run lint       # eslint
npm run build      # tsc -b && vite build
```

Bir adımı bitirdim demeden önce üçü de (`test`, `typecheck`, `lint`) temiz olmalı.
