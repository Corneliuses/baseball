import { describe, expect, it } from "vitest";

import {
  SIGNIN_CODE_ALPHABET,
  SIGNIN_CODE_LENGTH,
  SIGNIN_CODE_MAX_AGE_SECONDS,
  formatSignInCode,
  generateSignInCode,
  normalizeSignInCode,
} from "./signin-code";

describe("SIGNIN_CODE_ALPHABET", () => {
  it("is Crockford base32: 32 characters, no I, L, O or U", () => {
    expect(SIGNIN_CODE_ALPHABET).toHaveLength(32);
    for (const ambiguous of ["I", "L", "O", "U"]) {
      expect(SIGNIN_CODE_ALPHABET).not.toContain(ambiguous);
    }
    // 32 must divide 256 for `byte & 31` to be uniform.
    expect(256 % SIGNIN_CODE_ALPHABET.length).toBe(0);
  });
});

describe("generateSignInCode", () => {
  it("returns 8 characters drawn from the alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateSignInCode();
      expect(code).toHaveLength(SIGNIN_CODE_LENGTH);
      for (const character of code) {
        expect(SIGNIN_CODE_ALPHABET).toContain(character);
      }
    }
  });

  it("survives its own normalizer untouched", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateSignInCode();
      expect(normalizeSignInCode(code)).toBe(code);
    }
  });

  it("does not repeat across a handful of draws", () => {
    // 40 bits of entropy: a collision in 20 draws is a broken generator, not
    // bad luck.
    const codes = new Set(Array.from({ length: 20 }, generateSignInCode));
    expect(codes.size).toBe(20);
  });
});

describe("formatSignInCode", () => {
  it("splits the code in half with a dash", () => {
    expect(formatSignInCode("K3M7QP2X")).toBe("K3M7-QP2X");
  });

  it("round-trips through the normalizer", () => {
    const code = generateSignInCode();
    expect(normalizeSignInCode(formatSignInCode(code))).toBe(code);
  });
});

describe("normalizeSignInCode", () => {
  it("uppercases and strips spaces and dashes", () => {
    // The exact example the issue promises: a parent typing `k3m7 qp2x`
    // succeeds.
    expect(normalizeSignInCode("k3m7 qp2x")).toBe("K3M7QP2X");
    expect(normalizeSignInCode("K3M7-QP2X")).toBe("K3M7QP2X");
    expect(normalizeSignInCode("  k3 m7-qp 2x ")).toBe("K3M7QP2X");
  });

  it("maps the misread characters the alphabet excludes", () => {
    // O→0, I→1, L→1 — the generator never emits them, so this only rescues.
    expect(normalizeSignInCode("KOM7-QPIX")).toBe("K0M7QP1X");
    expect(normalizeSignInCode("klm7-qp2x")).toBe("K1M7QP2X");
  });

  it("rejects the wrong length", () => {
    expect(normalizeSignInCode("K3M7QP2")).toBeNull();
    expect(normalizeSignInCode("K3M7QP2XX")).toBeNull();
    expect(normalizeSignInCode("")).toBeNull();
  });

  it("rejects characters outside the alphabet", () => {
    expect(normalizeSignInCode("K3M7QP2U")).toBeNull();
    expect(normalizeSignInCode("K3M7QP2!")).toBeNull();
    expect(normalizeSignInCode("K3M7QP2é")).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(normalizeSignInCode(null)).toBeNull();
    expect(normalizeSignInCode(undefined)).toBeNull();
    expect(normalizeSignInCode(42)).toBeNull();
  });
});

describe("SIGNIN_CODE_MAX_AGE_SECONDS", () => {
  it("is ten minutes", () => {
    // Short expiry is half of the no-attempt-counter trade; the code's 40
    // bits are the other half. Lengthen this only alongside that reasoning.
    expect(SIGNIN_CODE_MAX_AGE_SECONDS).toBe(600);
  });
});
