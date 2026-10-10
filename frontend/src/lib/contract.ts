import type { Abi, Address } from 'viem'
import abiJson from '@shared/abi.json' with { type: 'json' }
import addressJson from '@shared/address.json' with { type: 'json' }

export const escrowAbi = abiJson as Abi
export const escrowAddress = addressJson.address as Address
export const escrowChainId = addressJson.chainId
export const escrowNetworkName = addressJson.network
