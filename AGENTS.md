# AGENTS.md - Complete 5IVE DSL Agent Bootstrap

This file is written for agents with zero prior 5IVE knowledge.
It is intentionally self-contained and should be treated as the baseline technical specification for authoring, testing, deploying, and integrating 5IVE programs.

## 1) What 5IVE Is

5IVE is a DSL and toolchain for compiling compact bytecode programs for Solana execution paths.

Core surfaces:
1. Source language: `.v`
2. Canonical artifact: `.five` (bytecode + ABI)
3. CLI: `@5ive-tech/cli` (`5ive` canonical command; `five` alias supported)
4. SDK: `@5ive-tech/sdk` (`FiveSDK`, `FiveProgram`)

## 2) Source of Truth Policy

When docs conflict, resolve in this order:
1. Compiler/CLI/SDK source code
2. Package manifests + command definitions
3. READMEs/examples/docs

Never rely on stale docs when behavior is high-stakes (deploy/execute/CPI encoding).

## 3) Non-Negotiable Workflow

1. Inspect `five.toml` before code changes.
2. Compile to `.five`.
3. Run local/runtime tests.
4. Deploy with explicit target + program ID resolution path.
5. Execute and verify confirmed tx metadata (`meta.err == null`).
6. Record signatures + compute units.

### 3.1 Strict Authoring Rules

These rules are non-negotiable and prevent the most common compilation failures:

1. **All account fields must end with `;`** — missing semicolons cause parser failure.
2. **Use `account @signer` for authorization** — not `pubkey @signer`. This preserves the `.key` accessor.
3. **Use `.key` on `account`-typed parameters** to extract public keys for comparisons and assignments.
4. **Use `-> ReturnType` for functions with return values** — e.g. `-> u64`, `-> pubkey`, `-> bool`.
5. **`pubkey(0)` and `0` are valid** for zero-initializing pubkey fields (disabling authorities).
6. **`string<N>` is production-safe** — use freely in accounts and function parameters.
7. **All comparison operators work in `require()`** — `==`, `!=`, `<`, `<=`, `>`, `>=`, `!`.
8. **Local variables are immutable by default** — use `let x = value;` for immutable bindings. **Use `let mut x = value;` if the variable will be reassigned** (e.g., in conditional branches). Attempting to reassign an immutable local causes a compiler error.

## 4) DSL Feature Inventory (Deep)

This section enumerates language features discovered from parser/compiler code and repo examples.

### 4.1 Top-level declarations
Observed and/or parsed:
1. `account Name { ... }` — **all fields must be terminated with `;`**
2. Global fields/variables (including `mut`)
3. `init { ... }` block
4. `constraints { ... }` block
5. Function/instruction definitions (`pub`, `fn`, optional `instruction` keyword)
6. `event Name { ... }` definitions
7. `interface Name ... { ... }` definitions
8. `use` / `import` statements
9. Legacy `script Name { ... }` wrapper (parser-supported)

```v
// ✅ CORRECT — semicolons required
account Mint {
    authority: pubkey;
    supply: u64;
    decimals: u8;
}

// ❌ WRONG — parser failure
account Mint {
    authority: pubkey
    supply: u64
}
```

### 4.2 Function definition forms
Parser accepts flexible forms:
1. `pub add(...) -> ... { ... }`
2. `fn add(...) { ... }`
3. `instruction add(...) { ... }`
4. `pub fn add(...) { ... }`

### 4.3 Parameter system
Each parameter supports:
1. Name + type: `x: u64`
2. Optional marker: `x?: u64`
3. Default value: `x: u64 = 10`
4. Attributes before or after type

Common attributes:
1. `@signer`
2. `@mut`
3. `@init`
4. Generic form: `@attribute(args...)`
5. Template-observed relation constraints: `@has(field)`

### 4.4 `@init` config support
`@init` can include config arguments:
1. `payer=...`
2. `space=...`
3. `seeds=[...]`
4. `bump=...`

Examples also show legacy bracket seed forms after `@init`.

**Attribute stacking order for account parameters (empirically verified):**

```
Type @mut @init(payer=name, space=bytes) @signer
```

Example:
```v
pub init_mint(
    mint_account: Mint @mut @init(payer=authority, space=256) @signer,
    authority: account @mut @signer,
    ...
)
```

Order: (1) Type declaration → (2) `@mut` → (3) `@init(...)` → (4) `@signer`.

