import { describe, expect, it } from "vitest";
import { escapeCell } from "@/lib/csv-export";
import { sniffUploadImage } from "@/lib/landing-pages.functions";

describe("CSV-Export", () => {
  it("entschärft Formeln am Zellanfang", () => {
    expect(escapeCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(escapeCell("+49 170")).toBe("'+49 170");
    expect(escapeCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCell("Max Muster")).toBe("Max Muster");
  });
});

describe("Bild-Uploads", () => {
  const enc = (t: string) => new TextEncoder().encode(t);
  it("erkennt PNG am Inhalt", () => {
    expect(sniffUploadImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))?.mime).toBe("image/png");
  });
  it("lehnt HTML ab", () => {
    expect(sniffUploadImage(enc("<html><script>alert(1)</script></html>"))).toBeNull();
  });
  it("lehnt SVG mit Skript ab", () => {
    expect(sniffUploadImage(enc('<svg onload="alert(1)"></svg>'))).toBeNull();
    expect(sniffUploadImage(enc("<svg><script>x</script></svg>"))).toBeNull();
  });
  it("erlaubt einfaches SVG", () => {
    expect(sniffUploadImage(enc('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'))?.mime).toBe("image/svg+xml");
  });
});
