import { describe, expect, it } from 'vitest'
import { readSearchResults, searchUrl, splitQuery } from './getsongbpm'

describe('splitQuery', () => {
  it('"Sanatçı - Parça" biçimini ayırır', () => {
    expect(splitQuery('Ayla - Gece Yürüyüşü')).toEqual({ artist: 'Ayla', song: 'Gece Yürüyüşü' })
    expect(splitQuery('Deniz K. – Kum Saati')).toEqual({ artist: 'Deniz K.', song: 'Kum Saati' })
  })

  it('tire yoksa tamamı parça adı', () => {
    expect(splitQuery('Kum Saati')).toEqual({ artist: '', song: 'Kum Saati' })
  })

  it('parça adındaki tireyi bölmez', () => {
    expect(splitQuery('Ayla - Gece-Yürüyüşü')).toEqual({ artist: 'Ayla', song: 'Gece-Yürüyüşü' })
  })

  it('boş sorguda boş alanlar', () => {
    expect(splitQuery('   ')).toEqual({ artist: '', song: '' })
  })
})

describe('searchUrl', () => {
  it('sanatçı varsa lookup’a ekler', () => {
    const url = searchUrl('Ayla - Gece', 'ANAHTAR')
    expect(url).toContain('api_key=ANAHTAR')
    expect(url).toContain('type=both')
    expect(decodeURIComponent(url)).toContain('lookup=song:Gece artist:Ayla')
  })

  it('sanatçı yoksa yalnızca parça arar', () => {
    expect(decodeURIComponent(searchUrl('Gece', 'X'))).toContain('lookup=song:Gece')
  })

  it('anahtarı adres için kaçırır', () => {
    expect(searchUrl('Gece', 'a b&c')).toContain('api_key=a%20b%26c')
  })
})

describe('readSearchResults', () => {
  it('sonuçları okur ve key’i Camelot’a çevirir', () => {
    const body = {
      search: [
        { song_title: 'Gece', artist: { name: 'Ayla' }, tempo: '124', key_of: 'Em' },
        { song_title: 'Kum', artist: 'Deniz', tempo: 128, key_of: 'G Minor' },
      ],
    }
    expect(readSearchResults(body)).toEqual({
      results: [
        { title: 'Gece', artist: 'Ayla', bpm: 124, key: '9A' },
        { title: 'Kum', artist: 'Deniz', bpm: 128, key: '6A' },
      ],
      message: null,
    })
  })

  it('key_of okunamazsa open_key’e düşer', () => {
    const body = { search: [{ song_title: 'X', artist: { name: 'Y' }, tempo: '120', open_key: '2m' }] }
    expect(readSearchResults(body).results[0].key).toBe('9A')
  })

  it('servis hata nesnesi döndürünce ne yapılacağını söyler', () => {
    const result = readSearchResults({ search: { error: 'no result' } })
    expect(result.results).toEqual([])
    expect(result.message).toMatch(/by hand/)
  })

  it('beklenmedik gövdede çökmez', () => {
    expect(readSearchResults(null).results).toEqual([])
    expect(readSearchResults('metin').message).toMatch(/something unexpected/)
    expect(readSearchResults({}).message).toMatch(/something unexpected/)
  })

  it('başlıksız kayıtları atar', () => {
    const body = { search: [{ artist: { name: 'Y' }, tempo: '120' }, { song_title: 'Var', tempo: 'x' }] }
    const result = readSearchResults(body)
    expect(result.results).toEqual([{ title: 'Var', artist: '', bpm: null, key: null }])
  })

  it('boş listede parçayı elle girmeyi önerir', () => {
    expect(readSearchResults({ search: [] }).message).toMatch(/by hand/)
  })
})
