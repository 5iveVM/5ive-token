import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import { FiveProgram, FiveSDK } from '@5ive-tech/sdk';
import { CLIENT_ENV } from './env.js';

const NETWORK = process.env.FIVE_NETWORK || (process.argv.includes('--localnet') ? 'localnet' : CLIENT_ENV.network);
const RPC_BY_NETWORK: Record<string, string> = {
  localnet: 'http://127.0.0.1:8899',
  devnet: 'https://api.devnet.solana.com',
  mainnet: 'https://api.mainnet-beta.solana.com',
};
const RPC_URL = process.env.FIVE_RPC_URL || (RPC_BY_NETWORK[NETWORK] || CLIENT_ENV.rpcUrl);
const PROGRAM_BY_NETWORK: Record<string, string> = {
  localnet: '8h8gqgMhfq5qmPbs9nNHkXNoy2jb1JywxaRC6W68wGVm',
  devnet: '5ive5hbC3aRsvq37MP5m4sHtTSFxT4Cq1smS4ddyWJ6h',
  mainnet: '5ive5hbC3aRsvq37MP5m4sHtTSFxT4Cq1smS4ddyWJ6h',
};
const FIVE_VM_PROGRAM_ID = process.env.FIVE_VM_PROGRAM_ID || process.env.FIVE_PROGRAM_ID || (
  PROGRAM_BY_NETWORK[NETWORK] || CLIENT_ENV.fiveVmProgramId
);
const VM_STATE_BY_NETWORK: Record<string, string> = {
  localnet: '3grckjTe9o2AcNq7GWRtJFsYBHdsTAZeSDCGcUkyftCm',
  devnet: '8ip3qGGETf8774jo6kXbsTTrMm5V9bLuGC4znmyZjT3z',
  mainnet: 'GMQFFG9iy63CyUTq1pbXrAK9AcWYLbtcx5vm6KUT7CDY',
};
const VM_STATE_ACCOUNT =
  process.env.FIVE_VM_STATE_ACCOUNT ||
  process.env.VM_STATE_PDA ||
  (VM_STATE_BY_NETWORK[NETWORK] || VM_STATE_BY_NETWORK.localnet);
const SCRIPT_ACCOUNT_FILE = join(process.cwd(), `token-script-account.${NETWORK}.json`);
const FALLBACK_PAYER_FILE = join(process.cwd(), 'payer.json');

