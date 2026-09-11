import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedEmail, sameOrigin, secureSessionCookie } from "../lib/auth";

test("only explicitly allowed emails can access; an empty list denies everyone", () => {
  const previous = process.env.WEB_ALLOWED_EMAILS;
  try {
    process.env.WEB_ALLOWED_EMAILS = "";
    assert.equal(allowedEmail("user@example.com"), false);
    process.env.WEB_ALLOWED_EMAILS = " User@Example.com, other@example.com ";
    assert.equal(allowedEmail("user@example.com"), true);
    assert.equal(allowedEmail("stranger@example.com"), false);
    assert.equal(allowedEmail(null), false);
  } finally {
    if (previous === undefined) delete process.env.WEB_ALLOWED_EMAILS;
    else process.env.WEB_ALLOWED_EMAILS = previous;
  }
});

test("local HTTP origins work in production previews without allowing remote HTTP", () => {
  for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
    const origin = `http://${host}`;
    const request = new Request(`${origin}/api/session`, {
      headers: { origin, host },
    });
    assert.equal(sameOrigin(request), true);
    assert.equal(secureSessionCookie(request.headers), false);
    assert.equal(secureSessionCookie(new Headers({ host })), false);
  }
  const remote = new Request("http://history.example.com/api/session", {
    headers: {
      origin: "http://history.example.com",
      host: "history.example.com",
    },
  });
  assert.equal(sameOrigin(remote), false);
  assert.equal(secureSessionCookie(remote.headers), true);
  assert.equal(
    sameOrigin(
      new Request("http://localhost:3000/api/session", {
        headers: { origin: "http://localhost:4000" },
      }),
    ),
    false,
  );
  assert.equal(
    secureSessionCookie(
      new Headers({
        origin: "https://history.example.com",
        host: "localhost:3000",
      }),
    ),
    true,
  );
  assert.equal(
    secureSessionCookie(
      new Headers({
        host: "localhost:3000",
        "x-forwarded-host": "history.example.com",
        "x-forwarded-proto": "https",
      }),
    ),
    true,
  );
});
test("origin check supports the deployment proxy and rejects cross-site requests", () => {
  const request = (origin?: string) =>
    new Request("http://localhost:3000/api/session", {
      headers: {
        "x-forwarded-host": "history.example.com",
        ...(origin ? { origin } : {}),
      },
    });
  assert.equal(sameOrigin(request("https://history.example.com")), true);
  assert.equal(sameOrigin(request("https://attacker.example.com")), false);
  assert.equal(sameOrigin(request("null")), false);
  assert.equal(sameOrigin(request()), false);
});
