import { describe, expect, it } from 'vitest'
import sampleXml from '../../test/fixtures/sample-collection.xml?raw'
import {
  RekordboxParseError,
  decodeLocation,
  isUsable,
  parseRekordboxXml,
  toM3u8,
} from './rekordbox'
import type { Track } from './types'

const parseXml = (text: string): Document => new DOMParser().parseFromString(text, 'application/xml')

function parse(text: string) {
  return parseRekordboxXml(text, parseXml)
}

describe('parseRekordboxXml — örnek koleksiyon', () => {
  const library = parse(sampleXml)

  it('kimliği olan parçaları alır, olmayanı atlar', () => {
    expect(library.tracks.map((track) => track.id)).toEqual(['1', '2', '3', '4', '5'])
    expect(library.stats.total).toBe(6)
    expect(library.stats.skipped).toBe(1)
  })

  it('üç Tonality biçimini de çözer', () => {
    expect(library.tracks[0].key).toBe('8A')
    expect(library.tracks[1].key).toBe('8B')
    expect(library.tracks[2].key).toBe('9A')
    expect(library.tracks[3].key).toBe('11A')
    expect(library.tracks[4].key).toBeNull()
  })

  it('ondalıklı BPM korunur, sıfır BPM boş sayılır', () => {
    expect(library.tracks[1].bpm).toBe(128.02)
    expect(library.tracks[2].bpm).toBe(122.5)
    expect(library.tracks[4].bpm).toBeNull()
  })

  it('yüzde kodlu Windows yolunu çözer', () => {
    expect(library.tracks[0].location).toBe('C:/Müzik/Ayla - Gece Yürüyüşü.mp3')
    expect(library.tracks[0].ext).toBe('mp3')
    expect(library.tracks[1].ext).toBe('aiff')
    expect(library.tracks[3].location).toBe("C:/Müzik/Kaya - Becca's Booty.mp3")
    expect(library.tracks[4].location).toBeUndefined()
  })

  it('başlık, sanatçı, tür ve süreyi okur', () => {
    expect(library.tracks[0].title).toBe('Gece Yürüyüşü')
    expect(library.tracks[0].artist).toBe('Ayla')
    expect(library.tracks[0].genre).toBe('Melodic House & Techno')
    expect(library.tracks[0].duration).toBe(372)
    expect(library.tracks[0].source).toBe('library')
  })

  it('iç içe klasörleri düzleştirir ve hayalet atıfları atar', () => {
    expect(library.playlists.map((playlist) => playlist.name)).toEqual([
      'Kulüp / Açılış',
      'Favoriler',
    ])
    expect(library.playlists[0].trackIds).toEqual(['1', '2'])
    expect(library.playlists[1].trackIds).toEqual(['3', '4', '5'])
    expect(library.stats.ghostReferences).toBe(1)
  })

  it('sürümü ve eksik alan sayılarını raporlar', () => {
    expect(library.version).toBe('6.7.7')
    expect(library.stats.missingBpm).toBe(1)
    expect(library.stats.missingKey).toBe(1)
    expect(library.stats.missingLocation).toBe(1)
  })

  it('aynı girdi aynı sonucu verir', () => {
    expect(parse(sampleXml)).toEqual(library)
  })
})