### 4.5 Types
Supported/parsed type families:
1. Primitive numeric/bool/pubkey/string types (`u8..u128`, `i8..i64`, `bool`, `pubkey`, `string`)
2. `Account` type and account-typed params
3. **Sized strings: `string<N>`** — production-safe, use in accounts and function parameters
4. Arrays:
   - Rust style: `[T; N]`
   - TypeScript-style sized: `T[N]`
   - TypeScript-style dynamic: `T[]`
5. Tuples: `(T1, T2, ...)`
6. Inline struct types: `{ field: Type, ... }`
7. Generic types:
   - `Option<T>`
   - `Result<T, E>`
   - nested generics (`Option<Option<u64>>` etc.)
8. Namespaced/custom types: `module::Type`
9. Optional account fields in structs/accounts: `field?: Type`
10. **`pubkey(0)` and integer `0`** — valid for zero-initialization of pubkey fields (interchangeable)

### 4.6 Statements
Observed and parser-supported:
1. `let` declarations (with `mut` and optional type annotation)
   - Type inference works: `let is_owner = source.owner == authority.key;` infers `bool`
   - Use `let` without explicit annotation for boolean and scalar expressions
   - **Immutability by default**: `let x = value;` creates an immutable binding; reassignment will fail
   - **For reassignable variables, use `let mut`**: `let mut x: u64 = 0; ... x = new_value;`
   - Example: `let mut shares: u64 = 0; if (condition) { shares = computed_value; }`
2. Assignment:
   - direct: `x = y`
   - compound: `+=`, `-=`, `*=`, `/=`, `<<=`, `>>=`, `&=`, `|=`, `^=`
3. Field assignment: `obj.field = value`
4. Return statements (`return`, `return value`) — see §4.13 for return type syntax
5. Guard/assertion: `require(condition)` — **all operators verified:**
   - Comparison: `==`, `!=`, `<`, `<=`, `>`, `>=`
   - Boolean negation: `!expr`
   - Logical: `&&`, `||`
   - Example: `require(source.balance >= amount);`
   - Example: `require(!account.is_frozen);`
6. Conditionals:
   - `if (...) {}`
   - `else if (...) {}`
   - `else {}`
   - Conditionals support nested `require()` statements and multiple assignments in both branches
7. Pattern matching: `match expr { ... }`, with optional arm guards (`if ...`)
8. Loops:
   - `while (...) { ... }`
   - `for (init; cond; update) { ... }`
   - `for (item in iterable) { ... }`
   - `do { ... } while (...);`
9. Tuple destructuring:
   - declaration style: `let (a, b) = expr`
   - assignment style for tuple targets
10. Event emission: `emit EventName { field: value, ... }`
11. Expression statements (function/method calls, constructors like `Some(...)`)

### 4.7 Expressions and operators
Parser handles:
1. Arithmetic: `+`, `-`, `*`, `/`, `%`
2. Checked-arithmetic tokens in grammar: `+?`, `-?`, `*?`
   - Some repo tests indicate these were replaced/legacy in current examples.
3. Comparison: `==`, `!=`, `<`, `<=`, `>`, `>=`
4. Boolean: `&&`, `||`, `!`
5. Bitwise: `&`, `|`, `^`, `~`
6. Shifts/bit ops: `<<`, `>>`, `>>>`, `<<<`
7. Range operator: `..`
8. Unary `+`/`-`
9. Cast syntax: `expr as Type`
10. Error propagation postfix: `expr?`
11. Field access: `obj.field`
12. Tuple access: `obj.0`
13. Array indexing: `arr[idx]`
14. Function calls
15. Method calls: `obj.method(args...)`
16. Namespaced calls: `module::function(...)`
17. Struct literals: `{ field: expr, ... }`
18. Array literals: `[a, b, c]`
19. Tuple literals: `(a, b)`
20. Option/Result constructors and patterns:
   - `Some(...)`, `None`
   - `Ok(...)`, `Err(...)`

### 4.8 Imports and modules
`use`/`import` system supports:
1. External module specifier via quoted literal
2. Local module specifier via identifier path
3. Nested local module paths using `::`
4. Scoped namespace forms with symbols: `!`, `@`, `#`, `$`, `%`
5. Member imports:
   - single: `::name`
   - list: `::{a, b}`
   - typed list entries: `method foo`, `interface Bar`

### 4.9 Interfaces and CPI (Cross-Program Invocation)

Interfaces define external program calls. **Empirically verified rules:**

1. **Program binding:** always use `@program("...")` (the `@` prefix is required)
2. **Serializer options:**
   - **Default (bincode):** omit `@serializer(...)` — bincode is the default, works for SPL programs and most Solana programs
   - **Anchor programs (borsh):** use `@anchor` marker — automatically sets borsh serializer **and** auto-generates discriminators from method names
   - **Explicit borsh:** use `@serializer("borsh")` if needed without `@anchor`
