import { useCallback, useState } from 'react'
import { CreateAgreementForm } from './components/CreateAgreementForm'
import { Dashboard } from './components/Dashboard'
import { NetworkGate } from './components/NetworkGate'
import { WalletBar } from './components/WalletBar'
import { escrowAddress } from './lib/contract'
import { shortAddress } from './lib/status'
import './App.css'

function App() {
  const [refreshKey, setRefreshKey] = useState(0)

  const bumpDashboard = useCallback(() => {
    setRefreshKey((value) => value + 1)
  }, [])

  return (
    <div className="app-shell">
      <WalletBar />

      <main className="app-main">
        <section className="hero-copy">
          <h1>Milestone Escrow</h1>
          <p>
            Fund freelance milestones on Monad Testnet. Money stays in the contract
            until approve, timeout, dispute, expiry, or cancel.
          </p>
          <p className="contract-line">
            Contract {shortAddress(escrowAddress)} ·{' '}
            <a
              href={`https://testnet.monadscan.com/address/${escrowAddress}`}
              target="_blank"
              rel="noreferrer"
            >
              view on Monadscan
            </a>
          </p>
        </section>

        <NetworkGate>
          <CreateAgreementForm onCreated={bumpDashboard} />
          <Dashboard
            refreshKey={refreshKey}
            onActionSuccess={bumpDashboard}
          />
        </NetworkGate>
      </main>
    </div>
  )
}

export default App
