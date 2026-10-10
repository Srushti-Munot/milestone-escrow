import { http, createConfig } from 'wagmi'
import { monadTestnet } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

/**
 * Wagmi 3 / @wagmi/core 3.6.x:
 * - Prefer a MetaMask-targeted injected connector.
 * - Keep a generic injected fallback for other browser wallets.
 * - EIP-6963 discovery stays on (default) so installed wallets appear reliably.
 */
export const config = createConfig({
  chains: [monadTestnet],
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected({
      target: 'metaMask',
      shimDisconnect: true,
      // Wait briefly if the extension injects after page load (Manifest V3).
      unstable_shimAsyncInject: 2_000,
    }),
    injected({
      shimDisconnect: true,
      unstable_shimAsyncInject: 2_000,
    }),
  ],
  transports: {
    [monadTestnet.id]: http('https://testnet-rpc.monad.xyz'),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
