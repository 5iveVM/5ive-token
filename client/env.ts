const DEFAULTS = {
  localnet: {
    rpcUrl: 'http://127.0.0.1:8899',
    fiveVmProgramId: 'FmzLpEQryX1UDtNjDBPx9GDsXiThFtzjsZXtTLNLU7Vb'
  },
  devnet: {
    rpcUrl: 'https://api.devnet.solana.com',
    fiveVmProgramId: '4Qxf3pbCse2veUgZVMiAm3nWqJrYo2pT4suxHKMJdK1d'
  }
} as const;

export type FiveNetwork = 'localnet' | 'devnet';

const network = (process.env.FIVE_NETWORK as FiveNetwork) || 'devnet';
const selected = DEFAULTS[network] || DEFAULTS.devnet;

export const CLIENT_ENV = {
  network,
  rpcUrl: process.env.FIVE_RPC_URL || selected.rpcUrl,
  fiveVmProgramId:
    process.env.FIVE_VM_PROGRAM_ID || process.env.FIVE_PROGRAM_ID || selected.fiveVmProgramId,
  scriptAccount: process.env.FIVE_SCRIPT_ACCOUNT || '',
  payerPath:
    process.env.FIVE_PAYER_PATH || process.env.FIVE_KEYPAIR_PATH || '~/.config/solana/id.json'
};
