import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import { FiveProgram, FiveSDK } from '@5ive-tech/sdk';
import { CLIENT_ENV } from './env.js';

type AbiParameter = {
  name: string;
  is_account?: boolean;
  param_type?: string;
  type?: string;
};

const RPC_URL = CLIENT_ENV.rpcUrl;
const FIVE_VM_PROGRAM_ID = CLIENT_ENV.fiveVmProgramId;
const SCRIPT_ACCOUNT_FILE = join(process.cwd(), 'script-account.json');
const FALLBACK_PAYER_FILE = join(process.cwd(), 'payer.json');
const ACCOUNT_OVERRIDES: Record<string, Record<string, string>> = {
  // Example:
  // init_counter: {
  //   counter: '<COUNTER_PUBKEY>',
  //   authority: '<AUTHORITY_PUBKEY>'
  // }
};

function normalizePath(path: string): string {
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

async function loadPayer(): Promise<Keypair> {
  const defaultPath = normalizePath(CLIENT_ENV.payerPath);
  try {
    const secret = JSON.parse(await readFile(defaultPath, 'utf8')) as number[];
    return Keypair.fromSecretKey(new Uint8Array(secret));
  } catch {
    try {
      const secret = JSON.parse(await readFile(FALLBACK_PAYER_FILE, 'utf8')) as number[];
      return Keypair.fromSecretKey(new Uint8Array(secret));
    } catch {
      const generated = Keypair.generate();
      const { writeFile } = await import('fs/promises');
      await writeFile(FALLBACK_PAYER_FILE, JSON.stringify(Array.from(generated.secretKey), null, 2) + '\n');
      return generated;
    }
  }
}

async function loadSavedScriptAccount(): Promise<string | undefined> {
  try {
    const saved = JSON.parse(await readFile(SCRIPT_ACCOUNT_FILE, 'utf8')) as { pubkey?: string };
    return saved.pubkey;
  } catch {
    return undefined;
  }
}

async function saveScriptAccount(pubkey: string, transactionId?: string): Promise<void> {
  const { writeFile } = await import('fs/promises');
  await writeFile(
    SCRIPT_ACCOUNT_FILE,
    JSON.stringify(
      {
        pubkey,
        transactionId,
        updatedAt: new Date().toISOString()
      },
      null,
      2
    ) + '\n'
  );
}

async function ensureDeployedScriptAccount(
  connection: Connection,
  payer: Keypair,
  bytecode: Uint8Array
): Promise<string> {
  const saved = await loadSavedScriptAccount();
  const vmProgramId = new PublicKey(FIVE_VM_PROGRAM_ID);

  if (saved) {
    try {
      const info = await connection.getAccountInfo(new PublicKey(saved));
      if (info && info.owner.equals(vmProgramId)) {
        return saved;
      }
    } catch {
      // redeploy below
    }
  }

  const deployment = await FiveSDK.deployToSolana(bytecode, connection, payer, {
    fiveVMProgramId: FIVE_VM_PROGRAM_ID
  });
  if (!deployment.success || !deployment.programId) {
    throw new Error(`Failed to deploy token script: ${deployment.error || 'unknown error'}`);
  }

  await saveScriptAccount(deployment.programId, deployment.transactionId);
  return deployment.programId;
}

function getAccountOverrides(functionName: string): Record<string, string> {
  return ACCOUNT_OVERRIDES[functionName] || ACCOUNT_OVERRIDES['*'] || {};
}

function parseComputeUnitsFromLogs(logs: string[] | null | undefined): number | undefined {
  if (!logs) return undefined;
  for (const line of logs) {
    const match = line.match(/consumed\s+(\d+)\s+of/i);
    if (match) return Number(match[1]);
  }
  return undefined;
}

function defaultValueForType(typeName: string | undefined): any {
  const normalized = (typeName || '').toLowerCase();
  if (normalized === 'bool' || normalized === 'boolean') return true;
  if (normalized.startsWith('string')) return 'demo';
  if (normalized === 'pubkey') {
    throw new Error('Missing pubkey argument value. Provide an explicit value in the client input mapping.');
  }
  return 1;
}

async function run(): Promise<void> {
  const artifactPath = join(process.cwd(), '..', 'build', 'main.five');
  const artifactText = await readFile(artifactPath, 'utf8');
  const { abi, bytecode } = await FiveSDK.loadFiveFile(artifactText);

  const connection = new Connection(RPC_URL, 'confirmed');
  const payer = await loadPayer();
  const scriptAccount = await ensureDeployedScriptAccount(connection, payer, bytecode);
  const program = FiveProgram.fromABI(scriptAccount, abi, {
    fiveVMProgramId: FIVE_VM_PROGRAM_ID
  });
  const fiveVmProgramId = program.getFiveVMProgramId();

  const preferred = ["init_counter","get_value"] as string[];
  const available = program.getFunctions();
  const targets = preferred.filter((name) => available.includes(name));
  if (targets.length === 0 && available.length > 0) {
    targets.push(available[0]);
  }

  if (targets.length === 0) {
    throw new Error('No functions found in ABI. Run npm run build first.');
  }

  console.log('[client] Loaded ABI from ../build/main.five');
  console.log('[client] RPC:', RPC_URL);
  console.log('[client] Payer:', payer.publicKey.toBase58());
  console.log('[client] Script account:', scriptAccount);
  console.log('[client] Five VM program id:', fiveVmProgramId);
  console.log('[client] Mode: on-chain');
  console.log('[client] Target functions:', targets.join(', '));

  for (const functionName of targets) {
    const functionDef: any = program.getFunction(functionName);
    const params: AbiParameter[] = functionDef?.parameters || [];
    const accountArgs: Record<string, string> = getAccountOverrides(functionName);
    const dataArgs: Record<string, any> = {};

    for (const param of params) {
      if (param.is_account && !accountArgs[param.name]) {
        const attributes = (param as any).attributes || [];
        if (Array.isArray(attributes) && attributes.includes('signer')) {
          accountArgs[param.name] = payer.publicKey.toBase58();
        } else {
          throw new Error(
            `Missing account override for '${param.name}' in function '${functionName}'. Add it to ACCOUNT_OVERRIDES.`
          );
        }
      } else {
        dataArgs[param.name] = defaultValueForType(param.param_type || param.type);
      }
    }

    let builder = program.function(functionName);
    if (Object.keys(accountArgs).length > 0) {
      builder = builder.accounts(accountArgs);
    }
    if (Object.keys(dataArgs).length > 0) {
      builder = builder.args(dataArgs);
    }

    const instruction = await builder.instruction();
    console.log('\n[client] function:', functionName);
    console.log('[client] instruction bytes:', Buffer.from(instruction.data, 'base64').length);
    console.log('[client] account metas:', instruction.keys.length);

    const txIx = new TransactionInstruction({
      programId: new PublicKey(instruction.programId),
      keys: instruction.keys.map((k) => ({
        pubkey: new PublicKey(k.pubkey),
        isSigner: k.isSigner,
        isWritable: k.isWritable
      })),
      data: Buffer.from(instruction.data, 'base64')
    });
    const tx = new Transaction().add(txIx);
    const signature = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: 'confirmed' });
    const txDetails = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });
    const metaErr = txDetails?.meta?.err ?? null;
    const computeUnits =
      txDetails?.meta?.computeUnitsConsumed ?? parseComputeUnitsFromLogs(txDetails?.meta?.logMessages);

    console.log('[client] signature:', signature);
    console.log('[client] meta.err:', metaErr);
    console.log('[client] compute units:', computeUnits ?? 'n/a');
    if (metaErr !== null) {
      throw new Error('on-chain execution failed');
    }
  }
}

run().catch((error) => {
  console.error('[client] failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
