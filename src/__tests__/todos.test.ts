import request from "supertest";
import { app } from "../app";
import { env } from "../env";
import { pool } from "../db";

let cookies: string[];

beforeAll(async () => {
  // Protect development/production data before running destructive test setup.
  if (env.NODE_ENV !== "test") {
    throw new Error('Refusing to run destructive tests unless NODE_ENV is "test".');
  }

  if (!env.DB_NAME.toLowerCase().includes("test")) {
    throw new Error(
      `Refusing to truncate database "${env.DB_NAME}": its name must include "test".`,
    );
  }

  await pool.query(
    "TRUNCATE refresh_tokens, todos, users RESTART IDENTITY CASCADE",
  );

  await request(app)
    .post("/auth/signup")
    .send({ email: "jesttest@test.com", password: "testtest123" });

  const loginRes = await request(app)
    .post("/auth/login")
    .send({ email: "jesttest@test.com", password: "testtest123" });

  const setCookieHeader = loginRes.headers["set-cookie"];
  cookies = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : [setCookieHeader];
});

afterAll(async () => {
  await pool.end();
});

describe("API documentation", () => {
  it("serves a valid OpenAPI contract", async () => {
    const res = await request(app).get("/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.1.0");
    expect(res.body.paths["/todos"].get.operationId).toBe("listTodos");
    expect(res.body.components.securitySchemes.accessCookie.name).toBe("accessToken");
    expect(res.body.paths["/healthz"].get.operationId).toBe("getLiveness");
    expect(res.body.paths["/readyz"].get.operationId).toBe("getReadiness");
  });

  it("serves the interactive Swagger UI", async () => {
    const res = await request(app).get("/api-docs");
    expect(res.status).toBe(200);
    expect(res.text).toContain("swagger-ui-dist@5.17.14/swagger-ui-bundle.js");
    expect(res.text).toContain('url: "/openapi.json"');
    expect(res.text).toContain("withCredentials: true");
  });
});

describe("Health and readiness checks", () => {
  it("reports liveness without requiring a database query", async () => {
    const querySpy = jest.spyOn(pool, "query");
    const res = await request(app).get("/healthz");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "alive" });
    expect(querySpy).not.toHaveBeenCalled();
    querySpy.mockRestore();
  });

  it("reports readiness when the database is reachable", async () => {
    const res = await request(app).get("/readyz");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "ready",
      checks: { database: "ok" },
    });
  });

  it("returns 503 without leaking database errors when the database is unavailable", async () => {
    const querySpy = jest
      .spyOn(pool, "query")
      .mockImplementationOnce(() => Promise.reject(new Error("private database connection detail")));

    try {
      const res = await request(app).get("/readyz");

      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        status: "not_ready",
        checks: { database: "unavailable" },
      });
      expect(JSON.stringify(res.body)).not.toContain("private database connection detail");
    } finally {
      querySpy.mockRestore();
    }
  });
});

describe("Refresh token rotation", () => {
  async function getRefreshCookie(): Promise<string> {
    const login = await request(app)
      .post("/auth/login")
      .send({ email: "jesttest@test.com", password: "testtest123" });
    expect(login.status).toBe(200);
    const loginSetCookieHeader = login.headers["set-cookie"];
    const setCookies = Array.isArray(loginSetCookieHeader)
      ? loginSetCookieHeader
      : loginSetCookieHeader
        ? [loginSetCookieHeader]
        : [];
    const refreshCookie = setCookies.find((cookie) => cookie.startsWith("refreshToken="));
    expect(refreshCookie).toBeDefined();
    return refreshCookie!.split(";")[0];
  }

  it("rotates the refresh token and rejects reuse of the previous token", async () => {
    const oldRefreshCookie = await getRefreshCookie();
    const refreshed = await request(app)
      .post("/auth/refresh")
      .set("Cookie", [oldRefreshCookie]);

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.message).toBe("tokens refreshed");
    const refreshedSetCookieHeader = refreshed.headers["set-cookie"];
    const setCookies = Array.isArray(refreshedSetCookieHeader)
      ? refreshedSetCookieHeader
      : refreshedSetCookieHeader
        ? [refreshedSetCookieHeader]
        : [];
    expect(setCookies.some((cookie) => cookie.startsWith("accessToken="))).toBe(true);
    const newRefreshCookie = setCookies.find((cookie) => cookie.startsWith("refreshToken="));
    expect(newRefreshCookie).toBeDefined();
    expect(newRefreshCookie!.split(";")[0]).not.toBe(oldRefreshCookie);

    const reused = await request(app)
      .post("/auth/refresh")
      .set("Cookie", [oldRefreshCookie]);
    expect(reused.status).toBe(401);
  });

  it("allows only one of two concurrent refreshes using the same token", async () => {
    const refreshCookie = await getRefreshCookie();
    const [first, second] = await Promise.all([
      request(app).post("/auth/refresh").set("Cookie", [refreshCookie]),
      request(app).post("/auth/refresh").set("Cookie", [refreshCookie]),
    ]);

    expect([first.status, second.status].filter((status) => status === 200)).toHaveLength(1);
    expect([first.status, second.status].filter((status) => status === 401)).toHaveLength(1);
  });
});

