/** Uygulamanın tamamında paylaşılan veri tipleri. */

/** Bir parçanın nereden geldiği — arayüzde kaynak rozeti olarak gösterilir. */
export type TrackSource = 'library' | 'catalog' | 'web' | 'manual'

export interface Track {
  id: string
  title: string
  artist: string
  /** Dakikadaki vuruş. Ondalık korunur: rekordbox 128.02 yazabiliyor. */
  bpm: number | null
  /** Camelot kodu (`8A`). Çözülemeyen key `null` kalır, parça yine de listede durur. */
  key: string | null
  genre?: string
  /** Saniye cinsinden süre. */
  duration?: number
  /** Yerel dosya yolu — yalnızca kütüphane parçalarında olur, m3u8 dışa aktarımı bunu kullanır. */
  location?: string
  source: TrackSource
  /** Dosya uzantısı (`mp3`, `aiff`). rekordbox'tan gelir, dışa aktarımda işe yarar. */
  ext?: string
}

export interface Playlist {
  id: string
  /** İç içe klasörler `"Klasör / Alt playlist"` biçiminde düzleştirilir. */
  name: string
  trackIds: string[]
}

export interface SetlistEntry {
  trackId: string
  /** Kullanıcının o parça için düştüğü not ("burada ışıklar kısılsın"). */
  note?: string
}

export interface Setlist {
  id: string
  name: string
  entries: SetlistEntry[]
  /** Setin tamamı için not. */
  note?: string
  createdAt: number
}

/** Camelot çemberindeki iki key arasındaki ilişkinin kimliği. */
export type RelationId =
  | 'same'
  | 'up'
  | 'down'
  | 'relative'
  | 'boost'
  | 'diagonal'
  | 'semiUp'
  | 'semiDown'

/** İlişkinin arayüzdeki rengini belirleyen anlam kümesi. */
export type Tone = 'neutral' | 'energy' | 'calm' | 'color' | 'jump' | 'risk'

/** Önerilerin hangi havuzdan geleceği. */
export type PoolSource = 'catalog' | 'library'

/** Keşif katalogu — `public/catalog.json` ve `/api/catalog` bu biçimde. */
export interface Catalog {
  updatedAt: string
  source: string
  /** Hangi çıkarım stratejisinin tuttuğu — sayfa yapısı değişince buradan anlaşılır. */
  strategy: string
  tracks: Track[]
}

/** Kalıcı kılınan uygulama durumu. `sync` katmanı bunu olduğu gibi yazıp okur. */
export interface AppState {
  library: Track[]
  playlists: Playlist[]
  /** Seçili playlist; `null` ise tüm koleksiyon havuz sayılır. */
  playlistId: string | null
  setlists: Setlist[]
  activeId: string | null
  /** Önerilerin dayandığı parçanın aktif setlistteki sırası. */
  cursor: number
  /** Yüzde cinsinden tempo toleransı. */
  tolerance: number
  /** Açık ilişkiler. */
  relations: RelationId[]
  /** Süzgeç olarak seçili türler; boşsa tür süzgeci yok. */
  genres: string[]
  poolSource: PoolSource
  /** Son kayıt zamanı (ms). Cihazlar arası çakışma bununla çözülür. */
  savedAt: number
}
