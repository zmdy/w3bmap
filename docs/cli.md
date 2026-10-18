# Command-line collectors

The `.sh` and `.bat` files are thin launchers for an object-oriented PHP CLI.
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

Both launchers accept the same arguments as:

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
| `--action NAME` | `analyze` (default), `capabilities`, or connected-only `environment` |
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
