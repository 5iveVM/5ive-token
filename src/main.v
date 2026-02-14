// Basic 5ive DSL program (valid-first starter)

account Counter {
    value: u64;
    authority: pubkey;
}

pub init_counter(
    counter: Counter @mut,
    authority: account @signer
) {
    counter.value = 0;
    counter.authority = authority.key;
}

pub increment(
    counter: Counter @mut,
    authority: account @signer
) {
    require(counter.authority == authority.key);
    counter.value = counter.value + 1;
}

pub get_value(counter: Counter) -> u64 {
    return counter.value;
}
