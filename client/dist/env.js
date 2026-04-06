const DEFAULTS = {
    localnet: {
        rpcUrl: 'http://127.0.0.1:8899',
        fiveVmProgramId: '55555SyrYLzydvDMBhAL8uo6h4WETHTm81z8btf6nAVJ'
    },
    devnet: {
        rpcUrl: 'https://api.devnet.solana.com',
        fiveVmProgramId: '55555SyrYLzydvDMBhAL8uo6h4WETHTm81z8btf6nAVJ'
    },
    mainnet: {
        rpcUrl: 'https://api.mainnet-beta.solana.com',
        fiveVmProgramId: '55555SyrYLzydvDMBhAL8uo6h4WETHTm81z8btf6nAVJ'
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
