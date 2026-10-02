import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/stream", () => {
  it("refusé sans session (401)", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/stream?ligue=00000000-0000-4000-8000-000000000000"),
    );
    expect(response.status).toBe(401);
  });
});
