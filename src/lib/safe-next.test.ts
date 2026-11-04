import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("адрес возврата после входа", () => {
  it("свои адреса пропускает", () => {
    expect(safeNext("/app/projects?tab=finance")).toBe("/app/projects?tab=finance");
    expect(safeNext("/setup")).toBe("/setup");
  });
  it("чужие сайты — на /app", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "http:/evil", "evil.com", "javascript:alert(1)", "/\tapp", ""]) {
      expect(safeNext(bad)).toBe("/app");
    }
  });
  it("не строка — на запасной адрес", () => {
    expect(safeNext(undefined)).toBe("/app");
    expect(safeNext(["/app"], "/login")).toBe("/login");
  });
});
