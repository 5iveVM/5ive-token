// 5IVE Token Program (SPL-like feature set)

account Mint {
    mint_authority: pubkey;
    supply: u64;
    decimals: u8;
    is_initialized: bool;
    freeze_authority: pubkey;
}

account TokenAccount {
    mint: pubkey;
    authority: pubkey;
    amount: u64;
    delegate: pubkey;
    delegated_amount: u64;
    is_initialized: bool;
    is_frozen: bool;
}

pub initialize_mint(
    mint: Mint @mut @init(payer=payer, space=128) @signer,
    payer: account @mut @signer,
    mint_authority: pubkey,
    freeze_authority: pubkey,
    decimals: u8
) {
    require(!mint.is_initialized);
    mint.mint_authority = mint_authority;
    mint.freeze_authority = freeze_authority;
    mint.decimals = decimals;
    mint.supply = 0;
    mint.is_initialized = true;
}

pub initialize_account(
    token_account: TokenAccount @mut @init(payer=payer, space=256) @signer,
    payer: account @mut @signer,
    mint: Mint,
    authority: account
) {
    require(!token_account.is_initialized);
    token_account.mint = mint.ctx.key;
    token_account.authority = authority.ctx.key;
    token_account.amount = 0;
    token_account.delegate = 0;
    token_account.delegated_amount = 0;
    token_account.is_initialized = true;
    token_account.is_frozen = false;
}

pub mint_to(
    mint: Mint @mut,
    to: TokenAccount @mut,
    authority: account @signer,
    amount: u64
) {
    require(mint.is_initialized);
    require(to.is_initialized);
    require(to.mint == mint.ctx.key);
    require(mint.mint_authority == authority.ctx.key);
    require(!to.is_frozen);

    mint.supply = mint.supply + amount;
    to.amount = to.amount + amount;
}

pub transfer(
    from: TokenAccount @mut,
    to: TokenAccount @mut,
    authority: account @signer,
    amount: u64
) {
    require(from.is_initialized);
    require(to.is_initialized);
    require(from.mint == to.mint);
    require(!from.is_frozen);
    require(!to.is_frozen);

    if (from.authority == authority.ctx.key) {
        // Owner is signing
    } else {
        require(from.delegate == authority.ctx.key);
        require(from.delegated_amount >= amount);
        from.delegated_amount = from.delegated_amount - amount;
    }

    require(from.amount >= amount);
    from.amount = from.amount - amount;
    to.amount = to.amount + amount;
}

pub burn(
    mint: Mint @mut,
    from: TokenAccount @mut,
    authority: account @signer,
    amount: u64
) {
    require(mint.is_initialized);
    require(from.is_initialized);
    require(from.mint == mint.ctx.key);
    require(!from.is_frozen);

    if (from.authority == authority.ctx.key) {
        // Owner is signing
    } else {
        require(from.delegate == authority.ctx.key);
        require(from.delegated_amount >= amount);
        from.delegated_amount = from.delegated_amount - amount;
    }

    require(from.amount >= amount);
    from.amount = from.amount - amount;
    mint.supply = mint.supply - amount;
}

pub approve(
    account: TokenAccount @mut,
    owner: account @signer,
    delegate: pubkey,
    amount: u64
) {
    require(account.is_initialized);
    require(account.authority == owner.ctx.key);
    require(!account.is_frozen);

    account.delegate = delegate;
    account.delegated_amount = amount;
}

pub revoke(
    account: TokenAccount @mut,
    owner: account @signer
) {
    require(account.is_initialized);
    require(account.authority == owner.ctx.key);
    require(!account.is_frozen);

    account.delegate = 0;
    account.delegated_amount = 0;
}

pub freeze_account(
    mint: Mint,
    account: TokenAccount @mut,
    authority: account @signer
) {
    require(mint.is_initialized);
    require(account.is_initialized);
    require(account.mint == mint.ctx.key);
    require(mint.freeze_authority == authority.ctx.key);

    account.is_frozen = true;
}

pub thaw_account(
    mint: Mint,
    account: TokenAccount @mut,
    authority: account @signer
) {
    require(mint.is_initialized);
    require(account.is_initialized);
    require(account.mint == mint.ctx.key);
    require(mint.freeze_authority == authority.ctx.key);

    account.is_frozen = false;
}