function normalizePath(path: string): string {
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

type EncodedInstruction = {
  programId: string;
  keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
  data: string;
};

type StepResult = {
  name: string;
  signature: string;
  computeUnits: number | null;
};

function parseConsumedUnits(logs: string[] | null | undefined): number | null {
  if (!logs) return null;
  for (const line of logs) {
    const m = line.match(/consumed (\d+) of/);
    if (m) return Number(m[1]);
  }
  return null;
}

async function loadKeypair(path: string, generateIfMissing = true): Promise<Keypair> {
  try {
    const secret = JSON.parse(await readFile(normalizePath(path), 'utf8')) as number[];
    return Keypair.fromSecretKey(new Uint8Array(secret));
  } catch (e) {
    if (generateIfMissing) {
      const generated = Keypair.generate();
      await writeFile(path, JSON.stringify(Array.from(generated.secretKey), null, 2) + '\n');
      return generated;
    }
    throw e;
  }
}

async function loadPayer(): Promise<Keypair> {
  try {
    return await loadKeypair(CLIENT_ENV.payerPath, false);
  } catch {
    return await loadKeypair(FALLBACK_PAYER_FILE);
  }
}

async function loadOrCreateScriptAccount(): Promise<string> {
  try {
    const saved = JSON.parse(await readFile(SCRIPT_ACCOUNT_FILE, 'utf8')) as { pubkey?: string };
    if (saved.pubkey) return saved.pubkey;
  } catch {}
  const kp = Keypair.generate();
  await writeFile(
    SCRIPT_ACCOUNT_FILE,
    JSON.stringify(
      {
        pubkey: kp.publicKey.toBase58(),
        secretKey: Array.from(kp.secretKey)
      },
      null,
      2
    ) + '\n'
  );
  return kp.publicKey.toBase58();
}

async function ensureDeployedScriptAccount(
  connection: Connection,
  payer: Keypair,
  bytecode: Uint8Array
): Promise<string> {
  const saved = await loadOrCreateScriptAccount();
  const vmProgramId = new PublicKey(FIVE_VM_PROGRAM_ID);

  try {
    const info = await connection.getAccountInfo(new PublicKey(saved));
    if (info && info.owner.equals(vmProgramId)) {
      return saved;
    }
  } catch {}

  const deployFn =
    bytecode.length > 1200
      ? FiveSDK.deployLargeProgramToSolana.bind(FiveSDK)
      : FiveSDK.deployToSolana.bind(FiveSDK);
  const deployment = await deployFn(bytecode, connection, payer, {
    fiveVMProgramId: FIVE_VM_PROGRAM_ID
  });
  const deploymentData = deployment as any;
  const deployedScriptAccount = deploymentData.programId ?? deploymentData.scriptAccount;
  const deploymentTxId = deploymentData.transactionId ?? deploymentData.transactionIds?.[0];
  if (!deployment.success || !deployedScriptAccount) {
    throw new Error(`Failed to deploy token script: ${deployment.error || 'unknown error'}`);
  }

  await writeFile(
    SCRIPT_ACCOUNT_FILE,
    JSON.stringify(
      {
        pubkey: deployedScriptAccount,
        transactionId: deploymentTxId,
        updatedAt: new Date().toISOString()
      },
      null,
      2
    ) + '\n'
  );
  return deployedScriptAccount;
}

function normalizeInstructionKeys(
  encoded: EncodedInstruction,
  payer: PublicKey,
  feeRecipient: PublicKey | null,
  extraSignerPubkeys: Set<string>
) {
  const keys = encoded.keys.map((k) => {
    const isPayer = k.pubkey === payer.toBase58();
    const isSigner = isPayer || extraSignerPubkeys.has(k.pubkey) || k.isSigner;
    const isWritable = isPayer ? true : k.isWritable;
    return {
      pubkey: new PublicKey(k.pubkey),
      isSigner,
      isWritable,
    };
  });

  if (feeRecipient && !keys.some((k) => k.pubkey.equals(feeRecipient))) {
    keys.push({ pubkey: feeRecipient, isSigner: false, isWritable: true });
  }
  if (!keys.some((k) => k.pubkey.equals(SystemProgram.programId))) {
    keys.push({ pubkey: SystemProgram.programId, isSigner: false, isWritable: false });
  }
  return keys;
}

async function sendStep(
  name: string,
  connection: Connection,
  payer: Keypair,
  feeRecipient: PublicKey | null,
  encoded: EncodedInstruction,
  signers: Keypair[]
): Promise<StepResult> {
  const signerSet = new Set(signers.map((s) => s.publicKey.toBase58()));
  const keys = normalizeInstructionKeys(encoded, payer.publicKey, feeRecipient, signerSet);

  console.log(`\n[token-client] ${name} account metas:`, keys.map((k) => ({
    pubkey: k.pubkey.toBase58(),
    isSigner: k.isSigner,
    isWritable: k.isWritable,
  })));

  const tx = new Transaction().add(
    new TransactionInstruction({
      programId: new PublicKey(encoded.programId),
      keys,
      data: Buffer.from(encoded.data, 'base64'),
    })
  );
  tx.feePayer = payer.publicKey;

  const uniqueSigners = new Map<string, Keypair>();
  uniqueSigners.set(payer.publicKey.toBase58(), payer);
  for (const s of signers) uniqueSigners.set(s.publicKey.toBase58(), s);

  const signature = await sendAndConfirmTransaction(
    connection,
    tx,
    Array.from(uniqueSigners.values()),
    { commitment: 'confirmed' }
  );

  const txMeta = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  const computeUnits =
    txMeta?.meta?.computeUnitsConsumed ?? parseConsumedUnits(txMeta?.meta?.logMessages);

  console.log(`[token-client] ${name} sig: ${signature}`);
  console.log(`[token-client] ${name} CU: ${computeUnits ?? 'n/a'}`);

  return { name, signature, computeUnits };
}

async function run(): Promise<void> {
  const artifactPath = join(process.cwd(), '..', 'build', 'main.five');
  const artifactText = await readFile(artifactPath, 'utf8');
  const loaded = await FiveSDK.loadFiveFile(artifactText);
  const abi = Array.isArray(loaded.abi) ? { functions: loaded.abi } : loaded.abi;

  const connection = new Connection(RPC_URL, 'confirmed');
  const payer = await loadPayer();
  if (NETWORK === 'localnet') {
    const balance = await connection.getBalance(payer.publicKey, 'confirmed');
    if (balance < 2_000_000_000) {
      const sig = await connection.requestAirdrop(payer.publicKey, 3_000_000_000);
      await connection.confirmTransaction(sig, 'confirmed');
    }
  }
  const scriptAccount = await ensureDeployedScriptAccount(connection, payer, loaded.bytecode);
  const fees = await FiveSDK.getFees(connection, FIVE_VM_PROGRAM_ID);
  const feeRecipient = fees.adminAccount ? new PublicKey(fees.adminAccount) : null;
  const program = FiveProgram.fromABI(scriptAccount, abi, {
    fiveVMProgramId: FIVE_VM_PROGRAM_ID,
    vmStateAccount: VM_STATE_ACCOUNT,
    feeReceiverAccount: fees.adminAccount || undefined,
  });

  const mintKp = Keypair.generate();
  const owner = payer;
  const sourceTokenAccountKp = Keypair.generate();
  const destinationTokenAccountKp = Keypair.generate();
  const results: StepResult[] = [];

  console.log('[token-client] Loaded ABI from ../build/main.five');
  console.log('[token-client] Network:', NETWORK);
  console.log('[token-client] RPC:', RPC_URL);
  console.log('[token-client] Payer:', payer.publicKey.toBase58());
  console.log('[token-client] VM Program:', FIVE_VM_PROGRAM_ID);
  console.log('[token-client] VM State:', VM_STATE_ACCOUNT);
  console.log('[token-client] Fee Admin:', fees.adminAccount || 'none');
  console.log('[token-client] Fee Recipient:', fees.adminAccount || 'none');
  console.log('[token-client] Script:', scriptAccount);
  console.log('[token-client] Mint:', mintKp.publicKey.toBase58());
  console.log('[token-client] Owner/Authority:', owner.publicKey.toBase58());
  console.log('[token-client] Source Token Account:', sourceTokenAccountKp.publicKey.toBase58());
  console.log('[token-client] Destination Token Account:', destinationTokenAccountKp.publicKey.toBase58());

  const initMintIx = await program.function('init_mint')
    .accounts({
      mint: mintKp.publicKey.toBase58(),
      authority: payer.publicKey.toBase58()
    })
    .args({
      freeze_authority: payer.publicKey.toBase58(),
      decimals: 9,
      name: 'Five Token',
      symbol: '5IVE'
    }).instruction();
  results.push(await sendStep('init_mint', connection, payer, feeRecipient, initMintIx as EncodedInstruction, [payer, mintKp]));

  const initSourceAccIx = await program.function('init_token_account')
    .accounts({
      token_account: sourceTokenAccountKp.publicKey.toBase58(),
      payer: payer.publicKey.toBase58(),
      mint: mintKp.publicKey.toBase58()
    })
    .args({
      owner: owner.publicKey.toBase58()
    }).instruction();
  results.push(await sendStep('init_token_account(source)', connection, payer, feeRecipient, initSourceAccIx as EncodedInstruction, [payer, sourceTokenAccountKp]));

  const initDestinationAccIx = await program.function('init_token_account')
    .accounts({
      token_account: destinationTokenAccountKp.publicKey.toBase58(),
      payer: payer.publicKey.toBase58(),
      mint: mintKp.publicKey.toBase58()
    })
    .args({
      owner: owner.publicKey.toBase58()
    }).instruction();
  results.push(await sendStep('init_token_account(destination)', connection, payer, feeRecipient, initDestinationAccIx as EncodedInstruction, [payer, destinationTokenAccountKp]));

  const mintToIx = await program.function('mint_to')
    .accounts({
      mint: mintKp.publicKey.toBase58(),
      destination: sourceTokenAccountKp.publicKey.toBase58(),
      authority: payer.publicKey.toBase58()
    })
    .args({
      amount: 1_000_000_000
    }).instruction();
  results.push(await sendStep('mint_to', connection, payer, feeRecipient, mintToIx as EncodedInstruction, [payer]));

  const approveIx = await program.function('approve')
    .accounts({
      source: sourceTokenAccountKp.publicKey.toBase58(),
      owner: owner.publicKey.toBase58()
    })
    .args({
      delegate: payer.publicKey.toBase58(),
      amount: 200_000_000
    }).instruction();
  results.push(await sendStep('approve', connection, payer, feeRecipient, approveIx as EncodedInstruction, [payer]));

  const transferIx = await program.function('transfer')
    .accounts({
      source: sourceTokenAccountKp.publicKey.toBase58(),
      destination: destinationTokenAccountKp.publicKey.toBase58(),
      authority: owner.publicKey.toBase58()
    })
    .args({
      amount: 100_000_000
    }).instruction();
  results.push(await sendStep('transfer', connection, payer, feeRecipient, transferIx as EncodedInstruction, [payer]));

  const revokeIx = await program.function('revoke')
    .accounts({
      source: sourceTokenAccountKp.publicKey.toBase58(),
      owner: owner.publicKey.toBase58()
    })
    .args({}).instruction();
  results.push(await sendStep('revoke', connection, payer, feeRecipient, revokeIx as EncodedInstruction, [payer]));

  const freezeIx = await program.function('freeze_account')
    .accounts({
      mint: mintKp.publicKey.toBase58(),
      target: destinationTokenAccountKp.publicKey.toBase58(),
      authority: owner.publicKey.toBase58()
    })
    .args({}).instruction();
  results.push(await sendStep('freeze_account', connection, payer, feeRecipient, freezeIx as EncodedInstruction, [payer]));

  const thawIx = await program.function('thaw_account')
    .accounts({
      mint: mintKp.publicKey.toBase58(),
      target: destinationTokenAccountKp.publicKey.toBase58(),
      authority: owner.publicKey.toBase58()
    })
    .args({}).instruction();
  results.push(await sendStep('thaw_account', connection, payer, feeRecipient, thawIx as EncodedInstruction, [payer]));

  const burnIx = await program.function('burn')
    .accounts({
      mint: mintKp.publicKey.toBase58(),
      source: destinationTokenAccountKp.publicKey.toBase58(),
      authority: owner.publicKey.toBase58()
    })
    .args({
      amount: 10_000_000
    }).instruction();
  results.push(await sendStep('burn', connection, payer, feeRecipient, burnIx as EncodedInstruction, [payer]));

  const setMintAuthorityIx = await program.function('set_mint_authority')
    .accounts({
      mint: mintKp.publicKey.toBase58(),
      current_authority: owner.publicKey.toBase58()
    })
    .args({
      new_authority: owner.publicKey.toBase58()
    }).instruction();
  results.push(await sendStep('set_mint_authority', connection, payer, feeRecipient, setMintAuthorityIx as EncodedInstruction, [payer]));

  const setFreezeAuthorityIx = await program.function('set_freeze_authority')
    .accounts({
      mint: mintKp.publicKey.toBase58(),
      current_authority: owner.publicKey.toBase58()
    })
    .args({
      new_authority: owner.publicKey.toBase58()
    }).instruction();
  results.push(await sendStep('set_freeze_authority', connection, payer, feeRecipient, setFreezeAuthorityIx as EncodedInstruction, [payer]));

  console.log('\nTOKEN_PUBLIC_FUNCTION_CU');
  let total = 0;
  for (const r of results) {
    const cu = r.computeUnits ?? 0;
    total += cu;
    console.log(`  ${r.name}: cu=${r.computeUnits ?? 'n/a'} sig=${r.signature}`);
  }
  console.log(`  total_cu=${total}`);
}

run().catch(console.error);
