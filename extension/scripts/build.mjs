import {
  cp,
  copyFile,
  mkdir,
  readdir,
  readFile,
  access,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

class ExtensionBuilder {
  async run() {
    const root = fileURLToPath(new URL("../", import.meta.url));
    const repository = path.dirname(root);
    const source = path.join(repository, "explorer");
    const destination = path.join(root, "explorer");
    await mkdir(destination, { recursive: true });
    for (const file of ["index.html", "app.js", "style.css"])
      await copyFile(path.join(source, file), path.join(destination, file));
    for (const directory of ["assets", "src"])
      await cp(
        path.join(source, directory),
        path.join(destination, directory),
        { recursive: true },
      );
    await mkdir(path.join(destination, "vendor"), { recursive: true });
    for (const file of await readdir(path.join(source, "vendor"))) {
      await copyFile(
        path.join(source, "vendor", file),
        path.join(destination, "vendor", file),
      );
    }
    await copyFile(
      path.join(repository, "shared/fingerprints.json"),
      path.join(root, "fingerprints.json"),
    );
    const manifest = JSON.parse(
      await readFile(path.join(root, "manifest.json"), "utf8"),
    );
    for (const file of [
      manifest.background.service_worker,
      manifest.action.default_popup,
      manifest.options_ui.page,
      ...Object.values(manifest.icons),
    ]) {
      await access(path.join(root, file));
    }
    console.log(
      "Unpacked extension is ready in extension/. Explorer and fingerprints are packaged locally.",
    );
  }
}

await new ExtensionBuilder().run();