describe("CSRF origin validation", () => {
  it("rejects state-changing requests from an untrusted origin", async () => {
    const res = await request(app)
      .post("/auth/refresh")
      .set("Origin", "https://attacker.example");

    expect(res.status).toBe(403);
    expect(res.body.error.status).toBe("FORBIDDEN");
  });

  it("allows the configured frontend origin to reach the route", async () => {
    const res = await request(app)
      .post("/auth/refresh")
      .set("Origin", env.FRONTEND_ORIGIN);

    // The origin is accepted; the route then rejects the missing refresh cookie.
    expect(res.status).toBe(400);
    expect(res.body.error.status).toBe("INVALID_ARGUMENT");
  });
});

describe("Authentication lifecycle", () => {
  async function getRefreshCookie(): Promise<string> {
    const login = await request(app)
      .post("/auth/login")
      .send({ email: "jesttest@test.com", password: "testtest123" });
    expect(login.status).toBe(200);
    const header = login.headers["set-cookie"];
    const setCookies = Array.isArray(header) ? header : header ? [header] : [];
    const refreshCookie = setCookies.find((cookie) => cookie.startsWith("refreshToken="));
    expect(refreshCookie).toBeDefined();
    return refreshCookie!.split(";")[0];
  }

  it("returns the same authentication error for an unknown email and a wrong password", async () => {
    const wrongPassword = await request(app)
      .post("/auth/login")
      .send({ email: "jesttest@test.com", password: "incorrect-password" });
    const unknownEmail = await request(app)
      .post("/auth/login")
      .send({ email: "unknown-user@test.com", password: "incorrect-password" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error).toMatchObject({
      status: "UNAUTHENTICATED",
      message: "Invalid credentials",
    });
    expect(unknownEmail.body.error).toMatchObject({
      status: "UNAUTHENTICATED",
      message: "Invalid credentials",
    });
  });

  it("revokes the refresh token on logout", async () => {
    const refreshCookie = await getRefreshCookie();
    const logout = await request(app)
      .post("/auth/logout")
      .set("Cookie", [refreshCookie]);

    expect(logout.status).toBe(204);

    const refreshAfterLogout = await request(app)
      .post("/auth/refresh")
      .set("Cookie", [refreshCookie]);
    expect(refreshAfterLogout.status).toBe(401);
    expect(refreshAfterLogout.body.error.status).toBe("UNAUTHENTICATED");
  });

  it("deletes an expired refresh token and rejects it", async () => {
    const user = await pool.query("SELECT id FROM users WHERE email = $1", [
      "jesttest@test.com",
    ]);
    const expiredToken = "expired-refresh-token-for-test";

    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() - INTERVAL '1 hour')",
      [user.rows[0].id, expiredToken],
    );

    const res = await request(app)
      .post("/auth/refresh")
      .set("Cookie", [`refreshToken=${expiredToken}`]);

    expect(res.status).toBe(401);
    expect(res.body.error.status).toBe("EXPIRED_TOKEN");

    const storedToken = await pool.query(
      "SELECT id FROM refresh_tokens WHERE token = $1",
      [expiredToken],
    );
    expect(storedToken.rowCount).toBe(0);
  });
});

