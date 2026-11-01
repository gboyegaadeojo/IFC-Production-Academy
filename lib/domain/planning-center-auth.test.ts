import { describe, expect, it } from "vitest";
import {
  packState,
  pcoAuthorizeUrl,
  pcoIdentity,
  pcoMeSchema,
  sameState,
  unpackState,
} from "./planning-center-auth";

const STATE = "a".repeat(43);

describe("Planning Center sign-in", () => {
  it("asks Planning Center for the people scope with our state", () => {
    const url = new URL(pcoAuthorizeUrl("client", "https://academy.example/cb", STATE));
    expect(url.origin + url.pathname).toBe("https://api.planningcenteronline.com/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe("people");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe(STATE);
    expect(url.searchParams.get("redirect_uri")).toBe("https://academy.example/cb");
  });

  it("keeps the state and where to go next together", () => {
    expect(unpackState(packState(STATE, "/serve?all=1"))).toEqual({
      state: STATE,
      next: "/serve?all=1",
    });
    expect(unpackState(undefined)).toBeNull();
    expect(unpackState("short./home")).toBeNull();
  });

  it("compares states exactly", () => {
    expect(sameState(STATE, STATE)).toBe(true);
    expect(sameState(STATE, `${STATE.slice(1)}b`)).toBe(false);
    expect(sameState(STATE, STATE.slice(1))).toBe(false);
  });

  it("reads who they are, primary email first, ignoring anything that isn't an email", () => {
    const me = pcoMeSchema.parse({
      data: { id: "123", type: "Person", attributes: { first_name: "Fake", last_name: "Person" } },
      included: [
        { id: "e1", type: "Email", attributes: { address: "Second@Example.com", primary: false } },
        { id: "e2", type: "Email", attributes: { address: " first@example.com ", primary: true } },
        { id: "e3", type: "Email", attributes: { address: "not an email" } },
        { id: "p1", type: "PhoneNumber", attributes: { number: "555" } },
      ],
    });
    expect(pcoIdentity(me)).toEqual({
      personId: "123",
      name: "Fake Person",
      emails: ["first@example.com", "second@example.com"],
    });
  });
});
