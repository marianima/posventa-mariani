import test from "node:test";
import assert from "node:assert/strict";
import { runPostventa } from "../runner.mjs";
import { readFile } from "node:fs/promises";

// Synthetic values only. No CRM credentials or real network requests.
const config = {
  POSTVENTA_SERVICE_TOKEN: "synthetic-test-value-".repeat(3),
  POSTVENTA_PUBLIC_ORIGIN: "https://crm.example.invalid",
};
const reply = (json, status = 200) => ({
  ok: status >= 200 && status < 300, status, json: async () => json,
});

test("missing mode sends only a probe and returns no upstream data", async () => {
  let calls = 0;
  const result = await runPostventa({ env: config, request: async (url, options) => {
    calls++;
    assert.equal(url.href, "https://crm.example.invalid/api/services/postventa/run");
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, `Bearer ${config.POSTVENTA_SERVICE_TOKEN}`);
    assert.deepEqual(JSON.parse(options.body), { probe: true });
    assert.ok(options.signal);
    return reply({ probe: true, automaticDispatch: false, extra: "not logged" });
  } });
  assert.equal(calls, 1);
  assert.deepEqual(result, { success: true, mode: "probe", processed: 0, automaticDispatch: false });
});

test("dispatch needs an explicit mode and respects disabled response", async () => {
  const result = await runPostventa({
    env: { ...config, POSTVENTA_MODE: "dispatch" },
    request: async (_url, options) => {
      assert.equal(options.body, "{}");
      return reply({ processed: 0, disabled: true });
    },
  });
  assert.deepEqual(result, { success: true, mode: "dispatch", processed: 0, disabled: true });
});

test("invalid configuration fails before making any request", async () => {
  for (const override of [
    { POSTVENTA_MODE: "enabled" },
    { POSTVENTA_MODE: "" },
    { POSTVENTA_SERVICE_TOKEN: "" },
    { POSTVENTA_SERVICE_TOKEN: "short" },
    { POSTVENTA_SERVICE_TOKEN: config.POSTVENTA_SERVICE_TOKEN + "\n" },
    { POSTVENTA_PUBLIC_ORIGIN: "" },
    { POSTVENTA_PUBLIC_ORIGIN: "http://crm.example.invalid" },
    { POSTVENTA_PUBLIC_ORIGIN: "https://example.replit.dev" },
    { POSTVENTA_PUBLIC_ORIGIN: "https://localhost" },
    { POSTVENTA_PUBLIC_ORIGIN: "https://user:pass@crm.example.invalid" },
    { POSTVENTA_PUBLIC_ORIGIN: "https://crm.example.invalid/path" },
    { POSTVENTA_PUBLIC_ORIGIN: "https://crm.example.invalid?token=value" },
  ]) {
    await assert.rejects(runPostventa({
      env: { ...config, ...override },
      request: () => assert.fail("must not call the network"),
    }));
  }
});

test("network errors, HTTP errors and ambiguous replies are never retried", async () => {
  for (const responder of [
    async () => { throw new Error(config.POSTVENTA_SERVICE_TOKEN); },
    async () => reply({}, 401),
    async () => reply({}, 503),
    async () => ({ ok: true, json: async () => { throw new Error("private body"); } }),
    async () => reply({ probe: true }),
    async () => reply({ probe: true, automaticDispatch: true }),
    async () => reply(null),
  ]) {
    let calls = 0;
    await assert.rejects(runPostventa({
      env: config,
      request: async () => { calls++; return responder(); },
    }), error => {
      assert.ok(!error.message.includes(config.POSTVENTA_SERVICE_TOKEN));
      assert.ok(!error.message.includes("private body"));
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("dispatch accepts only a bounded confirmed result", async () => {
  for (const result of [{ processed: 1 }, { processed: -1, disabled: false },
    { processed: 51, disabled: false }, { processed: "0", disabled: true }]) {
    await assert.rejects(runPostventa({
      env: { ...config, POSTVENTA_MODE: "dispatch" }, request: async () => reply(result),
    }));
  }
});

test("workflow remains daily, probe-only by default and time bounded", async () => {
  const workflow = await readFile(new URL("../.github/workflows/posventa.yml", import.meta.url), "utf8");
  assert.match(workflow, /cron: '0 13 \* \* \*'/);
  assert.match(workflow, /vars\.POSTVENTA_MODE \|\| 'probe'/);
  assert.match(workflow, /timeout-minutes: 6/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /secrets\.POSTVENTA_SERVICE_TOKEN/);
});
