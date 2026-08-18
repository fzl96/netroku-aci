import { beforeAll, describe, expect, it } from 'bun:test'
import { decrypt, encrypt } from './crypto'

const KEY = 'a'.repeat(64)

beforeAll(() => {
  process.env.ENCRYPTION_KEY = KEY
})

describe('encrypt/decrypt', () => {
  it('round-trips a value', () => {
    expect(decrypt(encrypt('P@ssw0rd123'))).toBe('P@ssw0rd123')
  })

  it('round-trips unicode', () => {
    expect(decrypt(encrypt('pässwörd–✓'))).toBe('pässwörd–✓')
  })

  it('produces a different ciphertext each time (random IV)', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'))
  })

  it('rejects a tampered auth tag', () => {
    const [iv, tag, data] = encrypt('secret').split(':')
    const flipped = tag.startsWith('0') ? `1${tag.slice(1)}` : `0${tag.slice(1)}`
    expect(() => decrypt(`${iv}:${flipped}:${data}`)).toThrow()
  })

  it('rejects tampered ciphertext', () => {
    const [iv, tag, data] = encrypt('secret').split(':')
    const flipped = data.startsWith('0') ? `1${data.slice(1)}` : `0${data.slice(1)}`
    expect(() => decrypt(`${iv}:${tag}:${flipped}`)).toThrow()
  })

  it('rejects a malformed payload', () => {
    expect(() => decrypt('not-encrypted')).toThrow('Invalid encrypted value')
  })

  it('rejects a wrong-length key', () => {
    process.env.ENCRYPTION_KEY = 'tooshort'
    expect(() => encrypt('x')).toThrow('ENCRYPTION_KEY')
    process.env.ENCRYPTION_KEY = KEY
  })
})