3. **Discriminators:**
   - **Manual:** use single `u8` value inline on method: `method @discriminator(N) (...)`
   - **Anchor auto-generation:** `@anchor` interface automatically computes discriminators from method names — **do not** manually specify `@discriminator` with `@anchor`
   - **Format:** single u8 value, **not** array format `@discriminator([3, 0, 0, 0])`
4. **Account parameters in interfaces:** use `Account` type, **not** `pubkey`
   - `pubkey` is for data values only; `Account` represents an on-chain account passed to the CPI
5. **Calling interface methods:** use dot notation `InterfaceName.method(...)`, **not** `InterfaceName::method(...)`
6. **Passing accounts to CPI:** pass `account`-typed parameters directly, **not** `param.key`
7. **Function parameters for CPI accounts:** must be typed `account @mut` (not `pubkey`)

```v
// ✅ CORRECT: SPL Token (bincode, manual discriminators)
interface SPLToken @program("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") {
    transfer @discriminator(3) (
        source: Account,
        destination: Account,
        authority: Account,
        amount: u64
    );
}

// ✅ CORRECT: Anchor program (borsh, auto discriminators)
interface MyAnchorProgram @anchor @program("...") {
    initialize(          // discriminator auto-generated from "initialize"
        state: Account,
        authority: Account,
        value: u64
    );
}

// ✅ CORRECT: CPI call
pub call_external(
    external_account: account @mut,
    authority: account @signer,
    value: u64
) {
    MyAnchorProgram.initialize(external_account, authority, value);
}

// ❌ WRONG — common mistakes
// interface Program program("...")          ← missing @ on program
// @discriminator([3, 0, 0, 0])              ← array format, not u8
// transfer(src: pubkey, dst: pubkey, ...)   ← pubkey instead of Account
// Program::method(...)                      ← :: instead of .
// Program.method(account.key, ...)          ← .key unnecessary for accounts
// @anchor with @discriminator(3)            ← @anchor auto-generates, don't specify manually
```

CPI hard rules for agents:
1. Always use `@program("...")` with correct program ID
2. For Anchor programs: use `@anchor`, omit `@discriminator`
3. For non-Anchor programs: set `@discriminator(N)` as single u8 on each method, omit `@serializer`
4. Use `Account` for on-chain account params, scalar types for data params
5. Call with dot notation and pass account params directly

### 4.10 Events and error/enums
Parser/AST include:
1. Event definitions + `emit` statements
2. Enum/error-style definitions (`enum` path in parser)

Production note:
Treat event/error enum features as available in syntax, but verify runtime/compiler behavior in your exact toolchain version before relying on them for critical flows.

### 4.11 Testing-oriented language features
From tokenizer/parser support:
1. `#[...]` test attributes
2. `test` function parse path
3. Test attribute names/tokens include:
   - `ignore`
   - `should_fail`
   - `timeout`
4. Assertion tokens:
   - `assert_eq`
   - `assert_true`
   - `assert_false`
   - `assert_fails`
   - `assert_approx_eq`

Repository tests also use comment-based param conventions (`// @test-params ...`) in many scripts.

### 4.12 Blockchain-oriented built-ins
Core built-ins available in all contracts:
1. `derive_pda(...)` (including bump-return and bump-specified variants)
2. `get_clock()`
3. `get_key(...)`
4. **Account key access: `param.key`** — **core pattern for all `account`-typed parameters.** Use `.key` to extract pubkeys for comparisons and assignments.

```v
pub action(
    state: MyAccount @mut,
    caller: account @signer,
    ...
) {
    require(state.authority == caller.key);   // ownership check
    state.last_actor = caller.key;            // record who acted
}
```

5. **Authority revocation pattern:** assign `0` to any pubkey field to permanently disable it.
```v
state.authority = 0;  // revokes authority — irreversible
```

### 4.13 Return types and values
Functions can declare return types with `->` syntax:

```v
pub get_value(state: MyAccount) -> u64 {
    return state.amount;
}

pub initialize(
    state: MyAccount @mut @init(payer=creator, space=256) @signer,
    creator: account @mut @signer,
    ...
) -> pubkey {
    state.authority = creator.key;
    return state.key;
}
```

Confirmed return types: `u8`, `u16`, `u32`, `u64`, `u128`, `i8`..`i64`, `bool`, `pubkey`.

## 5) Feature Maturity Matrix (Agent Safety)

