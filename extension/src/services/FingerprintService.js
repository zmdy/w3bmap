export class FingerprintService {
  constructor(catalog) {
    this.catalog = catalog;
  }

  detect(snapshot) {
    const values = {
      resource: snapshot.resources.map((resource) => resource.url),
      generator: snapshot.generators,
      hint: snapshot.hints,
    };
    const matches = [];
    for (const technology of this.catalog.technologies) {
      for (const pattern of technology.patterns) {
        const value = values[pattern.source]?.find((candidate) =>
          candidate.toLowerCase().includes(pattern.contains.toLowerCase()),
        );
        if (value !== undefined) {
          matches.push({
            id: technology.id,
            name: technology.name,
            confidence: technology.confidence,
            evidence: {
              page: snapshot.url,
              indicator_type: pattern.source,
              indicator: value,
            },
          });
          break;
        }
      }
    }
    return matches;
  }
}
