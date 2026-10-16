# PHP connector

The connector is optional and self-hosted. Deploy **only** `probe/w3bmap.php` to
your server; it has no Composer, database, or sibling-file dependency. It never
executes system commands.

## Requirements

- PHP 8.1+ with DNS functions enabled.
- cURL for HTTP, RDAP, robots, and technology discovery.
- OpenSSL for certificate parsing, DOM for links, and SimpleXML for sitemaps.
- A working CA trust store for outbound HTTPS certificate verification.
- Outbound DNS and HTTPS access, and writable rate-limit storage outside the web root.
- HTTPS for inbound remote requests.

## Configuration

Define environment variables in your web server or PHP-FPM configuration. A
`probe/.env.example` reference is included, but `.env` files are **not** loaded by
the application. Do not put your real token in source control or a public file.

Generate a key locally:

```sh
php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `W3BMAP_API_KEY` | Unset | Required bearer token, at least 32 characters, without whitespace |
| `W3BMAP_ALLOWED_DOMAINS` | Empty | Comma-separated authorized target hostnames; an empty list denies every target |
| `W3BMAP_ALLOW_LOCAL_HTTP` | `0` | `1` allows development HTTP requests only from a direct loopback peer |
| `W3BMAP_ENABLE_ENVIRONMENT` | `0` | `1` enables authenticated PHP version and extension diagnostics |
| `W3BMAP_RATE_LIMIT` | `30` | Authorized requests per fixed minute window, globally for this key; range 1–1000 |
| `W3BMAP_TIMEOUT` | `10` | Per-upstream-request timeout in seconds; range 1–30 |
| `W3BMAP_MAX_BYTES` | `1048576` | Per-upstream-response body limit in bytes; range 1024–5242880 |
| `W3BMAP_RATE_DIRECTORY` | System temporary directory + `/w3bmap-rate` | Writable state directory outside the document root |

Allowlist entries are exact: `example.com` does not authorize `www.example.com`.
Add both explicitly if needed. `*.example.com` authorizes subdomains but not the
apex domain. Redirect destinations must also be authorized. Public IPv4/IPv6
addresses are required; there is no switch to scan private networks.

The application reads the web server's `HTTPS` flag and deliberately does not
trust client-supplied forwarded headers. When terminating TLS at a trusted reverse
proxy, configure the web server to set that flag only for verified proxy traffic
and prevent direct access that bypasses the proxy. Ensure the server passes the
`Authorization` header to PHP.

## Local development

Use a fresh token and start the PHP development server from the repository root.
This command serves only the `probe` directory.

PowerShell:

```powershell
$env:W3BMAP_API_KEY = (php -r 'echo bin2hex(random_bytes(32));')
$env:W3BMAP_ALLOWED_DOMAINS = 'example.com,www.example.com'
$env:W3BMAP_ALLOW_LOCAL_HTTP = '1'
php -S 127.0.0.1:8080 -t probe
```

POSIX shell:

```sh
export W3BMAP_API_KEY="$(php -r 'echo bin2hex(random_bytes(32));')"
export W3BMAP_ALLOWED_DOMAINS='example.com,www.example.com'
export W3BMAP_ALLOW_LOCAL_HTTP=1
php -S 127.0.0.1:8080 -t probe
```

Configure the client with the same token in another terminal. The server token is
not printed by these commands. For the CLI, see [cli.md](cli.md).

## Protocol

Every operation, including capabilities, requires:

```http
Authorization: Bearer <your-api-key>
```

The action is selected using a query parameter on the installed PHP file.

| Request | Purpose |
| --- | --- |
| `GET ?action=capabilities` | API/schema versions, available modules, and limits |
| `GET ?action=dns&domain=example.com` | A, AAAA, MX, NS, TXT, CNAME, and SOA records |
| `GET ?action=rdap&domain=example.com` | Public registration data from RDAP |
| `GET ?action=headers&domain=example.com` | HTTP status and response headers |
| `GET ?action=ssl&domain=example.com` | Verified TLS certificate details and SHA-256 fingerprint |
| `GET ?action=technologies&domain=example.com` | Technology indicators from HTML and headers |
| `GET ?action=robots&domain=example.com` | Public robots.txt content |
| `GET ?action=sitemap&domain=example.com` | Up to 250 entries from sitemap.xml |
| `GET ?action=links&domain=example.com` | Up to 250 unique links from the homepage |
| `GET ?action=environment` | Optional local PHP diagnostics; disabled by default |
| `POST ?action=analyze` | Run selected modules and return one graph document |

Analyze requires `Content-Type: application/json` and an object such as:

```json
{
  "domain": "example.com",
  "modules": ["dns", "headers", "ssl", "technologies"]
}
```

If omitted, `modules` defaults to the four modules above. Targets must be DNS
hostnames in ASCII/punycode, without a scheme, path, or port. Web modules start
with HTTPS on port 443; redirects may use standard HTTP/HTTPS ports, and HTTPS
downgrades are rejected.

Collection responses follow [the shared graph schema](../shared/schema.json).
They include `status`, `nodes`, `edges`, per-module `results`, and `errors`.
Technology matches have confidence below 1 and `inferred` relationships.

A valid collection request returns HTTP 200 with `status` set to `complete`,
`partial`, or `failed`. Module failures remain in `errors` so successful findings
can still be used. Authentication, authorization, and request failures return
HTTP 4xx; server configuration failures return 503. These errors use:

```json
{
  "error": {
    "code": "target_not_allowed",
    "message": "The target is not in the connector domain allowlist."
  }
}
```

Capabilities and environment responses are metadata, not graph documents.
Responses use `Cache-Control: no-store`; credentials are never included in them.

## Network boundaries and current limits

- Each HTTP destination is resolved and checked for public addresses, then pinned
  with cURL while preserving hostname verification. All DNS answers must be public.
- Up to three redirects are followed, with validation and pinning at every hop.
- Outbound proxy environment variables are disabled to preserve destination pinning.
- Header data is limited to 64 KiB. Cookies and authentication challenges are omitted.
- The HTTP client has a 45-second aggregate budget. System DNS lookup timing still
  depends on the host resolver; configure its timeouts at the operating-system level.
- RDAP uses `https://rdap.org/domain/` and follows public HTTPS registry redirects.
  These service hosts are checked for public addresses separately from the target
  allowlist. Use a registered domain for RDAP; subdomains often have no record.
- TLS details describe the final HTTPS destination after redirects. Certificate
  inspection uses the verified HTTP connection, not a raw port scanner.
- Links and sitemap entries are recorded without fetching them. Sitemap indexes
  are recognized but not recursively expanded. There is no recursive crawler yet.
- Only the conventional `/robots.txt` and `/sitemap.xml` paths are queried.
- Fingerprints are a small embedded starter set, plus server headers. They are
  indicators rather than authoritative technology or version identification.
- Local directory inspection, WHOIS command execution, and DNS brute force are
  not implemented. Environment diagnostics expose only PHP version and extensions.

## Internal design

The single file contains separate models (`GraphDocument`, `HttpResponse`),
services (collectors, HTTP transport, network policy, rate limiter), a
`ProbeController`, and a `JsonView`. `Application` wires their dependencies.
Collectors and security services are not independent MVC applications; they
provide behavior to the controller and share the graph model and JSON view.
