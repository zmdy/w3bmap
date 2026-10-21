# Command-line collectors

The `.sh`, `.bat`, and `.cmd` files are thin launchers for an object-oriented PHP CLI.
They share the connector's collectors and graph format, so **PHP 8.1+ is required
in both standalone and connected modes**. No server is needed in standalone mode.
See [connector requirements](connector.md#requirements) for PHP extensions.

Keep `cli/` and `probe/` in the same repository layout: the CLI loads the classes
from `probe/w3bmap.php`. The PHP connector itself can be deployed independently.

## Standalone mode

POSIX shell, from the repository root:

```sh
sh cli/w3bmap.sh --help
sh cli/w3bmap.sh --domain example.com --modules dns,headers,ssl,technologies
```

Windows Command Prompt:

```bat
cli\w3bmap.bat --help
cli\w3bmap.bat --domain example.com --modules dns,headers,ssl,technologies
```

All launchers accept the same arguments as:

```sh
php cli/w3bmap.php --domain example.com --modules dns,headers
```

Use `W3BMAP_PHP_BIN` when PHP is not on PATH. For XAMPP on Windows:

```bat
set "W3BMAP_PHP_BIN=C:\xampp\php\php.exe"
cli\w3bmap.bat --action capabilities
```

On POSIX systems:

```sh
export W3BMAP_PHP_BIN='/path/to/php'
sh cli/w3bmap.sh --action capabilities
```

## Connected mode

Set `W3BMAP_API_KEY` to your installed connector's token in the client environment,
then pass the full endpoint URL. Tokens are deliberately not accepted as CLI
arguments, keeping them out of process argument lists.

```sh
sh cli/w3bmap.sh --endpoint https://your-host.example/w3bmap.php --action capabilities
sh cli/w3bmap.sh --endpoint https://your-host.example/w3bmap.php --domain example.com --modules dns,rdap,ssl
```

For the development server described in [connector.md](connector.md), set
`W3BMAP_ALLOW_LOCAL_HTTP=1` in the client environment as well, then use:

```sh
sh cli/w3bmap.sh --endpoint http://127.0.0.1:8080/w3bmap.php --action capabilities
```

The equivalent Windows commands use `cli\w3bmap.bat` with the same options.
Remote endpoints require HTTPS. Endpoint redirects are never followed, so bearer
tokens cannot be forwarded by a redirect. Endpoint URLs must not contain
credentials, query parameters, or fragments. Use the final PHP file URL.

## Options and output

| Option | Meaning |
| --- | --- |
| `--domain HOST` | Required target hostname for analysis |
| `--modules LIST` | Comma-separated module list; default `dns,headers,ssl,technologies` |
| `--endpoint URL` | Optional self-hosted connector URL |
| `--action NAME` | `analyze` (default), `crawl`, `capabilities`, or connected-only `environment` |
| `--output FILE` | Create a new JSON file; never overwrite an existing file |
| `--help`, `-h` | Show usage |

Modules: `dns`, `rdap`, `headers`, `ssl`, `technologies`, `robots`, `sitemap`, `links`.
Use `--action capabilities` to discover availability on the selected runtime.

By default JSON is written to stdout and diagnostics go to stderr. To save a graph,
first create the output directory, then specify a file that does not exist:

```sh
mkdir -p exports
sh cli/w3bmap.sh --domain example.com --modules dns --output exports/example.json
```

`exports/` is ignored by Git. Standalone documents use `source: cli`; connected
documents retain `source: probe`, since the server collected their evidence.
There is no automatic merge between local and remote runs yet.

| Exit code | Meaning |
| --- | --- |
| `0` | Successful collection or metadata response |
| `1` | Request, configuration, connection, or output error |
| `2` | Invalid command-line arguments |
| `3` | Partial or failed collection; the graph and module errors are still written |

Both standalone and connected collections accept public domains without prior
registration. Public-address checks, TLS verification, limits, and redirect checks
still apply. Connected requests also require the server API key.

## Internal design

`Options` parses input, `CliController` coordinates services, `ConsoleView` renders
output, and `ConnectorClient` handles authenticated remote requests. Domain and
graph models and standalone services are shared with the connector. Shell and
BAT contain no application collection logic. The launchers are not MVC components;
they only hand arguments and exit codes to the PHP application.

A separate native PowerShell collector is not implemented in this first version.

## Recursive analysis

All launchers use the same PHP OOP recursive engine. `--url`, `--depth`,
`--recursive`, or any crawl selection option enables the `crawl` action. A domain
without a URL starts at its HTTPS homepage. Quote wildcard patterns so the shell
does not expand them. Version **0.8.0**.

```sh
sh cli/w3bmap.sh --url https://example.com/docs/ --depth 2 --scope host --max-pages 10 --modules dns,rdap,technologies,links --include 'https://example.com/docs/*' --exclude '*/logout*' --output exports/crawl.json
```

Windows Command Prompt (BAT and CMD are interchangeable):

```bat
cli\w3bmap.cmd --url https://example.com/docs/ --depth 2 --scope host --max-pages 10 --modules dns,rdap,technologies,links --include "https://example.com/docs/*" --output exports/crawl.json
```

Use `--endpoint` with the same options for connected recursion. The endpoint must
be updated to support `POST ?action=crawl`; the token remains in the environment.

| Option | Meaning |
| --- | --- |
| `--url URL` | Full initial page URL; queries and fragments are omitted |
| `--recursive` | Crawl the `--domain` HTTPS homepage with default limits |
| `--depth N` | 0–5; initial page is depth 0, default 1 |
| `--max-pages N` | 1–50, default 10 |
| `--max-hosts N` | 1–10, default 5 |
| `--scope host` | Same exact hostname (default) |
| `--scope subdomains` | Initial hostname and its subdomains |
| `--scope all` | All eligible public hosts |
| `--include PATTERN` | Full URL pattern with `*`; repeat up to 10 times |
| `--exclude PATTERN` | Exclude matching URLs; repeat up to 10 times |
| `--seed URL` | Explicit first-hop URL; repeat up to 20 times |

`--modules` controls additional host metadata and page headers/TLS; recursive
HTML link discovery and basic technology detection always run. Include filters
exclude nonmatching child URLs, while the initial URL bypasses inclusion.
Exclusion also applies to the initial URL and to redirects. See
[engine boundaries](connector.md#recursive-analysis) for the shared time/size
budgets and detection limitations. Partial crawls still export their graph and
exit with code 3. These limits apply in both standalone and connected mode.
