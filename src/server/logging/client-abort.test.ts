import { describe, expect, it } from "vitest";
import { isClientAbortLog } from "./client-abort";

describe("interruptions du client", () => {
  it("écarte la fermeture du flux de rendu, rien d'autre", () => {
    expect(isClientAbortLog(["⨯", new Error("The destination stream closed early.")])).toBe(true);
    expect(isClientAbortLog([new Error("The destination stream closed early.")])).toBe(true);
    expect(isClientAbortLog([new Error("Base injoignable")])).toBe(false);
    expect(isClientAbortLog(["The destination stream closed early."])).toBe(false);
    expect(isClientAbortLog([])).toBe(false);
  });
});
