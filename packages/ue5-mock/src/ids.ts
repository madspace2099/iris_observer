/**
 * DETERMINISTIC IDENTIFIERS. MOCK-ONLY.
 *
 * A reference implementation that produced random identifiers would produce a
 * different transcript on every run, and a test that cannot compare two runs
 * cannot prove idempotency — which is the one property this whole harness exists
 * to demonstrate.
 *
 * **None of this is a security design and none of it may ever be copied into a
 * server.** Real activation codes and real credentials come from a cryptographic
 * source; these come from a counter, on purpose, so that the twentieth token a
 * test mints is the same twentieth token tomorrow.
 */

/** A small, fast, fully deterministic PRNG. Not for anything that matters. */
export class Deterministic {
  private state: number;

  constructor(seed = 0x0b5e_2ef1) {
    this.state = seed >>> 0;
  }

  private next(): number {
    /* mulberry32 */
    this.state = (this.state + 0x6d2b_79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  }

  private hex(length: number): string {
    let out = "";
    while (out.length < length) out += Math.floor(this.next() * 16).toString(16);
    return out.slice(0, length);
  }

  /**
   * A syntactically valid version-4 UUID.
   *
   * The version and variant nibbles are pinned for **realism, not compliance**.
   * They used to be pinned because the envelope enforced RFC shape; since `O-20`
   * it uses `CanonicalIdSchema`, which requires lowercase hex in 8-4-4-4-12 form
   * and has no opinion about version or variant semantics. Pinning them still
   * produces a valid identifier, and it keeps the mock's output shaped like what
   * `CoCreateGuid` actually emits on the confirmed V1 platform — so a reader
   * comparing mock traffic to a real capture is not distracted by a difference
   * that does not exist in the field.
   *
   * What the contract does require, and what this must not break, is
   * **lowercase**: `hex()` emits lowercase and the pinned nibbles are lowercase,
   * so every identifier round-trips through a native `uuid` column unchanged.
   */
  uuid(): string {
    const variant = "89ab"[Math.floor(this.next() * 4)] ?? "8";
    return [
      this.hex(8),
      this.hex(4),
      `4${this.hex(3)}`,
      `${variant}${this.hex(3)}`,
      this.hex(12),
    ].join("-");
  }

  /** An activation code in the shape Admin prints. */
  activationCode(prefix = "OBS"): string {
    const group = () => this.hex(4).toUpperCase();
    return `${prefix}-${group()}-${group()}-${group()}`;
  }

  /** An opaque source credential. Long enough for the contract's own bounds. */
  sourceToken(): string {
    return `obs_${this.hex(56)}`;
  }
}
