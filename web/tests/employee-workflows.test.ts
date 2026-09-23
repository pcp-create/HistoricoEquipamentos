import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
for (const family of ["preventivas", "locacoes"])
  for (const kind of ["weekly", "monthly", "overdue"]) {
    test(`${family}/${kind}: production recipients, isolated tests, empty channels and PDF preservation`, () => {
      const flow = JSON.parse(
        readFileSync(
          new URL(
            `../../automations/n8n/${family}-${kind}.json`,
            import.meta.url,
          ),
          "utf8",
        ),
      );
      for (const [name, channel, testDestination] of [
        ["Destinatários e-mail", "emails", "test@example.com"],
        ["Destinatários WhatsApp", "whatsapp", "5547999999999"],
      ]) {
        const code = flow.nodes.find((n: any) => n.name === name).parameters
          .jsCode;
        const run = new Function("$input", "$", code),
          binary = { report: { data: "pdf" } };
        const execute = (testMode: boolean, recipients: any) =>
          run({ first: () => ({ json: { recipients }, binary }) }, () => ({
            first: () => ({
              json: {
                testMode,
                testEmail: "test@example.com",
                phone: "5547999999999",
              },
            }),
          }));
        assert.deepEqual(execute(false, { emails: [], whatsapp: [] }), []);
        assert.equal(
          execute(true, {
            emails: ["production@example.com"],
            whatsapp: ["5511999999999"],
          })[0].json.destination,
          testDestination,
        );
        const result = execute(false, { [channel]: ["one", "one", "two"] });
        assert.equal(result.length, 2);
        assert.deepEqual(result[0].binary, binary);
        assert.throws(() => execute(false, undefined));
      }
      assert.equal(flow.connections["Enviar e-mail"], undefined);
    });
  }