describe('parseRekordboxXml — hatalı girdi', () => {
  it('boş dosyada ne yapılacağını söyler', () => {
    expect(() => parse('')).toThrow(RekordboxParseError)
    expect(() => parse('   ')).toThrow(/looks empty/)
  })

  it('bozuk XML', () => {
    expect(() => parse('<DJ_PLAYLISTS><COLLECTION><TRACK TrackID="1"></COLLECTION>')).toThrow(
      /damaged or truncated/,
    )
  })

  it('yanlış kök etiket', () => {
    expect(() => parse('<PLAYLIST><TRACK/></PLAYLIST>')).toThrow(/DJ_PLAYLISTS/)
  })

  it('COLLECTION bölümü olmayan dosya', () => {
    expect(() => parse('<DJ_PLAYLISTS><PLAYLISTS/></DJ_PLAYLISTS>')).toThrow(
      /no COLLECTION section/,
    )
  })

  it('parça içermeyen koleksiyon', () => {
    expect(() => parse('<DJ_PLAYLISTS><COLLECTION Entries="0"/></DJ_PLAYLISTS>')).toThrow(
      /No tracks found/,
    )
  })

  it('kimliksiz parçalardan ibaret koleksiyon da boş sayılır', () => {
    expect(() =>
      parse('<DJ_PLAYLISTS><COLLECTION><TRACK Name="x" AverageBpm="120"/></COLLECTION></DJ_PLAYLISTS>'),
    ).toThrow(/No tracks found/)
  })

  it('okuyucu çökerse anlaşılır hata verir', () => {
    const broken: (text: string) => Document = () => {
      throw new Error('boom')
    }
    expect(() => parseRekordboxXml('<DJ_PLAYLISTS/>', broken)).toThrow(/could not be read as XML/)
  })

  it('PLAYLISTS bölümü olmayan dosyada playlist listesi boş kalır', () => {
    const library = parse(
      '<DJ_PLAYLISTS><COLLECTION><TRACK TrackID="1" Name="x" AverageBpm="120" Tonality="Am"/></COLLECTION></DJ_PLAYLISTS>',
    )
    expect(library.playlists).toEqual([])
    expect(library.version).toBeNull()
  })
})

describe('decodeLocation', () => {
  it('file:// önekini ve Windows sürücü eğik çizgisini temizler', () => {
    expect(decodeLocation('file://localhost/C:/a/b.mp3')).toBe('C:/a/b.mp3')
    expect(decodeLocation('file:///C:/a/b.mp3')).toBe('C:/a/b.mp3')
  })

  it('macOS ve Linux yollarında baştaki eğik çizgi kalır', () => {
    expect(decodeLocation('file://localhost/Users/tuna/a.mp3')).toBe('/Users/tuna/a.mp3')
  })

  it('bozuk yüzde kodlamasında yolu ham bırakır', () => {
    expect(decodeLocation('file://localhost/C:/%zz.mp3')).toBe('C:/%zz.mp3')
  })

  it('boş değerde undefined', () => {
    expect(decodeLocation('')).toBeUndefined()
    expect(decodeLocation('   ')).toBeUndefined()
  })
})

describe('isUsable ve toM3u8', () => {
  const base: Track = {
    id: '1',
    title: 'Gece',
    artist: 'Ayla',
    bpm: 124,
    key: '8A',
    duration: 372,
    location: 'C:/Müzik/gece.mp3',
    source: 'library',
  }

  it('tempo ya da key eksikse havuza girmez', () => {
    expect(isUsable(base)).toBe(true)
    expect(isUsable({ ...base, bpm: null })).toBe(false)
    expect(isUsable({ ...base, key: null })).toBe(false)
  })

  it('m3u8 başlık, süre ve yol satırlarını yazar', () => {
    const output = toM3u8([base], 'Cuma seti')
    expect(output).toBe(
      '#EXTM3U\n#PLAYLIST:Cuma seti\n#EXTINF:372,Ayla - Gece\nC:/Müzik/gece.mp3\n',
    )
  })

  it('dosya yolu olmayan parçayı atlar', () => {
    const output = toM3u8([{ ...base, location: undefined }, base], 'Set')
    expect(output.split('\n').filter((line) => line.startsWith('#EXTINF'))).toHaveLength(1)
  })

  it('süresi bilinmeyen parçaya -1 yazar', () => {
    const output = toM3u8([{ ...base, duration: undefined }], 'Set')
    expect(output).toContain('#EXTINF:-1,Ayla - Gece')
  })

  it('boş listede yalnızca başlık satırları', () => {
    expect(toM3u8([], 'Boş')).toBe('#EXTM3U\n#PLAYLIST:Boş\n')
  })
})
