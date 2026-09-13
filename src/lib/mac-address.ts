/** Canonical spellings used by ACI and Legacy collectors, for exact identity filters. */
export function macAddressVariants(value: string): string[] {
  const compact = value
    .trim()
    .toLowerCase()
    .replace(/[:.\-\s]/g, '')
  if (!/^[a-f0-9]{12}$/.test(compact)) return [value.trim().toLowerCase()]
  const bytes = compact.match(/.{2}/g)!
  return [compact, bytes.join(':'), bytes.join('-'), compact.match(/.{4}/g)!.join('.')]
}
