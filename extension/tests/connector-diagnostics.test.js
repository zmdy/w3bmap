import { test } from "node:test";
import assert from "node:assert/strict";
import { ConnectorClient } from "../src/services/ConnectorClient.js";
import { ConnectorSettings } from "../src/models/ConnectorSettings.js";

class ConnectorDiagnosticFixture {
  settings(endpoint) {
    return new ConnectorSettings({ endpoint, apiKey: "a".repeat(64), allowLocalHttp: true });
  }
  client(fetcher) { return new ConnectorClient({ permissions: { contains: async () => true } }, fetcher); }
}
const fixture = new ConnectorDiagnosticFixture();

test("local transport errors distinguish HTTPS certificate setup from HTTP server access without retrying", async () => {
  for (const endpoint of ["https://localhost/probe/w3bmap.php", "http://127.0.0.1/probe/w3bmap.php"]) {
    let requests = 0;
    const client = fixture.client(async () => { requests++; throw new TypeError("private transport detail"); });
    await assert.rejects(() => client.capabilities(fixture.settings(endpoint)), (error) => {
      assert.match(error.message, endpoint.startsWith("https:") ? /certificate trusted by Chrome/ : /Apache\/PHP is running/);
      assert.ok(!error.message.includes("private transport detail"));
      assert.ok(!error.message.includes("a".repeat(64)));
      return true;
    });
    assert.equal(requests, 1);
  }
});

test("HTTP diagnostics explain token forwarding, local HTTP configuration and missing endpoints", async () => {
  for (const [status, expected] of [[401, /Authorization header/], [403, /W3BMAP_ALLOW_LOCAL_HTTP=1/], [404, /full URL/]]) {
    const client = fixture.client(async () => new Response("private error page", { status }));
    await assert.rejects(() => client.capabilities(fixture.settings("http://localhost/probe/w3bmap.php")), (error) => {
      assert.match(error.message, new RegExp(`HTTP ${status}`));
      assert.match(error.message, expected);
      assert.ok(!error.message.includes("private error page"));
      assert.ok(!error.message.includes("allowlist"));
      return true;
    });
  }
});
