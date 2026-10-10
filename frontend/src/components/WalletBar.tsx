import { useMemo } from 'react'
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  type Connector,
} from 'wagmi'
import { monadTestnet } from 'wagmi/chains'
import { shortAddress } from '../lib/status'
import { escrowNetworkName } from '../lib/contract'

function pickInjectedConnector(connectors: readonly Connector[]): Connector | undefined {
  // Prefer MetaMask (targeted connector or EIP-6963 discovery entry).
  const metaMask = connectors.find((connector) => {
    const id = connector.id.toLowerCase()
    const name = connector.name.toLowerCase()
    return (
      id === 'metamask' ||
      id === 'io.metamask' ||
      id.includes('metamask') ||
      name === 'metamask'
    )
  })
  if (metaMask) return metaMask

  const injected = connectors.find(
    (connector) => connector.type === 'injected' || connector.name === 'Injected',
  )
  return injected ?? connectors[0]
}

function friendlyConnectError(message: string): string {
  if (/provider not found/i.test(message)) {
    return 'No browser wallet provider found. Install and unlock MetaMask (or another injected wallet), then refresh and try again.'
  }
  return message
}

export function WalletBar() {
  const { address, isConnected, chainId } = useAccount()
  const { connect, connectors, isPending, error, reset } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()

  const onWrongNetwork =
    isConnected && chainId !== undefined && chainId !== monadTestnet.id

  const connector = useMemo(
    () => pickInjectedConnector(connectors),
    [connectors],
  )

  function handleConnect() {
    reset()
    if (!connector) return
    // Request Monad Testnet during connect when the wallet supports it.
    connect({ connector, chainId: monadTestnet.id })
  }

  return (
    <header className="wallet-bar">
      <div className="brand-block">
        <p className="brand">Milestone Escrow</p>
        <p className="brand-sub">
          {escrowNetworkName} · chain {monadTestnet.id}
        </p>
      </div>

      <div className="wallet-actions">
        {!isConnected ? (
          <button
            type="button"
            className="btn primary"
            disabled={isPending || !connector}
            onClick={handleConnect}
          >
            {isPending
              ? 'Connecting…'
              : connector
                ? `Connect ${connector.name}`
                : 'No wallet connector'}
          </button>
        ) : (
          <>
            <span className="wallet-address">{shortAddress(address!)}</span>
            {onWrongNetwork ? (
              <button
                type="button"
                className="btn warn"
                disabled={isSwitching}
                onClick={() => switchChain({ chainId: monadTestnet.id })}
              >
                {isSwitching ? 'Switching…' : 'Switch to Monad Testnet'}
              </button>
            ) : (
              <span className="network-ok">Monad Testnet</span>
            )}
            <button
              type="button"
              className="btn ghost"
              onClick={() => disconnect()}
            >
              Disconnect
            </button>
          </>
        )}
      </div>

      {error ? (
        <p className="inline-error">{friendlyConnectError(error.message)}</p>
      ) : null}
    </header>
  )
}