### 5.1 Generally production-oriented (widely used in templates)
1. Accounts, `@mut`, `@signer`, `@init` (with attribute stacking)
2. `require` with all comparison operators (`==`, `!=`, `<`, `<=`, `>`, `>=`, `!`)
3. Basic control flow (`if`, `else`, `while`) with nested logic
4. Arithmetic/comparison/boolean expressions
5. `.five` compile/deploy/execute path
6. `interface` + explicit discriminator + explicit serializer CPI patterns
7. Return type declarations (`-> Type`) with `return value;`
8. `string<N>` fixed-size strings in accounts and parameters
9. `account.key` extraction from `account`-typed parameters
10. Authority disabling via `0` assignment to pubkey fields
11. `let` with type inference for scalar/boolean expressions
12. `pubkey(0)` zero-initialization

### 5.2 Available but validate per-version before critical use
1. Match expressions with `Option`/`Result`
2. Tuple destructuring and tuple returns
3. Advanced loop forms (`for`, `do-while`)
4. Event definition/emit workflows
5. Namespaced imports and scoped namespace symbols
6. Bitwise/shift operator-heavy code

### 5.3 Parser tokens exist; treat as reserved/experimental unless proven in your path
1. `query`, `when`, `realloc`, `pda` keywords
2. Some assertion/test keyword paths in non-test production code
3. Legacy checked-arithmetic operators (`+?`, `-?`, `*?`) where examples indicate migration

## 6) CLI Canonical Usage

### 6.1 Install and identity
```bash
npm install -g @5ive-tech/cli
5ive --version
```

### 6.2 Initialize
```bash
5ive init my-program
cd my-program
```

### 6.3 Compile
```bash
5ive compile src/main.v -o build/main.five
# or project-aware
5ive build
```

### 6.4 Local execute
```bash
5ive execute build/main.five --local -f 0
```

### 6.5 Configure devnet
```bash
5ive config init
5ive config set --target devnet
5ive config set --keypair ~/.config/solana/id.json
5ive config set --program-id <FIVE_VM_PROGRAM_ID> --target devnet
```

### 6.6 Deploy + execute on-chain
```bash
5ive deploy build/main.five --target devnet
5ive execute build/main.five --target devnet -f 0
```

### 6.7 Advanced deploy modes
```bash
5ive deploy build/main.five --target devnet --optimized --progress
5ive deploy build/main.five --target devnet --force-chunked --chunk-size 900
5ive deploy build/main.five --target devnet --dry-run --format json
```

### 6.8 Test modes
```bash
5ive test --sdk-runner
5ive test --filter "test_*" --verbose
5ive test --on-chain --target local
5ive test tests/ --on-chain --target devnet
5ive test tests/ --on-chain --target mainnet --allow-mainnet-tests --max-cost-sol 0.5
5ive test --sdk-runner --format json
```

## 7) Program ID and Target Resolution

On-chain command precedence (`deploy`, `execute`, `namespace`):
1. `--program-id`
2. `five.toml [deploy].program_id`
3. `5ive config` value for current target
4. `FIVE_PROGRAM_ID`

Never run on-chain commands with ambiguous target/program-id context.

## 8) SDK Canonical Usage

### 8.0 Generated client baseline
When this project is created via `5ive init`, start from `client/main.ts`:
1. Load `build/main.five` with `FiveSDK.loadFiveFile(...)`.
2. Create `FiveProgram` from generated ABI.
3. Use the self-contained default setup (devnet RPC + generated `script-account.json` + payer auto-loading).
4. Add function-specific client flows that mirror your contract methods and `tests/main.test.v`.
5. Keep this client file in sync whenever contract signatures or test scenarios change.

### 8.1 Load artifact
```ts
import fs from "fs";
import { FiveSDK } from "@5ive-tech/sdk";

const fiveFileText = fs.readFileSync("build/main.five", "utf8");
const { abi } = await FiveSDK.loadFiveFile(fiveFileText);
```

### 8.2 Program client
```ts
import { FiveProgram } from "@5ive-tech/sdk";

const program = FiveProgram.fromABI("<SCRIPT_ACCOUNT>", abi, {
  fiveVMProgramId: "<FIVE_VM_PROGRAM_ID>",
  vmStateAccount: "<VM_STATE_ACCOUNT>",
  feeReceiverAccount: "<FEE_RECEIVER_ACCOUNT>",
});
```

### 8.3 Execution verification pattern
1. Build instruction via `program.function(...).accounts(...).args(...).instruction()`
2. Submit with preflight enabled
3. Fetch confirmed tx
4. Assert `meta.err == null`
5. Record `meta.computeUnitsConsumed`

### 8.4 SDK program ID resolution precedence
1. Explicit `fiveVMProgramId`
2. `FiveSDK.setDefaultProgramId(...)`
3. `FIVE_PROGRAM_ID`
4. release-baked default (if present)

