type TxBannerProps = {
  phase: 'idle' | 'pending' | 'success' | 'error'
  message?: string
  hash?: string
}

export function TxBanner({ phase, message, hash }: TxBannerProps) {
  if (phase === 'idle') return null

  const title =
    phase === 'pending'
      ? 'Pending'
      : phase === 'success'
        ? 'Confirmed'
        : 'Failed'

  return (
    <div className={`tx-banner tx-${phase}`} role="status">
      <strong>{title}</strong>
      {message ? <p>{message}</p> : null}
      {hash ? (
        <p className="tx-hash">
          Tx{' '}
          <a
            href={`https://testnet.monadscan.com/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            {hash.slice(0, 10)}…{hash.slice(-6)}
          </a>
        </p>
      ) : null}
    </div>
  )
}
