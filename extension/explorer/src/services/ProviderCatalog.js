/**
 * Curated list of hostnames that well-known platforms publish their shared
 * infrastructure under, so references to the same platform read as one finding
 * instead of a dozen unrelated hosts.
 *
 * This is a presentation aid built from public naming conventions. It says that
 * a hostname belongs to a platform's published namespace; it never establishes
 * who operates a site, who owns the content, or any relationship between the
 * analyzed target and the platform. A bucket, a CDN path and a tag endpoint all
 * live under these names without implying a single owner.
 */
export class ProviderCatalog {
  static PROVIDERS = [
    ["Google", ["google.com", "googleapis.com", "gstatic.com", "googletagmanager.com",
      "google-analytics.com", "googlesyndication.com", "googleadservices.com",
      "googleusercontent.com", "doubleclick.net", "youtube.com", "ytimg.com",
      "withgoogle.com", "recaptcha.net", "google.com.br", "goo.gl"]],
    ["Amazon Web Services", ["amazonaws.com", "cloudfront.net", "awsstatic.com",
      "amazonaws.com.cn", "aws.amazon.com"]],
    ["Microsoft", ["core.windows.net", "azureedge.net", "azurewebsites.net",
      "azure.com", "windows.net", "msecnd.net", "clarity.ms", "bing.com",
      "microsoft.com", "office.com", "live.com", "trafficmanager.net"]],
    ["Cloudflare", ["cloudflare.com", "cloudflare.net", "cloudflareinsights.com",
      "cf-ipfs.com", "pages.dev", "workers.dev"]],
    ["Meta", ["facebook.com", "facebook.net", "fbcdn.net", "instagram.com",
      "whatsapp.com", "whatsapp.net", "fb.com"]],
    ["Akamai", ["akamai.net", "akamaized.net", "akamaihd.net", "akamaiedge.net",
      "edgekey.net", "edgesuite.net"]],
    ["Fastly", ["fastly.net", "fastlylb.net", "fastly-edge.com"]],
    ["LinkedIn", ["linkedin.com", "licdn.com"]],
    ["Adobe", ["adobedtm.com", "typekit.net", "omtrdc.net", "demdex.net", "adobe.com"]],
    ["jsDelivr", ["jsdelivr.net"]],
    ["unpkg", ["unpkg.com"]],
    ["Shopify", ["shopify.com", "shopifycdn.com", "myshopify.com"]],
    ["Cloudinary", ["cloudinary.com", "res.cloudinary.com"]],
    ["Vercel", ["vercel.app", "vercel-dns.com", "vercel.com"]],
    ["TikTok", ["tiktok.com", "tiktokcdn.com", "byteoversea.com"]],
    ["X", ["twitter.com", "twimg.com", "t.co", "x.com"]],
  ];

  constructor(providers = ProviderCatalog.PROVIDERS) {
    this.index = new Map();
    for (const [name, suffixes] of providers)
      for (const suffix of suffixes) this.index.set(suffix, name);
  }

  /** The platform whose published namespace a hostname sits in, or null. */
  find(hostname) {
    if (!hostname) return null;
    const labels = String(hostname).toLowerCase().split(".");
    // Matches the longest registrable suffix first: "aws.amazon.com" over "amazon.com".
    for (let index = 0; index < labels.length - 1; index++) {
      const candidate = labels.slice(index).join(".");
      const provider = this.index.get(candidate);
      if (provider) return provider;
    }
    return null;
  }
}
