import { describe, expect, it } from 'vitest'
import { parseEnvFile } from './env-file'

describe('parseEnvFile', () => {
  it('anahtar ve değeri ayırır', () => {
    expect(parseEnvFile('A=1\nB=iki')).toEqual({ A: '1', B: 'iki' })
  })

  it('boş satırları ve yorumları atlar', () => {
    expect(parseEnvFile('\n# yorum\n\nA=1\n')).toEqual({ A: '1' })
  })

  it('tırnakları soyar, tırnak içindeki boşluğu korur', () => {
    expect(parseEnvFile('A="bir iki"\nB=\'üç\'')).toEqual({ A: 'bir iki', B: 'üç' })
  })

  it('değerdeki eşittir işaretini bozmaz', () => {
    expect(parseEnvFile('KEY=abc=def==')).toEqual({ KEY: 'abc=def==' })
  })

  it('satır sonundaki yorumu atar, tırnaklıysa dokunmaz', () => {
    expect(parseEnvFile('A=1 # not\nB="1 # not"')).toEqual({ A: '1', B: '1 # not' })
  })

  it('export önekini ve boşlukları hoş görür', () => {
    expect(parseEnvFile('  export A = 1 ')).toEqual({ A: '1' })
  })

  it('bozuk satırları yok sayar', () => {
    expect(parseEnvFile('sadece metin\n=1\n1KEY=x\nA=1')).toEqual({ A: '1' })
  })

  it('boş girdide boş nesne döner', () => {
    expect(parseEnvFile('')).toEqual({})
  })
})
