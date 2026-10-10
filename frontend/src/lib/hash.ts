/** SHA-256 in the browser → 32-byte hex for the contract (bytes32). */
export async function sha256Hex(
  data: ArrayBuffer | Uint8Array | string,
): Promise<`0x${string}`> {
  const bytes: Uint8Array =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data)

  // Copy into a plain ArrayBuffer so digest()'s BufferSource typing is happy.
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', copy)
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return `0x${hex}`
}

export async function sha256File(file: File): Promise<`0x${string}`> {
  const buffer = await file.arrayBuffer()
  return sha256Hex(buffer)
}
