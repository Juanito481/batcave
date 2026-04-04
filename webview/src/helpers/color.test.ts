import { describe, it, expect } from "vitest";
import { clamp, hexToRgb, rgbToHex, darken, lighten } from "./color";

describe("clamp", () => {
  it("returns value within 0-255 range", () => {
    expect(clamp(128)).toBe(128);
  });

  it("clamps negative values to 0", () => {
    expect(clamp(-10)).toBe(0);
  });

  it("clamps values above 255 to 255", () => {
    expect(clamp(300)).toBe(255);
  });

  it("rounds fractional values", () => {
    expect(clamp(128.7)).toBe(129);
    expect(clamp(128.3)).toBe(128);
  });
});

describe("hexToRgb", () => {
  it("converts black", () => {
    expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
  });

  it("converts white", () => {
    expect(hexToRgb("#ffffff")).toEqual([255, 255, 255]);
  });

  it("converts accent blue", () => {
    expect(hexToRgb("#1E7FD8")).toEqual([30, 127, 216]);
  });

  it("converts brand black", () => {
    expect(hexToRgb("#101820")).toEqual([16, 24, 32]);
  });
});

describe("rgbToHex", () => {
  it("converts black", () => {
    expect(rgbToHex(0, 0, 0)).toBe("#000000");
  });

  it("converts white", () => {
    expect(rgbToHex(255, 255, 255)).toBe("#ffffff");
  });

  it("clamps out-of-range values", () => {
    expect(rgbToHex(300, -10, 128)).toBe("#ff0080");
  });

  it("roundtrips with hexToRgb", () => {
    const hex = "#1E7FD8";
    const [r, g, b] = hexToRgb(hex);
    expect(rgbToHex(r, g, b)).toBe(hex.toLowerCase());
  });
});

describe("darken", () => {
  it("returns black when amount is 1", () => {
    expect(darken("#ff8040", 1)).toBe("#000000");
  });

  it("returns same color when amount is 0", () => {
    expect(darken("#1E7FD8", 0)).toBe("#1e7fd8");
  });

  it("darkens by 50%", () => {
    const result = darken("#804020", 0.5);
    expect(result).toBe("#402010");
  });
});

describe("lighten", () => {
  it("returns white when amount is 1", () => {
    expect(lighten("#1E7FD8", 1)).toBe("#ffffff");
  });

  it("returns same color when amount is 0", () => {
    expect(lighten("#1E7FD8", 0)).toBe("#1e7fd8");
  });

  it("lightens dark colors toward white", () => {
    const result = lighten("#000000", 0.5);
    // 0 + (255-0)*0.5 = 127.5 → 128
    expect(result).toBe("#808080");
  });
});
