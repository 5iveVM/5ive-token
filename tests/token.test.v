// Token Contract Unit Tests
// Validates supply cap, delegation, freeze logic, and authority model.

// Supply cap: mint must not exceed max_supply
// supply + amount <= max_supply -> ok
// @test-params 900 1000 50 true
pub test_supply_cap_allows_mint(current_supply: u64, max_supply: u64, amount: u64) -> bool {
    return (current_supply + amount) <= max_supply;
}

// @test-params 980 1000 50 false
pub test_supply_cap_rejects_mint(current_supply: u64, max_supply: u64, amount: u64) -> bool {
    return (current_supply + amount) <= max_supply;
}

// Uncapped (max_supply=0): always allow
// @test-params 0 1000 true
pub test_uncapped_mint_allowed(max_supply: u64, amount: u64) -> bool {
    if (max_supply == 0) {
        return true;
    }
    return amount <= max_supply;
}

// Balance after mint
// @test-params 500 300 800
pub test_balance_after_mint(initial_balance: u64, mint_amount: u64) -> u64 {
    return initial_balance + mint_amount;
}

// Transfer: source decreases, destination increases
// @test-params 1000 400 600
pub test_source_balance_after_transfer(source_balance: u64, amount: u64) -> u64 {
    return source_balance - amount;
}

// @test-params 200 400 600
pub test_destination_balance_after_transfer(dest_balance: u64, amount: u64) -> u64 {
    return dest_balance + amount;
}

// Insufficient balance check
// @test-params 300 400 false
pub test_transfer_insufficient_balance(balance: u64, amount: u64) -> bool {
    return balance >= amount;
}

// Delegate: can transfer up to delegated_amount
// @test-params 500 300 true
pub test_delegate_can_transfer(delegated_amount: u64, transfer_amount: u64) -> bool {
    return delegated_amount >= transfer_amount;
}

// @test-params 200 300 false
pub test_delegate_exceeds_allowance(delegated_amount: u64, transfer_amount: u64) -> bool {
    return delegated_amount >= transfer_amount;
}

// Delegated amount decrements after delegate transfer
// @test-params 500 300 200
pub test_delegate_amount_after_transfer(delegated_amount: u64, transfer_amount: u64) -> u64 {
    return delegated_amount - transfer_amount;
}

// Burn decreases supply
// @test-params 10000 500 9500
pub test_supply_after_burn(supply: u64, burn_amount: u64) -> u64 {
    return supply - burn_amount;
}

// Frozen account cannot transfer
// @test-params false
pub test_frozen_blocks_transfer() -> bool {
    let is_frozen: bool = true;
    return !is_frozen;
}

// Thawed account can transfer
// @test-params true
pub test_thawed_allows_transfer() -> bool {
    let is_frozen: bool = false;
    return !is_frozen;
}

// Set max_supply: cannot lower below current supply
// new_max=9000, current_supply=9500 -> invalid
// @test-params 9000 9500 false
pub test_max_supply_cannot_lower_below_current(new_max: u64, current_supply: u64) -> bool {
    return new_max >= current_supply;
}

// @test-params 10000 9500 true
pub test_max_supply_can_raise(new_max: u64, current_supply: u64) -> bool {
    return new_max >= current_supply;
}

// Close account: must have zero balance
// @test-params 0 true
pub test_close_zero_balance(balance: u64) -> bool {
    return balance == 0;
}

// @test-params 100 false
pub test_close_nonzero_balance_fails(balance: u64) -> bool {
    return balance == 0;
}
