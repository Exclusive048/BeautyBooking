import { focalPointToObjectPosition } from "@/lib/media/focal-point";
import { describe, it, expect } from "vitest";

describe("media/focal-point", () => {
  it("defaults to center when values are null", () => {
    expect(focalPointToObjectPosition(null, null)).toBe("50% 50%");
  });

  it("rounds values to percent", () => {
    expect(focalPointToObjectPosition(0.123, 0.987)).toBe("12% 99%");
  });

  it("handles edge values", () => {
    expect(focalPointToObjectPosition(0, 1)).toBe("0% 100%");
  });
});
