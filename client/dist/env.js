const DEFAULTS = {
    localnet: {
        rpcUrl: 'http://127.0.0.1:8899',
        fiveVmProgramId: '8h8gqgMhfq5qmPbs9nNHkXNoy2jb1JywxaRC6W68wGVm'
    },
    devnet: {
        rpcUrl: 'https://api.devnet.solana.com',
        fiveVmProgramId: '5ive5hbC3aRsvq37MP5m4sHtTSFxT4Cq1smS4ddyWJ6h'
    },
    mainnet: {
        rpcUrl: 'https://api.mainnet-beta.solana.com',
        fiveVmProgramId: '5ive5hbC3aRsvq37MP5m4sHtTSFxT4Cq1smS4ddyWJ6h'
    }
};
const network = process.env.FIVE_NETWORK || 'devnet';
const selected = DEFAULTS[network] || DEFAULTS.devnet;
export const CLIENT_ENV = {
    network,
    rpcUrl: process.env.FIVE_RPC_URL || selected.rpcUrl,
    fiveVmProgramId: process.env.FIVE_VM_PROGRAM_ID || process.env.FIVE_PROGRAM_ID || selected.fiveVmProgramId,
    scriptAccount: process.env.FIVE_SCRIPT_ACCOUNT || '',
    payerPath: process.env.FIVE_PAYER_PATH || process.env.FIVE_KEYPAIR_PATH || '~/.config/solana/id.json'
};
