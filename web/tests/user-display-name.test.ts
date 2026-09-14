import { test } from "node:test";
import assert from "node:assert/strict";
import { userDisplayName } from "../lib/user-display-name";
test("display name comes from authenticated metadata with email fallback", () => {
  const user = { id: "user", email: "user@example.com" };
  assert.equal(
    userDisplayName({
      ...user,
      user_metadata: { display_name: " Maick Coelho ", full_name: "Outro" },
    }),
    "Maick Coelho",
  );
  assert.equal(
    userDisplayName({ ...user, user_metadata: { full_name: "Bruno Pereira" } }),
    "Bruno Pereira",
  );
  assert.equal(
    userDisplayName({ ...user, user_metadata: { name: "Danieli Oliveira" } }),
    "Danieli Oliveira",
  );
  assert.equal(
    userDisplayName({
      ...user,
      user_metadata: { display_name: " ", name: 123 },
    }),
    user.email,
  );
  assert.equal(userDisplayName(user), user.email);
});
