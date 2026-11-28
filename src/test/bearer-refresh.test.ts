import { describe, it, expect } from "vitest";
import { needsRefresh } from "@/integrations/supabase/bearer-attacher";

describe("bearer token refresh", () => {
  it("does not refresh a token that is still valid for a long time", () => {
    expect(needsRefresh(10_000 + 3600, 10_000)).toBe(false);
  });
  it("refreshes shortly before expiry", () => {
    expect(needsRefresh(10_000 + 60, 10_000)).toBe(true);
  });
});
