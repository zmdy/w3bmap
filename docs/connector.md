# PHP connector

The connector is optional and self-hosted. Deploy `probe/w3bmap.php` and
`probe/install.php` to the same directory. The installer can be removed after
setup; the API itself has no Composer, database, or sibling-code dependency.
It never executes system commands.

## Requirements

- PHP 8.1+ with DNS functions enabled.
- cURL for HTTP, RDAP, robots, and technology discovery.
- OpenSSL for certificate parsing, DOM for links, and SimpleXML for sitemaps.
- A working CA trust store for outbound HTTPS certificate verification.
- Outbound DNS and HTTPS access, and writable rate-limit storage outside the web root.
- HTTPS for inbound remote requests.

## Configuration

### Automatic installation

1. Open `probe/install.php` through your web server. On the default XAMPP setup,
   use `http://localhost/w3bm%40p/probe/install.php`.
2. Enter the hostnames you are authorized to analyze and review the limits.
3. Click **Generate key and install**. The installer creates a private `.env`,
   generates a 256-bit API key, and configures private rate-limit storage.
4. Save the key shown on the success page and enter it with the connector's full
   `w3bmap.php` URL in the extension settings. The key is displayed only once.

No `httpd.conf`, `SetEnv`, PHP-FPM environment changes, or server restart are
needed. The API automatically loads the private `.env` on every request.

The installer displays the exact configuration path. The directory is
`w3bmap-config/<installation-id>/` beside the public document root; the ID is
derived from the absolute connector directory. For XAMPP it is normally
`C:/xampp/w3bmap-config/<installation-id>/.env`, outside `htdocs`. Conventional
public ancestors such as `htdocs`, `public_html`, and `public` are recognized,
including when the PHP development server serves a nested directory. Keep the
same deployment path when switching servers. Moving the connector changes its
installation ID and requires migrating its private configuration.

PHP needs write access to this private directory during installation and to its
`rate` directory during use. If automatic creation fails, create the displayed
directory and grant access to the PHP service account. On POSIX systems the
installer uses directory mode `0700` and file mode `0600`; on Windows, inherited
NTFS permissions apply. Never copy the real `.env` into the public directory.

Local setup requires both a loopback client address and a loopback Host header.
Remote setup requires HTTPS plus a one-time code read through SSH or the hosting
file manager from the displayed private `setup-token` path. The remote page
creates this code but never reveals its contents. Sessions and CSRF tokens
protect form submissions. The code is deleted after successful installation.

An existing `.env` locks the installer, including if that file is malformed.
Repeated installation never overwrites it. Remove `install.php` after setup if
desired. To change settings or rotate the key, edit the private `.env` directly;
back up the existing configuration before intentionally reinstalling.

### File settings

`probe/.env.example` documents the supported settings. The `.env` values take
precedence over existing process environment variables, including explicitly
empty values. Process variables remain a fallback for deployments without a
file. The CLI keeps its existing process-environment behavior and does not
automatically read the server's private key.

Use one `NAME=value` per line. Full-line `#` comments, blank lines, unquoted
values, single-quoted literal strings, and JSON-style double-quoted strings are
supported. There is no variable expansion, command execution, or inline-comment
syntax. Unknown or duplicate keys, control characters, malformed values, and
files larger than 16 KiB are rejected. An invalid existing file returns HTTP 503
rather than silently reverting to another configuration.

| Variable | Default | Meaning |
| --- | --- | --- |
| `W3BMAP_API_KEY` | Unset | Required bearer token, at least 32 characters, without whitespace |
| `W3BMAP_ALLOW_LOCAL_HTTP` | `0` | `1` allows development HTTP requests only from a direct loopback peer |
| `W3BMAP_ENABLE_ENVIRONMENT` | `0` | `1` enables authenticated PHP version and extension diagnostics |
| `W3BMAP_RATE_LIMIT` | `30` | Authorized requests per fixed minute window, globally for this key; range 1–1000 |
| `W3BMAP_TIMEOUT` | `10` | Per-upstream-request timeout in seconds; range 1–30 |
| `W3BMAP_MAX_BYTES` | `1048576` | Per-upstream-response body limit in bytes; range 1024–5242880 |
| `W3BMAP_RATE_DIRECTORY` | Installer: private configuration directory + `/rate`; otherwise system temporary directory + `/w3bmap-rate` | Writable state directory outside the document root |

All public domain targets are accepted without prior registration. Every resolved
IPv4/IPv6 address must be public; there is no switch to scan private networks.
Redirects are checked under the same policy. Authentication and request limits
remain required.

Existing `.env` files may retain `W3BMAP_ALLOWED_DOMAINS` for compatibility, but
that retired setting is ignored. It can be removed; no reinstallation, API key
rotation, or server restart is needed. New installations do not write it.

The application reads the web server's `HTTPS` flag and deliberately does not
trust client-supplied forwarded headers. When terminating TLS at a trusted reverse
proxy, configure the web server to set that flag only for verified proxy traffic
and prevent direct access that bypasses the proxy. The connector reads bearer
authentication from PHP server variables or, for Apache handlers that expose it
there instead, the case-insensitive headers returned by `getallheaders()`. This
fallback does not require Apache configuration changes.

## Local development

Start the development server from the repository root:

```sh
php -S 127.0.0.1:8080 -t probe
```

Open `http://127.0.0.1:8080/install.php` and leave
the local HTTP checkbox enabled. Use the generated key with
`http://127.0.0.1:8080/w3bmap.php`. If already installed, edit the existing private
`.env` instead. For the CLI, see [cli.md](cli.md).

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
    "code": "unauthorized",
    "message": "A valid bearer token is required."
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
  These service hosts and each redirect are checked for public addresses.
  Use a registered domain for RDAP; subdomains often have no record.
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

The installer uses `InstallationSettings` as its configuration model,
`InstallationService` for private storage and atomic publication under a lock,
`InstallationAccess` for request authorization, `InstallationController` for
coordination, and `InstallationView` for HTML rendering. Configuration parsing
and private-path discovery are shared with the API.

Run `php tests/install.php` for configuration and installation unit checks, and
`php tests/install-http.php` for a complete isolated HTTP installation and
authenticated API check. The latter starts a temporary local PHP server and
requires cURL and `proc_open`; it never installs into the real deployment.
