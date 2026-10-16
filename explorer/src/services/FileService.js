import { DocumentValidator } from "./DocumentValidator.js";

export class FileService {
  async read(file) {
    if (!file) throw new Error("Select a JSON file to import.");
    if (file.size > DocumentValidator.MAX_BYTES)
      throw new Error("The import limit is 16 MiB per document.");
    return file.text();
  }

  download(text, filename) {
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
