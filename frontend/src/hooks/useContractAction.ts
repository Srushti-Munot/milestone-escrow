import { useEffect } from 'react'
import {
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'

export type TxPhase = 'idle' | 'pending' | 'success' | 'error'

type UseContractActionOptions = {
  onSuccess?: () => void
}

/** Shared write + wait-for-receipt pattern. Success only after confirmation. */
export function useContractAction(options: UseContractActionOptions = {}) {
  const { onSuccess } = options
  const {
    writeContract,
    data: hash,
    error: writeError,
    isPending,
    reset,
  } = useWriteContract()

  const {
    isLoading: isConfirming,
    isSuccess,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (isSuccess) {
      onSuccess?.()
    }
  }, [isSuccess, onSuccess])

  const phase: TxPhase =
    writeError || receiptError
      ? 'error'
      : isPending || isConfirming
        ? 'pending'
        : isSuccess
          ? 'success'
          : 'idle'

  const message =
    writeError?.message ??
    receiptError?.message ??
    (isPending
      ? 'Confirm the transaction in your wallet…'
      : isConfirming
        ? 'Waiting for the receipt on Monad Testnet…'
        : isSuccess
          ? 'Transaction confirmed.'
          : undefined)

  return {
    writeContract,
    hash,
    phase,
    message,
    isBusy: isPending || isConfirming,
    reset,
  }
}
