# Gemini Context: 5ive-token

This project is a **5IVE VM** smart contract application built for the Solana blockchain. It uses the 5IVE DSL for contract logic and a TypeScript-based client for on-chain interaction.

## Project Overview

- **Purpose:** A starter project implementing a simple counter on the 5IVE VM.
- **Language:** 5IVE DSL (`.v` files).
- **Core Components:**
  - **Contract (`src/main.v`):** Defines a `Counter` account and instructions to initialize, increment, and query the counter.
  - **Token Contract (`src/token.v`):** A comprehensive SPL-like token implementation with minting, transfers, delegation, and freezing.
  - **Client (`client/main.ts`):** TypeScript client for the counter program.
  - **Token Client (`client/token.ts`):** TypeScript client for the token program.
  - **Tests (`tests/`):** Unit and integration tests using 5IVE's built-in test runner.

## Key Files

- `src/main.v`: Main contract logic.
- `src/token.v`: Token contract logic.
- `five.toml`: Project-level configuration for the 5IVE compiler and deployment.
- `package.json`: Build scripts and dependencies.
- `client/main.ts`: TypeScript entry point for the counter program.
- `client/token.ts`: TypeScript entry point for the token program.
- `tests/main.test.v`: DSL-level tests for the counter.
- `tests/token.test.v`: DSL-level tests for the token contract.
- `AGENTS.md`: Technical specification and "Source of Truth" for 5IVE DSL syntax and workflows.

## Building and Running

### Development Workflow

```bash
# Compile the contract
npm run build

# Run tests
npm test

# Deploy to devnet (configured in five.toml)
npm run deploy

# Run the counter client (devnet)
npm run client:run

# Run the token client (devnet)
npm run client:token
```

### Testing Patterns

- **DSL Tests:** Use `pub test_*` naming convention in `tests/*.v`.
- **Test Parameters:** Specified via `// @test-params <inputs> <expected>` comments.
- **State Fixtures:** `tests/*.test.json` can define account states for on-chain tests.

## 5IVE DSL Conventions

Based on `AGENTS.md`, strictly follow these syntax rules:

1.  **Account Fields:** Every field must end with a semicolon `;`.
2.  **Authorization:** Use `account @signer` (not `pubkey @signer`) to preserve the `.key` accessor.
3.  **Key Access:** Use `param.key` to extract the public key from an `account`-typed parameter.
4.  **Return Types:** Use `-> Type` syntax for functions returning values.
5.  **Immutability:** `let x = ...` is immutable. Use `let mut x = ...` for variables that need reassignment.
6.  **Attribute Stacking:** The standard order for account attributes is: `Type @mut @init(payer=p, space=n) @signer`.

## Project Architecture

- **Source:** Managed in `src/`.
- **Artifacts:** Compiled `.five` files are placed in `build/`.
- **Configuration:** `five.toml` handles network targets (default: `devnet`) and optimization levels.
