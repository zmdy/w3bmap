import validate from "../../vendor/graph-validator.js";

export class DocumentValidator {
  static MAX_BYTES = 16 * 1024 * 1024;
  static MAX_NODES = 5000;
  static MAX_EDGES = 15000;

  parse(text) {
    if (
      new TextEncoder().encode(text).byteLength > DocumentValidator.MAX_BYTES
    ) {
      throw new Error("The import limit is 16 MiB per document.");
    }
    let document;
    try {
      document = JSON.parse(text);
    } catch {
      throw new Error(
        "This file is not valid JSON. Select a w3bm@p collection export.",
      );
    }
    this.validate(document);
    return document;
  }

  validate(document) {
    if (
      (document?.nodes?.length ?? 0) > DocumentValidator.MAX_NODES ||
      (document?.edges?.length ?? 0) > DocumentValidator.MAX_EDGES
    ) {
      throw new Error(
        "The Explorer supports up to 5,000 entities and 15,000 relationships per document.",
      );
    }
    if (!validate(document)) {
      const error = validate.errors[0];
      throw new Error(
        `Invalid graph document at ${error.instancePath || "/"}: ${error.message}.`,
      );
    }
    const ids = new Set();
    for (const node of document.nodes) {
      if (ids.has(node.id))
        throw new Error(`Duplicate entity ID: ${this.short(node.id)}.`);
      ids.add(node.id);
    }
    for (const edge of document.edges) {
      if (!ids.has(edge.source) || !ids.has(edge.target)) {
        throw new Error(
          "A relationship references an entity that is missing from this document.",
        );
      }
    }
    return true;
  }

  short(value) {
    return value.length > 80 ? value.slice(0, 77) + "…" : value;
  }
}
