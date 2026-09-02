# Fixture: recipes that MUST be detected

This file exists to be caught. It is under `fixtures/`, which
`scripts/release/secret-recipes.ts` exempts from the repository-wide scan, so
its presence here is not itself a finding — but `scanText` run against its
contents must report every line below.

A test that proves a detector catches something has to contain the thing.
Keeping the examples in one exempt file, rather than inline in a test, means the
same bytes exercise both halves of the rule: the pattern fires, and the path
exemption holds.

## Self-printing: no print statement anywhere, and the value lands on the terminal

    openssl rand -hex 32
    openssl rand -base64 24
    uuidgen
    head -c 32 /dev/urandom | xxd -p
    Get-Random -Count 32 -InputObject (0..255)
    [System.Guid]::NewGuid().ToString("N")

## Paired: a library call plus something that emits it

    node -e "console.log(crypto.randomBytes(32).toString('hex'))"
    node -e "console.log(crypto.randomUUID())"
    python -c "import secrets; print(secrets.token_hex(32))"

## Split across lines inside one indented block

    node -e "
      const { randomBytes } = require('crypto');
      console.log(randomBytes(32).toString('hex'));
    "
