import type { ReactNode } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { monadTestnet } from 'wagmi/chains'

type NetworkGateProps = {
  children: ReactNode
}

export function NetworkGate({ children }: NetworkGateProps) {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!isConnected) {
    return (
      <div className="gate-panel">
        <h2>Connect a wallet</h2>
        <p>Use MetaMask or another injected wallet to fund and manage escrow on Monad Testnet only.</p>
      </div>
    )
  }

  if (chainId !== monadTestnet.id) {
    return (
      <div className="gate-panel gate-warn">
        <h2>Wrong network</h2>
        <p>
          This app only works on Monad Testnet (chain ID {monadTestnet.id}). Switch
          networks to continue — mainnet and real funds are not supported.
        </p>
        <button
          type="button"
          className="btn primary"
          disabled={isPending}
          onClick={() => switchChain({ chainId: monadTestnet.id })}
        >
          {isPending ? 'Switching…' : 'Switch to Monad Testnet'}
        </button>
      </div>
    )
  }

  return children
}