## 9) Frontend Integration Baseline

1. Build execute instructions via SDK (`FiveProgram`), not custom serializers.
2. Keep network selection explicit (`localnet`, `devnet`, `mainnet`).
3. Surface signatures, CU metrics, and rich error states.
4. Use LSP-backed editing where available to reduce DSL mistakes.

## 10) Contract Pattern Recipes

This section provides composable patterns for the most common contract archetypes. When building a novel contract, identify which patterns apply and combine them.

### 10.1 Authority-Gated State (Vault, Treasury, Config)

Core pattern: one or more pubkey fields control who can mutate state. Used in almost every contract.

```v
account Config {
    authority: pubkey;
    value: u64;
    is_locked: bool;
}

pub update_value(
    config: Config @mut,
    authority: account @signer,
    new_value: u64
) {
    require(config.authority == authority.key);
    require(!config.is_locked);
    config.value = new_value;
}
```

**Key ingredients:** ownership check via `.key`, boolean guard with `!`, field mutation.

### 10.2 Custody & Withdraw (Vault, Staking)

Core pattern: deposit into an account, enforce balance invariants on withdraw.

```v
pub deposit(
    vault: VaultAccount @mut,
    depositor: account @signer,
    amount: u64
) {
    require(amount > 0);
    vault.balance = vault.balance + amount;
}

pub withdraw(
    vault: VaultAccount @mut,
    authority: account @signer,
    amount: u64
) {
    require(vault.authority == authority.key);
    require(vault.balance >= amount);
    require(amount > 0);
    vault.balance = vault.balance - amount;
}
```

**Key ingredients:** `>= amount` balance guard, arithmetic on fields, `> 0` zero-amount prevention.

### 10.3 Lifecycle State Machine (Escrow, Auction, Proposal)

Core pattern: a status field controls which operations are valid. Transitions are guarded.

```v
account Escrow {
    seller: pubkey;
    buyer: pubkey;
    amount: u64;
    status: u8;    // 0=open, 1=funded, 2=released, 3=cancelled
}

pub fund_escrow(
    escrow: Escrow @mut,
    buyer: account @signer,
    amount: u64
) {
    require(escrow.buyer == buyer.key);
    require(escrow.status == 0);
    require(amount == escrow.amount);
    escrow.status = 1;
}

pub release_escrow(
    escrow: Escrow @mut,
    buyer: account @signer
) {
    require(escrow.buyer == buyer.key);
    require(escrow.status == 1);
    escrow.status = 2;
}
```

**Key ingredients:** integer status field with `==` checks for state transitions, dual-party authorization.

### 10.4 Supply Accounting (Token, Mint, Points)

Core pattern: a central supply counter stays synchronized with distributed balances.

```v
pub mint_to(
    supply_state: SupplyAccount @mut,
    destination: BalanceAccount @mut,
    authority: account @signer,
    amount: u64
) {
    require(supply_state.authority == authority.key);
    require(amount > 0);
    supply_state.total_supply = supply_state.total_supply + amount;
    destination.balance = destination.balance + amount;
}

pub burn(
    supply_state: SupplyAccount @mut,
    source: BalanceAccount @mut,
    owner: account @signer,
    amount: u64
) {
    require(source.owner == owner.key);
    require(source.balance >= amount);
    source.balance = source.balance - amount;
    supply_state.total_supply = supply_state.total_supply - amount;
}
```

**Key ingredients:** paired increment/decrement across two accounts, conservation invariant.

### 10.5 Delegation & Approval (Token, DAO, Proxy)

Core pattern: an owner grants limited permissions to a delegate.

```v
pub approve(
    state: DelegableAccount @mut,
    owner: account @signer,
    delegate: pubkey,
    limit: u64
) {
    require(state.owner == owner.key);
    state.delegate = delegate;
    state.delegated_limit = limit;
}

pub revoke(
    state: DelegableAccount @mut,
    owner: account @signer
) {
    require(state.owner == owner.key);
    state.delegate = 0;
    state.delegated_limit = 0;
}
```

**Key ingredients:** delegate pubkey field, limit tracking, zero-assignment to revoke.

### 10.6 Conservation Math (AMM, Orderbook, Settlement)

Core pattern: total value across accounts must remain constant.