describe("Todos API", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/todos");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatchObject({
      code: 401,
      status: "UNAUTHENTICATED",
      message: expect.any(String),
    });
  });

  it("creates a todo", async () => {
    const res = await request(app)
      .post("/todos")
      .set("Cookie", cookies)
      .send({ text: "Write jest tests" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.text).toBe("Write jest tests");
    expect(res.body.done).toBe(false);
    expect(res.body.user_id).toBeDefined();
  });

  it("rejects a todo with empty text", async () => {
    const res = await request(app)
      .post("/todos")
      .set("Cookie", cookies)
      .send({ text: "" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.status).toBe("INVALID_ARGUMENT");
  });

  it("rejects an update with no fields", async () => {
    const created = await request(app)
      .post("/todos")
      .set("Cookie", cookies)
      .send({ text: "Todo for empty update test" });

    expect(created.status).toBe(201);

    const res = await request(app)
      .put(`/todos/${created.body.id}`)
      .set("Cookie", cookies)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.status).toBe("INVALID_ARGUMENT");
  });

  it("updates a todo and preserves fields that were not supplied", async () => {
    const created = await request(app)
      .post("/todos")
      .set("Cookie", cookies)
      .send({ text: "Todo before update" });

    expect(created.status).toBe(201);

    const updated = await request(app)
      .put(`/todos/${created.body.id}`)
      .set("Cookie", cookies)
      .send({ done: true });

    expect(updated.status).toBe(200);
    expect(updated.body.id).toBe(created.body.id);
    expect(updated.body.text).toBe("Todo before update");
    expect(updated.body.done).toBe(true);
  });

  it("does not let another user update or delete an owned todo", async () => {
    const secondEmail = "otheruser@test.com";
    const secondPassword = "otheruser123";

    const signup = await request(app)
      .post("/auth/signup")
      .send({ email: secondEmail, password: secondPassword });
    expect(signup.status).toBe(201);

    const login = await request(app)
      .post("/auth/login")
      .send({ email: secondEmail, password: secondPassword });
    expect(login.status).toBe(200);

    const secondSetCookie = login.headers["set-cookie"];
    const secondCookies: string[] = Array.isArray(secondSetCookie)
      ? secondSetCookie
      : [secondSetCookie];

    const created = await request(app)
      .post("/todos")
      .set("Cookie", cookies)
      .send({ text: "Private todo" });
    expect(created.status).toBe(201);

    const updateAttempt = await request(app)
      .put(`/todos/${created.body.id}`)
      .set("Cookie", secondCookies)
      .send({ text: "Changed by another user" });
    expect(updateAttempt.status).toBe(404);

    const deleteAttempt = await request(app)
      .delete(`/todos/${created.body.id}`)
      .set("Cookie", secondCookies);
    // The API intentionally returns 204 even when no owned row was deleted.
    expect(deleteAttempt.status).toBe(204);

    const ownerList = await request(app).get("/todos").set("Cookie", cookies);
    const originalTodo = ownerList.body.find(
      (todo: { id: number }) => todo.id === created.body.id,
    );
    expect(originalTodo).toBeDefined();
    expect(originalTodo.text).toBe("Private todo");
  });

  it("deletes a todo", async () => {
    const created = await request(app)
      .post("/todos")
      .set("Cookie", cookies)
      .send({ text: "Todo to delete" });

    expect(created.status).toBe(201);

    const deleted = await request(app)
      .delete(`/todos/${created.body.id}`)
      .set("Cookie", cookies);

    expect(deleted.status).toBe(204);

    const listed = await request(app).get("/todos").set("Cookie", cookies);
    expect(listed.status).toBe(200);
    expect(listed.body.some((todo: { id: number }) => todo.id === created.body.id)).toBe(false);
  });

  it("fetches todos for the logged-in user", async () => {
    const res = await request(app).get("/todos").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});
