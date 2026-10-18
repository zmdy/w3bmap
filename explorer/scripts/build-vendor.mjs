import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import standaloneCode from "ajv/dist/standalone/index.js";
import { build } from "esbuild";

class VendorBuilder {
  async run() {
    const root = fileURLToPath(new URL("../", import.meta.url));
    const output = path.join(root, "vendor");
    const require = createRequire(import.meta.url);
    await mkdir(output, { recursive: true });
    const schema = JSON.parse(
      await readFile(path.join(root, "../shared/schema.json"), "utf8"),
    );
    const ajv = new Ajv2020({
      code: { source: true, esm: true },
      ownProperties: true,
      strict: true,
    });
    addFormats(ajv);
    const source = standaloneCode(ajv, ajv.compile(schema));
    await build({
      stdin: {
        contents: source,
        resolveDir: root,
        sourcefile: "graph-validator.js",
      },
      bundle: true,
      format: "esm",
      platform: "browser",
      minify: true,
      outfile: path.join(output, "graph-validator.js"),
    });
    await copyFile(
      fileURLToPath(
        import.meta.resolve("cytoscape/dist/cytoscape.esm.min.mjs"),
      ),
      path.join(output, "cytoscape.js"),
    );
    await build({
      stdin: { contents: 'export { parse } from "tldts";', resolveDir: root },
      bundle: true,
      format: "esm",
      platform: "browser",
      minify: true,
      outfile: path.join(output, "domain-parser.js"),
    });
    for (const name of ["cytoscape", "ajv", "ajv-formats", "tldts", "tldts-core"]) {
      const packageRoot =
        name === "cytoscape"
          ? path.dirname(path.dirname(require.resolve(name)))
          : path.dirname(require.resolve(`${name}/package.json`));
      const license = await readFile(path.join(packageRoot, "LICENSE"), "utf8");
      await writeFile(path.join(output, `${name}-LICENSE.txt`), license.trimEnd() + "\n");
    }
    await writeFile(
      path.join(output, "schema.json"),
      JSON.stringify(schema, null, 2) + "\n",
    );
    console.log(
      "Local Cytoscape.js and standalone JSON Schema validator generated.",
    );
  }
}

await new VendorBuilder().run();
