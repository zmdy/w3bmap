import { ConnectorClient } from "../src/services/ConnectorClient.js";
import { ConnectorSettings } from "../src/models/ConnectorSettings.js";
import { DocumentValidator } from "../explorer/src/services/DocumentValidator.js";

class ConnectorIntegration {
  async run() {
    const endpoint = process.env.W3BMAP_INTEGRATION_ENDPOINT;
    const apiKey = process.env.W3BMAP_API_KEY;
    if (!endpoint || !apiKey)
      throw new Error(
        "Set W3BMAP_INTEGRATION_ENDPOINT and W3BMAP_API_KEY before running this opt-in integration test.",
      );
    const settings = new ConnectorSettings({
      endpoint,
      apiKey,
      modules: ["dns"],
      allowLocalHttp: process.env.W3BMAP_ALLOW_LOCAL_HTTP === "1",
    });
    // This tests transport and PHP interoperability; Chrome host permission UI is tested manually.
    const client = new ConnectorClient({
      permissions: { contains: async () => true },
    });
    const capabilities = await client.capabilities(settings);
    if (!capabilities.modules.includes("dns"))
      throw new Error("The connector does not advertise DNS support.");
    const graph = await client.analyze(settings, "example.com");
    new DocumentValidator().validate(graph);
    if (
      graph.target !== "example.com" ||
      graph.source !== "probe" ||
      graph.status !== "complete"
    ) {
      throw new Error(
        "The connector did not return a complete DNS graph for example.com.",
      );
    }
    console.log(
      `Authenticated PHP integration passed: ${graph.nodes.length} entities, ${graph.edges.length} relationships.`,
    );
  }
}

new ConnectorIntegration().run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
