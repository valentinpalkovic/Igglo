import { describe, expect, it } from "vitest";
import { probe } from "./index.js";

describe("probe", () => {
  it("reads a file through the adapter driver", async () => {
    expect(await probe("package.json")).toMatch(/^chromium:\d+$/);
  });
});
