import { parse } from "../../vendor/domain-parser.js";

/** Presentation-only similarity groups. Never establishes ownership or evidence. */
export class EntityGroupingService {
  static LABELS = { domain: "Domains", page: "Pages", asset: "Assets", technology: "Technologies",
    ip: "IP addresses", certificate: "Certificates", sitemap: "Sitemaps" };

  hostname(value) {
    try {
      const input = String(value).trim().replaceAll("\\.", ".");
      const url = new URL(input.includes("://") ? input : `https://${input}`);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
      return url.hostname.toLowerCase().replace(/\.$/, "");
    } catch { return null; }
  }

  domainGroups(nodes) {
    const buckets = new Map();
    for (const node of nodes) {
      const host = this.hostname(node.id?.replace(/^domain:/, "") || node.label);
      const result = host ? parse(host, { allowPrivateDomains: true }) : null;
      const base = result?.domain || host || node.label;
      if (!buckets.has(base)) buckets.set(base, []);
      buckets.get(base).push({ node, host });
    }
    return [...buckets].map(([base, entries]) => {
      let suffix = entries[0].host?.split(".") ?? [];
      for (const { host } of entries) {
        const labels = host?.split(".") ?? [];
        let count = 0;
        while (count < Math.min(suffix.length, labels.length) &&
          suffix[suffix.length - 1 - count] === labels[labels.length - 1 - count]) count++;
        suffix = count ? suffix.slice(-count) : [];
      }
      const shared = suffix.join(".") || base;
      // A single hostname is not a wildcard. An apex may also be a group member.
      const label = entries.some(({ host }) => host !== shared) ? `*.${shared}` : shared;
      return this.group("domain", base, label, entries.map(({ node }) => node));
    });
  }

  ipPrefix(value) {
    const address = String(value).replace(/^\[|\]$/g, "");
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address) && address.split(".").every((part) => Number(part) <= 255))
      return `${address.split(".").slice(0, 3).map(Number).join(".")}.0/24`;
    try {
      const normalized = new URL(`https://[${address}]/`).hostname.slice(1, -1);
      const [left, right = ""] = normalized.split("::");
      const head = left ? left.split(":") : [];
      const tail = right ? right.split(":") : [];
      const words = normalized.includes("::") ? [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail] : head;
      return `${words.slice(0, 3).map((part) => parseInt(part, 16).toString(16)).join(":")}::/48`;
    } catch { return "Other IP addresses"; }
  }

  group(type, key, label, members) {
    return { id: JSON.stringify([type, key]), type, label, members:
      [...members].sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id)) };
  }

  groups(nodes) {
    const unique = [...new Map(nodes.map((node) => [node.id, node])).values()];
    const groups = this.domainGroups(unique.filter((node) => node.type === "domain"));
    const buckets = new Map();
    for (const node of unique.filter((node) => node.type !== "domain")) {
      let label;
      switch (node.type) {
        case "page": case "asset": case "sitemap":
          label = this.hostname(node.evidence?.url || node.id.replace(/^(page|asset|sitemap):/, "")) || "Other sites";
          break;
        case "technology": label = node.evidence?.category || "Other technologies"; break;
        case "ip": label = this.ipPrefix(node.id.replace(/^ip:/, "")); break;
        case "certificate": {
          const issuer = node.evidence?.issuer;
          label = typeof issuer === "string" ? issuer : issuer?.O || issuer?.CN || "Other certificates";
          if (Array.isArray(label)) label = label.join(", ");
          break;
        }
        default: label = node.type;
      }
      const id = JSON.stringify([node.type, label]);
      if (!buckets.has(id)) buckets.set(id, this.group(node.type, label, String(label), []));
      buckets.get(id).members.push(node);
    }
    groups.push(...[...buckets.values()].map((group) => this.group(group.type, group.label, group.label, group.members)));
    return groups.sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label));
  }
}
