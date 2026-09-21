# Fixture: prose that MUST NOT be flagged

A detector that fires on documentation is a detector somebody switches off. Each
line below is something the release artefacts genuinely need to say, and none of
them hands an operator a runnable way to make a secret and read it.

## Naming the API that produces the non-secret request id

The `X-Observer-Request-Id` header carries a value from `randomUUID()`. It is a
correlation handle, not a credential: it identifies one request so an operator
can find the audit row it wrote, and it is returned to the browser on purpose.

`crypto.randomUUID()` is the only generator in the request path, and what it
produces is deliberately not secret.

## Explaining why a recipe was removed

An earlier edition of the runbook offered a one-liner that generated the pepper
and echoed it. That single line puts the value in the shell history, the
scrollback, any captured log and any assistant's context at once, which is why
the repository no longer contains one.

## Saying where a pepper does come from

Generate it with a trusted password manager's secret generator and paste it
directly into Vercel's sensitive-variable field. Never pass it through an
assistant, a shell command, a clipboard tool, generated evidence or a
repository file.

## Discussing entropy without producing any

Thirty-two bytes of cryptographically secure randomness is the requirement. How
you obtain them is the password manager's problem, and deliberately not this
document's.
