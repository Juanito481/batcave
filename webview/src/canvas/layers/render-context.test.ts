import { describe, it, expect } from "vitest";
import { P, seed } from "./render-context";

describe("seed", () => {
  it("returns deterministic values for same index", () => {
    expect(seed(0)).toBe(seed(0));
    expect(seed(42)).toBe(seed(42));
    expect(seed(399)).toBe(seed(399));
  });

  it("returns values in 0-1 range", () => {
    for (let i = 0; i < 400; i++) {
      const v = seed(i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("wraps around for indices beyond 400", () => {
    expect(seed(400)).toBe(seed(0));
    expect(seed(401)).toBe(seed(1));
    expect(seed(800)).toBe(seed(0));
  });

  it("handles negative indices", () => {
    expect(seed(-1)).toBe(seed(399));
    expect(seed(-400)).toBe(seed(0));
  });

  it("produces different values for different indices", () => {
    // Not all seeds should be the same — verify some variety.
    const unique = new Set<number>();
    for (let i = 0; i < 100; i++) {
      unique.add(seed(i));
    }
    expect(unique.size).toBeGreaterThan(50);
  });
});

describe("palette P", () => {
  it("has all required color constants", () => {
    expect(P.BG).toBe("#101820");
    expect(P.ACCENT).toBe("#1E7FD8");
    expect(P.FLOOR_A).toBeDefined();
    expect(P.FLOOR_B).toBeDefined();
    expect(P.WALL_TOP).toBeDefined();
    expect(P.WALL_MID).toBeDefined();
    expect(P.OUTLINE).toBeDefined();
    expect(P.HIGHLIGHT).toBeDefined();
  });

  it("has LED_COLORS array with 5 entries", () => {
    expect(P.LED_COLORS).toHaveLength(5);
  });

  it("all colors are valid hex strings", () => {
    const hexPattern = /^#[0-9a-fA-F]{6}$/;
    for (const [key, value] of Object.entries(P)) {
      if (key === "LED_COLORS") {
        for (const c of value as unknown as readonly string[]) {
          expect(c).toMatch(hexPattern);
        }
      } else {
        expect(value).toMatch(hexPattern);
      }
    }
  });
});