```v
pub swap(
    pool_a: PoolAccount @mut,
    pool_b: PoolAccount @mut,
    user_a: UserAccount @mut,
    user_b: UserAccount @mut,
    trader: account @signer,
    amount_in: u64
) {
    require(user_a.owner == trader.key);
    require(user_a.balance >= amount_in);
    require(amount_in > 0);
    let amount_out = (pool_b.reserve * amount_in) / (pool_a.reserve + amount_in);
    require(amount_out > 0);
    user_a.balance = user_a.balance - amount_in;
    pool_a.reserve = pool_a.reserve + amount_in;
    pool_b.reserve = pool_b.reserve - amount_out;
    user_b.balance = user_b.balance + amount_out;
}
```

**Key ingredients:** `let` with computed expression, multi-account mutation, balance checks on both sides.

### 10.7 Threshold & Risk Checks (Lending, Collateral, Liquidation)

Core pattern: actions gated by ratio or threshold comparisons.

```v
pub borrow(
    position: LoanPosition @mut,
    borrower: account @signer,
    collateral_value: u64,
    borrow_amount: u64
) {
    require(position.owner == borrower.key);
    require(borrow_amount > 0);
    // Enforce 150% collateral ratio: collateral * 100 >= total_debt * 150
    let new_debt = position.debt + borrow_amount;
    require(collateral_value * 100 >= new_debt * 150);
    position.debt = new_debt;
}
```

**Key ingredients:** `let` for intermediate computation, integer math for ratio checks, compound conditions.

### 10.8 External Program Integration (CPI)

Core pattern: call external Solana programs from within your contract via interfaces.

```v
// Non-Anchor program (bincode, manual discriminators)
interface ExternalProgram @program("ExternalProgramID111111111111111111111111111") {
    process @discriminator(1) (
        state: Account,
        authority: Account,
        amount: u64
    );
}

// Anchor program (borsh, auto discriminators)
interface AnchorProgram @anchor @program("AnchorProgramID11111111111111111111111111111") {
    execute(              // discriminator auto-generated
        config: Account,
        user: Account,
        value: u64
    );
}

pub perform_action(
    local_state: MyState @mut,
    external_account: account @mut,
    user: account @signer,
    amount: u64
) {
    require(local_state.authority == user.key);
    require(amount > 0);
    
    // CPI to external program
    ExternalProgram.process(external_account, user, amount);
    
    // Update local state after CPI
    local_state.last_amount = amount;
    local_state.call_count = local_state.call_count + 1;
}
```

**Key ingredients:** interface with `@program`, `@discriminator` (or `@anchor` for auto), `Account` types for CPI params, dot-notation calls, `account @mut` function params for all CPI accounts, mixing CPI calls with local state updates.

## 11) Mainnet Safety Policy

Required preflight gates:
1. Freeze artifact hash
2. Lock target/program-id/RPC/key source
3. Validate key custody
4. Run simulation/dry-run path
5. Predefine rollback/containment actions

Post-deploy:
1. smoke execute
2. confirmed tx validation
3. CU baseline capture
4. incident process if anomalies appear

## 12) Common Failure Signatures

1. `No program ID resolved for Five VM`:
   - set explicit program-id source
2. `Function '<name>' not found in ABI`:
   - use exact ABI name (including namespace)
3. `Missing required account/argument`:
   - satisfy `.accounts(...)` and `.args(...)`
4. owner/program mismatch:
   - verify target program ownership assumptions
5. CPI mismatch:
   - verify explicit serializer/discriminator/account order

## 13) Definition of Done

Complete means:
1. `.five` artifact produced
2. tests passed with evidence
3. deployment confirmed (if in scope)
4. execution confirmed with `meta.err == null` (if in scope)
5. signatures + CU metrics recorded
6. integration snippet delivered (SDK/frontend when requested)

## 14) Agent Behavior Rules

1. Prefer deterministic, minimal command paths.
2. Verify tx outcomes; do not assume send success == execution success.
3. Avoid hidden defaults for deploy/CPI critical parameters.
4. Keep changes auditable and reproducible.
5. If uncertain, inspect compiler/CLI source directly.

## 15) Agent One-Shot Contract Generation Procedure

Follow this procedure to produce correct 5IVE contracts on first compilation, regardless of contract type.

### Step 1: Define account schemas
- Identify every distinct on-chain state object your contract needs.
- Each gets an `account Name { ... }` block with **all fields terminated by `;`**.
- Choose field types from: `pubkey`, `u8`–`u128`, `i8`–`i64`, `bool`, `string<N>`.
- Include an `authority: pubkey;` field on any account that needs access control.
- Include a `status: u8;` field for lifecycle/state-machine accounts.

