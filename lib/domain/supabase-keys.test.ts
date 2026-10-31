import { describe, expect, it } from "vitest";
import { supabaseKeyHeaders } from "./supabase-keys";

describe("supabaseKeyHeaders", () => {
  it("sends a legacy JWT key as both apikey and bearer token", () => {
    const key = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.fake-signature";
    expect(supabaseKeyHeaders(key)).toEqual({ apikey: key, Authorization: `Bearer ${key}` });
  });

  it("sends a new secret key as apikey only", () => {
    const key = "sb_secret_fake0000000000000000";
    expect(supabaseKeyHeaders(key)).toEqual({ apikey: key });
  });
});
