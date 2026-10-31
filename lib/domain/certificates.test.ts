import { describe, expect, it } from "vitest";
import { certificateCheckUrl, normaliseReference, toCertificateError } from "./certificates";

describe("normaliseReference", () => {
  it("accepts the printed format in any case", () => {
    expect(normaliseReference(" ifc-1a2b-3c4d-5e6f ")).toBe("IFC-1A2B-3C4D-5E6F");
    expect(normaliseReference("IFC-1A2B-3C4D")).toBeNull();
    expect(normaliseReference("IFC-ZZZZ-3C4D-5E6F")).toBeNull();
  });
});

describe("toCertificateError", () => {
  it("maps database errors", () => {
    expect(toCertificateError({ message: "requirements_not_met" })).toBe("requirements_not_met");
    expect(toCertificateError({ code: "42501", message: "x" })).toBe("not_authorized");
    expect(toCertificateError({ code: "XX000", message: "secret" })).toBe("unknown");
  });
});

describe("certificateCheckUrl", () => {
  it("points the QR code at the public check page", () => {
    expect(certificateCheckUrl("https://academy.example.org", "IFC-1A2B-3C4D-5E6F")).toBe(
      "https://academy.example.org/verify/IFC-1A2B-3C4D-5E6F",
    );
    expect(certificateCheckUrl("https://academy.example.org/", "IFC-1A2B-3C4D-5E6F")).toBe(
      "https://academy.example.org/verify/IFC-1A2B-3C4D-5E6F",
    );
  });
});