### Step 2: Define initializer functions
- For each account that users create at runtime, write an `init_*` function.
- The account parameter uses the full attribute stack: `Type @mut @init(payer=name, space=bytes) @signer`.
- The payer is `account @mut @signer`.
- Set every field to a known value (don't leave uninitialized fields).
- Return `-> pubkey` with `return account.key;` when callers need the address.

### Step 3: Define interfaces (if calling external programs)
- Declare `interface Name @program("...") { ... }` at the top of your file.
- Each method gets `@discriminator(N)` as a single u8 inline: `method @discriminator(N) (...)`.
- Use `Account` type for on-chain account params, scalar types for data params.
- **Do not** add `@serializer(...)` — bincode is the default.

### Step 4: Define action functions
- Every state-mutating function takes the relevant account(s) as `AccountType @mut`.
- Authorization: take an `account @signer` parameter, then `require(state.authority == signer.key);`.
- Guards: use `require()` with any comparison operator (`==`, `!=`, `<`, `<=`, `>`, `>=`, `!`).
- For balance operations: always check `require(source.balance >= amount);` before subtraction.
- For state machines: check `require(state.status == EXPECTED_STATUS);` before transition.
- Use `let` for intermediate computations (type inference handles it).
- For CPI calls: pass `account`-typed params directly (not `.key`), use dot notation `Interface.method(...)`.

### Step 5: Define read/query functions
- Use `-> ReturnType` syntax for functions that return values.
- `return state.field;` to return account data.

### Step 6: Compile and verify
- Run `5ive build` or `5ive compile src/main.v -o build/main.five`.
- Fix any parser errors (most common: missing `;` in account fields).

### Syntax quick-reference

| Pattern | Syntax |
|---|---|
| Account field | `name: type;` (semicolon required) |
| Init parameter | `acc: Type @mut @init(payer=p, space=N) @signer` |
| Signer parameter | `caller: account @signer` or `caller: account @mut @signer` |
| Ownership check | `require(state.authority == caller.key);` |
| Balance guard | `require(state.balance >= amount);` |
| Boolean guard | `require(!state.is_locked);` |
| Zero-amount guard | `require(amount > 0);` |
| Revoke authority | `state.authority = 0;` |
| Status transition | `state.status = 1;` |
| Local variable (immutable) | `let x = expr;` |
| Local variable (mutable) | `let mut x = expr;` (required for reassignment) |
| Reassign local variable | `let mut x: u64 = 0; ... x = new_value;` |
| Return value | `pub fn(...) -> u64 { return state.value; }` |
| Fixed string field | `name: string<32>;` |
| Zero-init pubkey | `state.delegate = 0;` or `state.delegate = pubkey(0);` |
| Interface decl | `interface Name @program("...") { ... }` |
| Interface method | `method @discriminator(N) (param: Account, val: u64);` |
| CPI call | `InterfaceName.method(acct_param, value);` |
| CPI account param | `name: account @mut` (not `pubkey`) |

## 16) Reference Implementations

Three verified, compilable patterns covering distinct contract archetypes. Use as canonical references.

### 16.1 Token (Supply Accounting + Delegation + Freeze)

```v
account Mint {
    authority: pubkey;
    freeze_authority: pubkey;
    supply: u64;
    decimals: u8;
    name: string<32>;
    symbol: string<32>;
}

account TokenAccount {
    owner: pubkey;
    mint: pubkey;
    balance: u64;
    is_frozen: bool;
    delegate: pubkey;
    delegated_amount: u64;
}

pub init_mint(
    mint_account: Mint @mut @init(payer=authority, space=256) @signer,
    authority: account @mut @signer,
    freeze_authority: pubkey,
    decimals: u8,
    name: string<32>,
    symbol: string<32>
) -> pubkey {
    require(decimals <= 20);
    mint_account.authority = authority.key;
    mint_account.freeze_authority = freeze_authority;
    mint_account.supply = 0;
    mint_account.decimals = decimals;
    mint_account.name = name;
    mint_account.symbol = symbol;
    return mint_account.key;
}

pub transfer(
    source: TokenAccount @mut,
    destination: TokenAccount @mut,
    owner: account @signer,
    amount: u64
) {
    require(source.owner == owner.key);
    require(source.balance >= amount);
    require(source.mint == destination.mint);
    require(!source.is_frozen);
    require(!destination.is_frozen);
    require(amount > 0);
    source.balance = source.balance - amount;
    destination.balance = destination.balance + amount;
}

pub approve(
    source: TokenAccount @mut,
    owner: account @signer,
    delegate: pubkey,
    amount: u64
) {
    require(source.owner == owner.key);
    source.delegate = delegate;
    source.delegated_amount = amount;
}
```

**Patterns exercised:** `@init` stacking, supply accounting, freeze guards, delegation, `.key` extraction, `string<N>`, `-> pubkey` return.

### 16.2 Vault (Custody + Authority Gating)

```v
account Vault {
    authority: pubkey;
    balance: u64;
    is_locked: bool;
}

pub init_vault(
    vault: Vault @mut @init(payer=creator, space=128) @signer,
    creator: account @mut @signer
) -> pubkey {
    vault.authority = creator.key;
    vault.balance = 0;
    vault.is_locked = false;
    return vault.key;
}

pub deposit(
    vault: Vault @mut,
    depositor: account @signer,
    amount: u64
) {
    require(!vault.is_locked);
    require(amount > 0);
    vault.balance = vault.balance + amount;
}

pub withdraw(
    vault: Vault @mut,
    authority: account @signer,
    amount: u64
) {
    require(vault.authority == authority.key);
    require(!vault.is_locked);
    require(vault.balance >= amount);
    require(amount > 0);
    vault.balance = vault.balance - amount;
}

pub lock_vault(
    vault: Vault @mut,
    authority: account @signer
) {
    require(vault.authority == authority.key);
    vault.is_locked = true;
}

pub transfer_authority(
    vault: Vault @mut,
    current_authority: account @signer,
    new_authority: pubkey
) {
    require(vault.authority == current_authority.key);
    vault.authority = new_authority;
}
```

**Patterns exercised:** authority gating, boolean lock, balance guards, authority transfer, `@init` stacking.

### 16.3 Escrow (Lifecycle State Machine + Dual-Party Auth)

```v
account Escrow {
    seller: pubkey;
    buyer: pubkey;
    amount: u64;
    status: u8;
}

pub create_escrow(
    escrow: Escrow @mut @init(payer=seller, space=128) @signer,
    seller: account @mut @signer,
    buyer: pubkey,
    amount: u64
) -> pubkey {
    require(amount > 0);
    escrow.seller = seller.key;
    escrow.buyer = buyer;
    escrow.amount = amount;
    escrow.status = 0;
    return escrow.key;
}

pub fund_escrow(
    escrow: Escrow @mut,
    buyer: account @signer,
    amount: u64
) {
    require(escrow.buyer == buyer.key);
    require(escrow.status == 0);
    require(amount == escrow.amount);
    escrow.status = 1;
}

pub release(
    escrow: Escrow @mut,
    buyer: account @signer
) {
    require(escrow.buyer == buyer.key);
    require(escrow.status == 1);
    escrow.status = 2;
}

pub cancel(
    escrow: Escrow @mut,
    seller: account @signer
) {
    require(escrow.seller == seller.key);
    require(escrow.status == 0);
    escrow.status = 3;
}
```

**Patterns exercised:** integer status for state machine, dual-party authorization, lifecycle transitions, exact-amount matching.

### 16.4 CPI to External Program (Interface + Cross-Program Calls)

```v
// Interface for external program (non-Anchor, bincode)
interface ExternalProgram @program("ExternalProgramID111111111111111111111111111") {
    update_value @discriminator(5) (
        state: Account,
        authority: Account,
        new_value: u64
    );
}

// Interface for Anchor program (borsh, auto discriminators)
interface AnchorProgram @anchor @program("AnchorProgramID11111111111111111111111111111") {
    process(              // discriminator auto-generated from method name
        config: Account,
        user: Account,
        amount: u64
    );
}

account Controller {
    authority: pubkey;
    counter: u64;
    last_value: u64;
}

pub init_controller(
    controller: Controller @mut @init(payer=creator, space=128) @signer,
    creator: account @mut @signer
) -> pubkey {
    controller.authority = creator.key;
    controller.counter = 0;
    controller.last_value = 0;
    return controller.key;
}

pub call_external(
    controller: Controller @mut,
    external_state: account @mut,
    authority: account @signer,
    value: u64
) {
    require(controller.authority == authority.key);
    require(value > 0);
    
    // CPI to external program
    ExternalProgram.update_value(external_state, authority, value);
    
    // Update local state
    controller.counter = controller.counter + 1;
    controller.last_value = value;
}

pub call_anchor(
    controller: Controller @mut,
    anchor_config: account @mut,
    user: account @signer,
    amount: u64
) {
    require(controller.authority == user.key);
    
    // CPI to Anchor program
    AnchorProgram.process(anchor_config, user, amount);
    
    controller.counter = controller.counter + 1;
}
```

**Patterns exercised:** dual interface types (bincode with manual discriminators, Anchor with auto discriminators), `@program` + `@discriminator` vs `@anchor`, `Account` types in interfaces, dot-notation CPI calls, `account @mut` params for CPI, local state updates after CPI.
