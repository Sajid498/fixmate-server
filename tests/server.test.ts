
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";

const allowedOrigin = (
  process.env.CLIENT_URL || "http://localhost:3000"
)
  .split(",")[0]
  .trim()
  .replace(/\/+$/, "");

describe("FixMate API", () => {
  it("should return the API welcome response", async () => {
    const response = await request(app).get("/");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.message, "FixMate API is running.");
  });

  it("should return the health response", async () => {
    const response = await request(app).get("/api/health");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.database, "connected");
    assert.ok(response.body.timestamp);
  });

  it("should allow requests from the configured frontend origin", async () => {
    const response = await request(app)
      .get("/")
      .set("Origin", allowedOrigin);

    assert.equal(response.status, 200);
    assert.equal(
      response.headers["access-control-allow-origin"],
      allowedOrigin,
    );
  });

  it("should reject requests from untrusted origins", async () => {
    const response = await request(app)
      .get("/")
      .set("Origin", "https://untrusted-example.com");

    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);
    assert.equal(response.body.message, "Origin not allowed.");
  });

  it("should return JSON for unknown API endpoints", async () => {
    const response = await request(app).get("/api/unknown-endpoint");

    assert.equal(response.status, 404);
    assert.equal(response.body.success, false);
    assert.equal(response.body.message, "API endpoint not found.");
  });

  it("should reject malformed JSON request bodies", async () => {
    const response = await request(app)
      .post("/api/unknown-endpoint")
      .set("Content-Type", "application/json")
      .send('{"invalid":');

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
    assert.equal(response.body.message, "Invalid JSON request body.");
  });

  it("should reject request bodies larger than one megabyte", async () => {
    const response = await request(app)
      .post("/api/unknown-endpoint")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ data: "x".repeat(1024 * 1024 + 100) }));

    assert.equal(response.status, 413);
    assert.equal(response.body.success, false);
    assert.equal(
      response.body.message,
      "Request body exceeds the allowed size.",
    );
  });

  it("should not expose the Express technology header", async () => {
    const response = await request(app).get("/");

    assert.equal(response.headers["x-powered-by"], undefined);
  });
});
