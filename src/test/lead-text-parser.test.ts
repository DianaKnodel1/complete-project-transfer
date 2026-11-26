import { describe, it, expect } from "vitest";
import { parseLeadText, mergeLeadFiles } from "@/lib/lead-text-parser";

describe("Lead-Erkennung aus Text", () => {
  it("liest Blöcke mit ----- inkl. Name, Mail, Telefon", () => {
    const r = parseLeadText("Amina Alic\namina.alic@icloud.com\n017684669548\n\n-----\n\nSANDRA MICELLI\nMobil: 0160/7527897\nsandra.micelli@gmx.de");
    expect(r.rows).toEqual([
      { firstName: "Amina", lastName: "Alic", email: "amina.alic@icloud.com", phone: "017684669548" },
      { firstName: "Sandra", lastName: "Micelli", email: "sandra.micelli@gmx.de", phone: "0160/7527897" },
    ]);
  });

  it("liest Listen „Name , Mail“ ohne Trenner zeilenweise", () => {
    const r = parseLeadText("Carina Leitermann , car.lei3105@gmail.com\nmanuel.oesterlen@gmx.de , manuel oesterlen");
    expect(r.rows.map((x) => [x.firstName, x.email])).toEqual([["Carina", "car.lei3105@gmail.com"], ["Manuel", "manuel.oesterlen@gmx.de"]]);
  });

  it("liest Facebook/Meta-Export mit Tabulator, entfernt p: und korrigiert .come", () => {
    const r = parseLeadText("id\tfirst_name\tlast_name\tphone_number\temail\nl:1\tArmin\tKuch\tp:+4917616517091\tarminatcore87@gmail.come");
    expect(r.rows).toEqual([{ firstName: "Armin", lastName: "Kuch", email: "arminatcore87@gmail.com", phone: "+4917616517091" }]);
  });

  it("erkennt doppelte Adressen über mehrere Dateien (Groß-/Kleinschreibung egal)", () => {
    const r = mergeLeadFiles([
      { name: "a", text: "Tim Sauerbier , tim-sauerbier@web.de" },
      { name: "b", text: "Name Tim Sauerbier\nE-Mail Tim-Sauerbier@WEB.de\nTelefonnummer 017621483413" },
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.duplicates).toBe(1);
    expect(r.rows[0]?.phone).toBe("017621483413");
  });
});

import { fillMailTemplate } from "@/lib/mail-template-fill";
import { splitBatchDuplicates, sendHealth } from "@/lib/lead-mailing";

describe("Versand-Schutz", () => {
  it("sendet bei gleicher Adresse in einem Lauf nur einmal", () => {
    const r = splitBatchDuplicates([{ id: "1", email: "a@x.de" }, { id: "2", email: "A@x.de " }, { id: "3", email: "b@x.de" }]);
    expect(r.unique.map((x) => x.id)).toEqual(["1", "3"]);
    expect(r.duplicates).toEqual(["2"]);
  });
  it("Ampel: gelb ab 80 % Tageslimit, rot ab 5 % Rückläufer", () => {
    expect(sendHealth({ sentToday: 80, dailyLimit: 100, sent: 100, bounced: 0, lastErrorRecent: false })).toBe("yellow");
    expect(sendHealth({ sentToday: 10, dailyLimit: 100, sent: 100, bounced: 5, lastErrorRecent: false })).toBe("red");
    expect(sendHealth({ sentToday: 10, dailyLimit: 100, sent: 100, bounced: 1, lastErrorRecent: false })).toBe("green");
  });
  it("Vorlage ersetzt Vorname ohne Lücke", () => {
    expect(fillMailTemplate("Guten Tag {Vorname},", { Vorname: "" })).toBe("Guten Tag,");
    expect(fillMailTemplate("Guten Tag {Vorname} {Nachname},", { Vorname: "Anna", Nachname: "Muster" })).toBe("Guten Tag Anna Muster,");
  });
});
