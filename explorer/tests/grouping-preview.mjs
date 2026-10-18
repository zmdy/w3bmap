import { readFile, writeFile, mkdir } from "node:fs/promises";
import { SampleFactory } from "../src/models/SampleFactory.js";

class GroupingPreviewBuilder {
  async run() {
    const data = new SampleFactory().create();
    const hosts = ["api.simet.nic.br", "ipv4-api.simet.nic.br", "ipv6-api.simet.nic.br",
      "ipv4.sp-ix-p1.sp-ix.peers.simet.nic.br", "ipv4.sp-ix-p2.sp-ix.peers.simet.nic.br",
      "ipv4.sp-ix-p3.sp-ix.peers.simet.nic.br", "ipv4.sp-p1.sp.peers.simet.nic.br",
      "fonts.gstatic.com", "www.gstatic.com"];
    for (const host of hosts) {
      data.nodes.push({ ...data.nodes[0], id: `domain:${host}`, label: host });
      data.edges.push({ ...data.edges[0], source: `domain:${data.target}`, target: `domain:${host}`, type: "references" });
    }
    for (const node of data.nodes.filter((node) => node.type === "technology"))
      node.evidence.category = ["PHP", "nginx"].includes(node.label) ? "Server technologies" : "Web technologies";
    let html = await readFile(new URL("../index.html", import.meta.url), "utf8");
    const script = `
import { ExplorerController } from '../explorer/src/controllers/ExplorerController.js';
const controller = new ExplorerController();
controller.load(${JSON.stringify(data)}, 'Grouping fixture · synthetic data', true);
controller.setAllClusters(false);
controller.view.notice('Synthetic grouping fixture. No target websites were contacted.');
`;
    html = html.replace(/(href|src)="(?!https?:|#)([^"]+)"/g, '$1="/w3bm%40p/explorer/$2"')
      .replace('src="/w3bm%40p/explorer/app.js"', 'src="/w3bm%40p/data/grouping-preview.js"');
    await mkdir(new URL("../../data/", import.meta.url), { recursive: true });
    await writeFile(new URL("../../data/grouping-preview.html", import.meta.url), html);
    await writeFile(new URL("../../data/grouping-preview.js", import.meta.url), script);
    console.log("Grouping fixture: http://localhost/w3bm%40p/data/grouping-preview.html");
  }
}

await new GroupingPreviewBuilder().run();
