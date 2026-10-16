<?php

declare(strict_types=1);

namespace W3bmap;

use RuntimeException;
use Throwable;

final class AppException extends RuntimeException
{
    public function __construct(string $message, public int $status = 400, public string $errorCode = 'invalid_request')
    {
        parent::__construct($message);
    }
}

final class ConfigurationPaths
{
    public function __construct(public string $directory, public string $documentRoot)
    {
        $this->directory = self::normalize($directory);
        $this->documentRoot = self::normalize($documentRoot);
        if (self::contains($this->documentRoot, $this->directory)) {
            throw new AppException('The configuration directory must be outside the public document root.', 503, 'configuration_error');
        }
    }

    public static function discover(string $installationDirectory, string $documentRoot = ''): self
    {
        $installation = realpath($installationDirectory);
        if ($installation === false) {
            throw new AppException('The connector installation directory is unavailable.', 503, 'configuration_error');
        }
        $root = ($documentRoot !== '' ? realpath($documentRoot) : false) ?: $installation;
        $ancestor = $installation;
        do {
            if (in_array(strtolower(basename($ancestor)), ['htdocs', 'public_html', 'www', 'wwwroot', 'public', 'html'], true)
                && self::contains($ancestor, $root)) {
                $root = $ancestor;
            }
            $parent = dirname($ancestor);
            if ($parent === $ancestor) {
                break;
            }
            $ancestor = $parent;
        } while (true);
        $identity = self::normalize($installation);
        if (PHP_OS_FAMILY === 'Windows') {
            $identity = strtolower($identity);
        }
        return new self(dirname($root) . '/w3bmap-config/' . substr(hash('sha256', $identity), 0, 20), $root);
    }

    public static function normalize(string $path): string
    {
        $value = rtrim(str_replace('\\', '/', $path), '/');
        return $value === '' ? '/' : $value;
    }

    public static function contains(string $root, string $path): bool
    {
        $root = self::normalize($root);
        $path = self::normalize($path);
        if (PHP_OS_FAMILY === 'Windows') {
            $root = strtolower($root);
            $path = strtolower($path);
        }
        return $path === $root || str_starts_with($path, rtrim($root, '/') . '/');
    }

    public function envFile(): string
    {
        $resolved = realpath($this->directory);
        if (is_link($this->directory) || ($resolved !== false && self::contains($this->documentRoot, $resolved))) {
            throw new AppException('The configuration directory must remain private and cannot be a symbolic link.', 503, 'configuration_error');
        }
        return $this->directory . '/.env';
    }

    public function ensureDirectory(): void
    {
        if (is_link($this->directory) || (!is_dir($this->directory) && !@mkdir($this->directory, 0700, true))) {
            throw new AppException('PHP cannot create the private configuration directory. Create it outside the web root and grant the PHP user write access.', 503, 'configuration_error');
        }
        $resolved = realpath($this->directory);
        if ($resolved === false || self::contains($this->documentRoot, $resolved) || !is_writable($resolved)) {
            throw new AppException('The private configuration directory is unavailable or resolves inside the web root.', 503, 'configuration_error');
        }
        if (PHP_OS_FAMILY !== 'Windows' && !@chmod($resolved, 0700)) {
            throw new AppException('Cannot restrict private configuration directory permissions.', 503, 'configuration_error');
        }
    }
}

final class EnvironmentFile
{
    public const KEYS = ['W3BMAP_API_KEY', 'W3BMAP_ALLOWED_DOMAINS', 'W3BMAP_ALLOW_LOCAL_HTTP',
        'W3BMAP_ENABLE_ENVIRONMENT', 'W3BMAP_RATE_LIMIT', 'W3BMAP_TIMEOUT', 'W3BMAP_MAX_BYTES', 'W3BMAP_RATE_DIRECTORY'];

    public function read(string $path): array
    {
        if (!file_exists($path) && !is_link($path)) {
            return [];
        }
        if (is_link($path) || !is_file($path) || !is_readable($path)) {
            throw new AppException('The private .env file is not readable.', 503, 'configuration_error');
        }
        $content = @file_get_contents($path, false, null, 0, 16385);
        if ($content === false || strlen($content) > 16384) {
            throw new AppException('The private .env file is unreadable or exceeds 16 KiB.', 503, 'configuration_error');
        }
        return $this->parse($content);
    }

    public function parse(string $content): array
    {
        $values = [];
        $content = preg_replace('/^\xEF\xBB\xBF/', '', $content);
        foreach (preg_split('/\r\n|\n|\r/', $content) as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }
            if (!preg_match('/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/D', $line, $match)
                || !in_array($match[1], self::KEYS, true) || array_key_exists($match[1], $values)) {
                throw new AppException('The private .env file contains an unknown, duplicate, or malformed setting.', 503, 'configuration_error');
            }
            $value = trim($match[2]);
            if (str_starts_with($value, '"')) {
                try {
                    $value = json_decode($value, true, 8, JSON_THROW_ON_ERROR);
                } catch (\JsonException $error) {
                    throw new AppException('The private .env file contains an invalid quoted value.', 503, 'configuration_error');
                }
                if (!is_string($value)) {
                    throw new AppException('The private .env file requires string values.', 503, 'configuration_error');
                }
            } elseif (str_starts_with($value, "'")) {
                if (strlen($value) < 2 || !str_ends_with($value, "'")) {
                    throw new AppException('The private .env file contains an invalid quoted value.', 503, 'configuration_error');
                }
                $value = substr($value, 1, -1);
            }
            if (preg_match('/[\x00-\x1f\x7f]/', $value)) {
                throw new AppException('The private .env file contains control characters.', 503, 'configuration_error');
            }
            $values[$match[1]] = $value;
        }
        if (strlen($values['W3BMAP_API_KEY'] ?? '') < 32 || !array_key_exists('W3BMAP_ALLOWED_DOMAINS', $values)) {
            throw new AppException('The private .env file must define an API key and domain allowlist.', 503, 'configuration_error');
        }
        return $values;
    }

    public function encode(array $values): string
    {
        $lines = ['# w3bm@p connector configuration. Keep this file outside the public web root.'];
        foreach ($values as $key => $value) {
            if (!in_array($key, self::KEYS, true)) {
                throw new AppException('Unsupported configuration setting.', 503, 'configuration_error');
            }
            $lines[] = $key . '=' . json_encode((string) $value, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        }
        $content = implode("\n", $lines) . "\n";
        $this->parse($content);
        return $content;
    }
}

final class Config
{
    public function __construct(
        public string $apiKey = '',
        public array $allowedDomains = [],
        public bool $allowLocalHttp = false,
        public bool $enableEnvironment = false,
        public int $rateLimit = 30,
        public int $timeout = 10,
        public int $maxBytes = 1048576,
        public string $rateDirectory = ''
    ) {
    }

    public static function fromEnvironment(?string $envFile = null): self
    {
        $values = $envFile === null ? [] : (new EnvironmentFile())->read($envFile);
        return new self(
            self::value($values, 'W3BMAP_API_KEY'),
            array_values(array_filter(array_map('trim', explode(',', self::value($values, 'W3BMAP_ALLOWED_DOMAINS'))))),
            self::boolean($values, 'W3BMAP_ALLOW_LOCAL_HTTP'),
            self::boolean($values, 'W3BMAP_ENABLE_ENVIRONMENT'),
            self::integer($values, 'W3BMAP_RATE_LIMIT', 30, 1, 1000),
            self::integer($values, 'W3BMAP_TIMEOUT', 10, 1, 30),
            self::integer($values, 'W3BMAP_MAX_BYTES', 1048576, 1024, 5242880),
            self::value($values, 'W3BMAP_RATE_DIRECTORY') ?: sys_get_temp_dir() . '/w3bmap-rate'
        );
    }

    private static function value(array $values, string $name): string
    {
        if (array_key_exists($name, $values)) {
            return $values[$name];
        }
        $value = getenv($name);
        return $value === false ? '' : $value;
    }

    private static function boolean(array $values, string $name): bool
    {
        $raw = self::value($values, $name);
        if (!in_array($raw, ['', '0', '1'], true)) {
            throw new AppException('Invalid server configuration: ' . $name . '.', 503, 'configuration_error');
        }
        return $raw === '1';
    }

    private static function integer(array $values, string $name, int $default, int $min, int $max): int
    {
        $raw = self::value($values, $name);
        if ($raw === '') {
            return $default;
        }
        $value = filter_var($raw, FILTER_VALIDATE_INT);
        if ($value === false || $value < $min || $value > $max) {
            throw new AppException('Invalid server configuration: ' . $name . '.', 503, 'configuration_error');
        }
        return $value;
    }
}

final class Domain
{
    public static function normalize(string $value): string
    {
        $value = strtolower(rtrim(trim($value), '.'));
        if (strlen($value) > 253 || !preg_match('/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/D', $value)
            || filter_var($value, FILTER_VALIDATE_IP) !== false) {
            throw new AppException('Provide a DNS hostname, without a scheme, port, or path. Use ASCII or punycode.');
        }
        return $value;
    }
}

interface Resolver
{
    public function addresses(string $host): array;
    public function records(string $host): array;
}

final class SystemResolver implements Resolver
{
    public function addresses(string $host): array
    {
        $records = @dns_get_record($host, DNS_A | DNS_AAAA);
        $addresses = [];
        foreach ($records ?: [] as $record) {
            $address = $record['ip'] ?? $record['ipv6'] ?? null;
            if (is_string($address)) {
                $addresses[] = $address;
            }
        }
        return array_values(array_unique($addresses));
    }

    public function records(string $host): array
    {
        $records = @dns_get_record($host, DNS_A | DNS_AAAA | DNS_MX | DNS_NS | DNS_TXT | DNS_CNAME | DNS_SOA);
        if ($records === false) {
            throw new AppException('DNS lookup failed.', 502, 'dns_error');
        }
        return array_slice($records, 0, 250);
    }
}

final class NetworkPolicy
{
    public function __construct(private Resolver $resolver, private ?array $allowedDomains = null)
    {
    }

    public function authorize(string $host): string
    {
        $host = Domain::normalize($host);
        if ($this->allowedDomains === null) {
            return $host;
        }
        foreach ($this->allowedDomains as $rule) {
            $rule = strtolower(trim($rule));
            if ($host === $rule) {
                return $host;
            }
            if (str_starts_with($rule, '*.')) {
                $base = Domain::normalize(substr($rule, 2));
                if ($host !== $base && str_ends_with($host, '.' . $base)) {
                    return $host;
                }
            }
        }
        throw new AppException('The target is not in the connector domain allowlist.', 403, 'target_not_allowed');
    }

    public function resolvePublic(string $host): array
    {
        $addresses = $this->resolver->addresses($host);
        if ($addresses === []) {
            throw new AppException('The target has no usable DNS addresses.', 502, 'dns_error');
        }
        foreach ($addresses as $address) {
            if (!self::isPublicIp($address)) {
                throw new AppException('The destination resolves to a non-public address.', 403, 'blocked_destination');
            }
        }
        return $addresses;
    }

    public static function isPublicIp(string $address): bool
    {
        if (filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return false;
        }
        $packed = @inet_pton($address);
        if ($packed === false) {
            return false;
        }
        // IPv6 is limited to global unicast. This excludes mapped IPv4, NAT64,
        // unique-local, link-local, multicast, and transition destinations.
        if (strlen($packed) === 16) {
            if ((ord($packed[0]) & 0xe0) !== 0x20) {
                return false;
            }
            foreach (['2001::/23', '2001:db8::/32', '2002::/16', '3fff::/20'] as $cidr) {
                if (self::inCidr($address, $cidr)) {
                    return false;
                }
            }
        } else {
            foreach (['0.0.0.0/8', '100.64.0.0/10', '169.254.0.0/16', '192.0.0.0/24', '192.0.2.0/24',
                '192.88.99.0/24', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4'] as $cidr) {
                if (self::inCidr($address, $cidr)) {
                    return false;
                }
            }
        }
        return true;
    }

    private static function inCidr(string $address, string $cidr): bool
    {
        [$network, $bits] = explode('/', $cidr);
        $addressBytes = inet_pton($address);
        $networkBytes = inet_pton($network);
        if (strlen($addressBytes) !== strlen($networkBytes)) {
            return false;
        }
        $whole = intdiv((int) $bits, 8);
        $remainder = (int) $bits % 8;
        return substr($addressBytes, 0, $whole) === substr($networkBytes, 0, $whole)
            && ($remainder === 0 || (ord($addressBytes[$whole]) & (0xff << (8 - $remainder))) === ord($networkBytes[$whole]));
    }

    public function destination(string $url, bool $service = false): array
    {
        $parts = parse_url($url);
        if (!is_array($parts) || !isset($parts['host'], $parts['scheme'])
            || !in_array($parts['scheme'], $service ? ['https'] : ['http', 'https'], true)
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment'])
            || preg_match('/[\x00-\x20\x7f\\\\]/', $url)) {
            throw new AppException('Unsupported destination URL.', 403, 'blocked_destination');
        }
        $host = Domain::normalize($parts['host']);
        if (!$service) {
            $this->authorize($host);
        }
        $port = $parts['port'] ?? ($parts['scheme'] === 'https' ? 443 : 80);
        if ($port !== ($parts['scheme'] === 'https' ? 443 : 80)) {
            throw new AppException('Only standard HTTP and HTTPS target ports are allowed.', 403, 'blocked_destination');
        }
        return [$host, $port, $this->resolvePublic($host)];
    }
}

final class HttpResponse
{
    public function __construct(public string $url, public int $status, public array $headers, public string $body, public array $certificates = [])
    {
    }
}

interface HttpClient
{
    public function get(string $url, bool $service = false): HttpResponse;
}

final class Url
{
    public static function resolve(string $base, string $reference): ?string
    {
        $reference = trim($reference);
        if ($reference === '' || $reference[0] === '#' || preg_match('/[\x00-\x20\x7f\\\\]/', $reference)) {
            return null;
        }
        $reference = explode('#', $reference, 2)[0];
        $baseParts = parse_url($base);
        if (str_starts_with($reference, '//')) {
            $reference = $baseParts['scheme'] . ':' . $reference;
        } elseif (!preg_match('/^[a-z][a-z0-9+.-]*:/i', $reference)) {
            $origin = $baseParts['scheme'] . '://' . $baseParts['host'];
            if (str_starts_with($reference, '?')) {
                $reference = $origin . ($baseParts['path'] ?? '/') . $reference;
            } else {
                $path = str_starts_with($reference, '/') ? $reference : preg_replace('~/[^/]*$~', '/', $baseParts['path'] ?? '/') . $reference;
                $segments = [];
                [$pathOnly, $query] = array_pad(explode('?', $path, 2), 2, null);
                foreach (explode('/', $pathOnly) as $segment) {
                    if ($segment === '..') {
                        array_pop($segments);
                    } elseif ($segment !== '.' && $segment !== '') {
                        $segments[] = $segment;
                    }
                }
                $reference = $origin . '/' . implode('/', $segments)
                    . (str_ends_with($pathOnly, '/') && $segments !== [] ? '/' : '')
                    . ($query !== null ? '?' . $query : '');
            }
        }
        $parts = parse_url($reference);
        if (!is_array($parts) || !isset($parts['host'], $parts['scheme'])
            || !in_array(strtolower($parts['scheme']), ['https', 'http'], true)
            || isset($parts['user']) || isset($parts['pass'])) {
            return null;
        }
        return $reference;
    }
}

final class CurlHttpClient implements HttpClient
{
    private array $cache = [];
    private float $deadline;

    public function __construct(private NetworkPolicy $policy, private Config $config)
    {
        $this->deadline = microtime(true) + 45;
    }

    public function get(string $url, bool $service = false): HttpResponse
    {
        if (!extension_loaded('curl')) {
            throw new AppException('The cURL extension is required for this module.', 503, 'module_unavailable');
        }
        $cacheKey = ($service ? 'service:' : 'target:') . $url;
        if (isset($this->cache[$cacheKey])) {
            return $this->cache[$cacheKey];
        }
        $original = $url;
        for ($hop = 0; $hop <= 3; $hop++) {
            [$host, $port, $addresses] = $this->policy->destination($url, $service);
            // Use the exact canonical hostname that is pinned below, including
            // for redirects with a trailing DNS dot or mixed-case hostname.
            $parts = parse_url($url);
            $url = $parts['scheme'] . '://' . $host . ($parts['path'] ?? '/')
                . (isset($parts['query']) ? '?' . $parts['query'] : '');
            $remaining = (int) floor($this->deadline - microtime(true));
            if ($remaining < 1) {
                throw new AppException('The collection time budget was exceeded.', 504, 'timeout');
            }
            $address = $addresses[0];
            $pinned = str_contains($address, ':') ? '[' . $address . ']' : $address;
            $handle = curl_init($url);
            $headers = [];
            $body = '';
            $headerBytes = 0;
            $oversize = false;
            curl_setopt_array($handle, [
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
                CURLOPT_PROXY => '',
                CURLOPT_RESOLVE => [$host . ':' . $port . ':' . $pinned],
                CURLOPT_CONNECTTIMEOUT => min(5, $remaining),
                CURLOPT_TIMEOUT => min($this->config->timeout, $remaining),
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
                CURLOPT_CERTINFO => true,
                CURLOPT_USERAGENT => 'w3bmap/0.1 (+self-hosted web discovery)',
                CURLOPT_HTTPHEADER => ['Accept: application/rdap+json, application/json, text/html, application/xml, text/plain;q=0.9'],
                CURLOPT_HEADERFUNCTION => function ($curl, string $line) use (&$headers, &$headerBytes, &$oversize): int {
                    $headerBytes += strlen($line);
                    if ($headerBytes > 65536) {
                        $oversize = true;
                        return 0;
                    }
                    if (str_starts_with($line, 'HTTP/')) {
                        $headers = [];
                    } elseif (str_contains($line, ':')) {
                        [$name, $value] = explode(':', $line, 2);
                        $name = strtolower(trim($name));
                        // Do not export session cookies or authentication challenges.
                        if (!in_array($name, ['set-cookie', 'www-authenticate', 'proxy-authenticate'], true)) {
                            $headers[$name][] = trim($value);
                        }
                    }
                    return strlen($line);
                },
                CURLOPT_WRITEFUNCTION => function ($curl, string $chunk) use (&$body, &$oversize): int {
                    if (strlen($body) + strlen($chunk) > $this->config->maxBytes) {
                        $oversize = true;
                        return 0;
                    }
                    $body .= $chunk;
                    return strlen($chunk);
                },
            ]);
            $success = curl_exec($handle);
            $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
            $certificates = curl_getinfo($handle, CURLINFO_CERTINFO) ?: [];
            $error = curl_errno($handle);
            curl_close($handle);
            if ($oversize) {
                throw new AppException('The upstream response exceeded the size limit.', 502, 'response_too_large');
            }
            if ($success === false) {
                throw new AppException('The upstream request failed (cURL code ' . $error . ').', 502, 'upstream_error');
            }
            if (in_array($status, [301, 302, 303, 307, 308], true) && isset($headers['location'][0])) {
                $next = Url::resolve($url, $headers['location'][0]);
                if ($hop === 3 || $next === null || (str_starts_with($url, 'https:') && !str_starts_with($next, 'https:'))) {
                    throw new AppException('The upstream redirect is unsupported or exceeds the redirect limit.', 502, 'redirect_error');
                }
                // Every redirect is reauthorized, resolved, checked, and pinned.
                $url = $next;
                continue;
            }
            return $this->cache[$cacheKey] = new HttpResponse($url, $status, $headers, $body, $certificates);
        }
        throw new AppException('Unable to retrieve ' . $original . '.', 502, 'upstream_error');
    }
}

final class GraphDocument
{
    private array $nodes = [];
    private array $edges = [];
    private array $results = [];
    private array $errors = [];
    private string $collectedAt;

    public function __construct(private string $target, private string $source)
    {
        $this->collectedAt = gmdate('Y-m-d\TH:i:s\Z');
        $this->node('domain:' . $target, 'domain', $target, ['input' => $target], 1.0);
    }

    public function node(string $id, string $type, string $label, array $evidence, float $confidence = 1.0): void
    {
        $evidence = array_merge($this->nodes[$id]['evidence'] ?? [], $evidence);
        $this->nodes[$id] = ['id' => $id, 'type' => $type, 'label' => $label,
            'source' => $this->source, 'collected_at' => $this->collectedAt,
            'evidence' => $evidence, 'confidence' => $confidence];
    }

    public function edge(string $source, string $target, string $type, array $evidence, float $confidence = 1.0): void
    {
        $this->edges[$source . '|' . $type . '|' . $target] = ['source' => $source, 'target' => $target,
            'type' => $type, 'source_tool' => $this->source, 'collected_at' => $this->collectedAt,
            'evidence' => $evidence, 'confidence' => $confidence,
            'verification' => $confidence === 1.0 ? 'observed' : 'inferred'];
    }

    public function result(string $module, array $data): void
    {
        $this->results[$module] = $data;
    }

    public function error(string $module, AppException $error): void
    {
        $this->errors[] = ['module' => $module, 'code' => $error->errorCode, 'message' => $error->getMessage()];
    }

    public function toArray(): array
    {
        return ['schema_version' => '1.0', 'tool' => 'w3bm@p', 'target' => $this->target,
            'source' => $this->source, 'collected_at' => $this->collectedAt,
            'status' => $this->errors === [] ? 'complete' : ($this->results === [] ? 'failed' : 'partial'),
            'nodes' => array_values($this->nodes), 'edges' => array_values($this->edges),
            'results' => (object) $this->results, 'errors' => $this->errors];
    }
}

interface Collector
{
    public function collect(string $module, string $domain, GraphDocument $graph): void;
}

final class DnsCollector implements Collector
{
    public function __construct(private Resolver $resolver)
    {
    }

    public function collect(string $module, string $domain, GraphDocument $graph): void
    {
        $records = $this->resolver->records($domain);
        $graph->result('dns', ['records' => $records]);
        foreach ($records as $record) {
            if (isset($record['ip']) || isset($record['ipv6'])) {
                $address = $record['ip'] ?? $record['ipv6'];
                $graph->node('ip:' . $address, 'ip', $address, $record);
                $graph->edge('domain:' . $domain, 'ip:' . $address, 'resolves_to', $record);
            } elseif (in_array($record['type'] ?? '', ['CNAME', 'MX', 'NS'], true) && isset($record['target'])) {
                $target = strtolower(rtrim($record['target'], '.'));
                // A null MX target (".") explicitly declares that no mail service exists.
                if ($target === '') {
                    continue;
                }
                $graph->node('domain:' . $target, 'domain', $target, $record);
                $type = ['CNAME' => 'aliases', 'MX' => 'mail_server', 'NS' => 'nameserver'][$record['type']];
                $graph->edge('domain:' . $domain, 'domain:' . $target, $type, $record);
            }
        }
    }
}

final class WebCollector implements Collector
{
    public function __construct(private HttpClient $http)
    {
    }

    public function collect(string $module, string $domain, GraphDocument $graph): void
    {
        $suffix = ['robots' => '/robots.txt', 'sitemap' => '/sitemap.xml'][$module] ?? '/';
        $response = $this->http->get('https://' . $domain . $suffix);
        if (!in_array($module, ['headers', 'ssl'], true) && ($response->status < 200 || $response->status >= 300)) {
            throw new AppException('The upstream resource returned HTTP ' . $response->status . '.', 502, 'upstream_status');
        }
        switch ($module) {
            case 'headers':
                $graph->result($module, ['url' => $response->url, 'status' => $response->status, 'headers' => $response->headers]);
                break;
            case 'robots':
                $graph->result($module, ['url' => $response->url, 'content' => $response->body]);
                break;
            case 'ssl':
                $this->certificate($domain, $response, $graph);
                break;
            case 'technologies':
                $this->technologies($domain, $response, $graph);
                break;
            case 'links':
                $this->links($domain, $response, $graph);
                break;
            case 'sitemap':
                $this->sitemap($domain, $response, $graph);
                break;
        }
    }

    private function certificate(string $domain, HttpResponse $response, GraphDocument $graph): void
    {
        $pem = $response->certificates[0]['Cert'] ?? '';
        $certificate = $pem !== '' ? @openssl_x509_parse($pem) : false;
        if ($certificate === false) {
            throw new AppException('The TLS backend did not expose a peer certificate.', 502, 'certificate_unavailable');
        }
        $fingerprint = openssl_x509_fingerprint($pem, 'sha256');
        $data = ['url' => $response->url, 'sha256' => $fingerprint,
            'subject' => $certificate['subject'] ?? [], 'issuer' => $certificate['issuer'] ?? [],
            'valid_from' => gmdate('c', $certificate['validFrom_time_t']),
            'valid_to' => gmdate('c', $certificate['validTo_time_t']),
            'subject_alt_names' => $certificate['extensions']['subjectAltName'] ?? ''];
        $graph->result('ssl', $data);
        $id = 'certificate:' . $fingerprint;
        $graph->node($id, 'certificate', $domain . ' TLS certificate', $data);
        $actualHost = strtolower((string) parse_url($response->url, PHP_URL_HOST));
        $graph->node('domain:' . $actualHost, 'domain', $actualHost, ['url' => $response->url]);
        $graph->edge('domain:' . $actualHost, $id, 'presents', ['url' => $response->url, 'sha256' => $fingerprint]);
    }

    private function technologies(string $domain, HttpResponse $response, GraphDocument $graph): void
    {
        $signatures = [
            'wordpress' => ['WordPress', '~(?:wp-content/|wp-includes/)~i'],
            'drupal' => ['Drupal', '~(?:Drupal\.settings|/sites/default/files/)~i'],
            'nextjs' => ['Next.js', '~(?:/_next/|__NEXT_DATA__)~'],
            'nuxt' => ['Nuxt', '~(?:/_nuxt/|__NUXT__)~'],
            'jquery' => ['jQuery', '~jquery(?:[.-][0-9]+)*(?:\.min)?\.js~i'],
            'bootstrap' => ['Bootstrap', '~bootstrap(?:\.bundle)?(?:\.min)?\.(?:js|css)~i'],
        ];
        $matches = [];
        foreach ($signatures as $id => [$label, $pattern]) {
            if (preg_match($pattern, $response->body, $match)) {
                $matches[] = ['id' => $id, 'name' => $label, 'evidence' => ['url' => $response->url, 'match' => $match[0]], 'confidence' => 0.8];
            }
        }
        foreach (['server', 'x-powered-by'] as $header) {
            foreach ($response->headers[$header] ?? [] as $value) {
                $name = preg_split('~[/\s]~', $value)[0];
                if ($name !== '') {
                    $matches[] = ['id' => strtolower($name), 'name' => $name,
                        'evidence' => ['url' => $response->url, 'header' => $header, 'value' => $value], 'confidence' => 0.7];
                }
            }
        }
        foreach ($matches as $match) {
            $id = 'technology:' . $match['id'];
            $graph->node($id, 'technology', $match['name'], $match['evidence'], $match['confidence']);
            $graph->edge('domain:' . $domain, $id, 'uses', $match['evidence'], $match['confidence']);
        }
        $graph->result('technologies', ['matches' => $matches, 'note' => 'Fingerprint matches are indicators, not proof.']);
    }

    private function links(string $domain, HttpResponse $response, GraphDocument $graph): void
    {
        $document = new \DOMDocument();
        $previous = libxml_use_internal_errors(true);
        try {
            $loaded = $document->loadHTML($response->body, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
        if (!$loaded) {
            throw new AppException('Unable to parse the HTML document.', 502, 'parse_error');
        }
        $base = $response->url;
        $baseElement = $document->getElementsByTagName('base')->item(0);
        if ($baseElement !== null) {
            $base = Url::resolve($base, $baseElement->getAttribute('href')) ?? $base;
        }
        $urls = [];
        foreach ($document->getElementsByTagName('a') as $anchor) {
            $url = Url::resolve($base, $anchor->getAttribute('href'));
            if ($url !== null) {
                $urls[$url] = ['url' => $url, 'internal' => strtolower((string) parse_url($url, PHP_URL_HOST)) === $domain];
            }
            if (count($urls) >= 250) {
                break;
            }
        }
        $graph->node('page:' . $response->url, 'page', $response->url, ['url' => $response->url]);
        $graph->edge('domain:' . $domain, 'page:' . $response->url, 'contains', ['url' => $response->url]);
        foreach ($urls as $entry) {
            $graph->node('page:' . $entry['url'], 'page', $entry['url'], ['discovered_on' => $response->url]);
            $graph->edge('page:' . $response->url, 'page:' . $entry['url'], 'links_to', ['discovered_on' => $response->url]);
        }
        $graph->result('links', ['url' => $response->url, 'links' => array_values($urls), 'limit' => 250]);
    }

    private function sitemap(string $domain, HttpResponse $response, GraphDocument $graph): void
    {
        // DTDs are unnecessary for sitemaps and must never trigger entity expansion.
        if (stripos($response->body, '<!DOCTYPE') !== false || stripos($response->body, '<!ENTITY') !== false) {
            throw new AppException('Sitemap DTDs and entities are not supported.', 502, 'parse_error');
        }
        $previous = libxml_use_internal_errors(true);
        try {
            $xml = simplexml_load_string($response->body, 'SimpleXMLElement', LIBXML_NONET);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
        if ($xml === false || !in_array($xml->getName(), ['urlset', 'sitemapindex'], true)) {
            throw new AppException('The resource is not a supported sitemap.', 502, 'parse_error');
        }
        $isIndex = $xml->getName() === 'sitemapindex';
        $entries = $xml->xpath('/*[local-name()="urlset" or local-name()="sitemapindex"]/*/*[local-name()="loc"]') ?: [];
        $urls = [];
        foreach (array_slice($entries, 0, 250) as $entry) {
            $url = Url::resolve($response->url, (string) $entry);
            if ($url !== null) {
                $urls[] = $url;
                $type = $isIndex ? 'sitemap' : 'page';
                $graph->node($type . ':' . $url, $type, $url, ['sitemap' => $response->url]);
                $graph->edge('domain:' . $domain, $type . ':' . $url, 'declares', ['sitemap' => $response->url]);
            }
        }
        $graph->result('sitemap', ['url' => $response->url, 'kind' => $isIndex ? 'index' : 'urlset', 'urls' => $urls, 'limit' => 250]);
    }
}

final class RdapCollector implements Collector
{
    public function __construct(private HttpClient $http)
    {
    }

    public function collect(string $module, string $domain, GraphDocument $graph): void
    {
        $response = $this->http->get('https://rdap.org/domain/' . rawurlencode($domain), true);
        if ($response->status !== 200) {
            throw new AppException('RDAP returned HTTP ' . $response->status . '. Query a registered domain, not a subdomain.', 502, 'rdap_error');
        }
        try {
            $record = json_decode($response->body, true, 64, JSON_THROW_ON_ERROR);
        } catch (\JsonException $error) {
            throw new AppException('The RDAP response is not valid JSON.', 502, 'parse_error');
        }
        if (!is_array($record) || !isset($record['objectClassName']) || $record['objectClassName'] !== 'domain') {
            throw new AppException('The RDAP response is not a domain record.', 502, 'parse_error');
        }
        $graph->result('rdap', ['url' => $response->url, 'record' => $record]);
    }
}

final class CollectionService
{
    private array $collectors;

    public function __construct(private NetworkPolicy $policy, Resolver $resolver, HttpClient $http)
    {
        $web = new WebCollector($http);
        $this->collectors = ['dns' => new DnsCollector($resolver), 'rdap' => new RdapCollector($http),
            'headers' => $web, 'ssl' => $web, 'technologies' => $web, 'robots' => $web,
            'sitemap' => $web, 'links' => $web];
    }

    public function available(): array
    {
        $modules = ['dns'];
        if (extension_loaded('curl')) {
            $modules = array_merge($modules, ['rdap', 'headers', 'technologies', 'robots']);
            if (extension_loaded('openssl')) {
                $modules[] = 'ssl';
            }
            if (extension_loaded('SimpleXML')) {
                $modules[] = 'sitemap';
            }
            if (extension_loaded('dom')) {
                $modules[] = 'links';
            }
        }
        return $modules;
    }

    public function analyze(string $domain, array $modules, string $source): array
    {
        $domain = $this->policy->authorize($domain);
        if ($modules === [] || count($modules) > count($this->collectors)) {
            throw new AppException('Select between one and eight collection modules.');
        }
        foreach ($modules as $module) {
            if (!is_string($module) || !isset($this->collectors[$module])) {
                throw new AppException('Unknown collection module.');
            }
        }
        $this->policy->resolvePublic($domain);
        $graph = new GraphDocument($domain, $source);
        foreach (array_unique($modules) as $module) {
            try {
                if (!in_array($module, $this->available(), true)) {
                    throw new AppException('The requested module is unavailable on this PHP installation.', 503, 'module_unavailable');
                }
                $this->collectors[$module]->collect($module, $domain, $graph);
            } catch (AppException $error) {
                $graph->error($module, $error);
            }
        }
        return $graph->toArray();
    }
}

final class FileRateLimiter
{
    public function __construct(private string $directory, private int $limit)
    {
    }

    public function consume(string $key): void
    {
        if ((!is_dir($this->directory) && !@mkdir($this->directory, 0700, true)) || !is_writable($this->directory)) {
            throw new AppException('Rate limit storage is unavailable.', 503, 'configuration_error');
        }
        $path = $this->directory . '/' . hash('sha256', $key) . '.json';
        $file = @fopen($path, 'c+');
        if ($file === false) {
            throw new AppException('Rate limit storage is unavailable.', 503, 'configuration_error');
        }
        try {
            if (!flock($file, LOCK_EX)) {
                throw new AppException('Unable to lock rate limit storage.', 503, 'configuration_error');
            }
            $state = json_decode(stream_get_contents($file, 4096), true);
            $window = intdiv(time(), 60);
            $count = is_array($state) && ($state['window'] ?? null) === $window ? (int) ($state['count'] ?? 0) : 0;
            if ($count >= $this->limit) {
                throw new AppException('The connector request limit has been reached. Retry in the next minute.', 429, 'rate_limited');
            }
            rewind($file);
            $data = json_encode(['window' => $window, 'count' => $count + 1], JSON_THROW_ON_ERROR);
            if (!ftruncate($file, 0) || fwrite($file, $data) !== strlen($data) || !fflush($file)) {
                throw new AppException('Unable to persist rate limit state.', 503, 'configuration_error');
            }
        } finally {
            flock($file, LOCK_UN);
            fclose($file);
        }
    }
}

final class ProbeRequest
{
    public function __construct(public array $server, public array $query, public string $body)
    {
    }

    public function authorize(Config $config): void
    {
        if (strlen($config->apiKey) < 32 || preg_match('/[\x00-\x20\x7f]/', $config->apiKey)) {
            throw new AppException('Configure a server API key with at least 32 characters.', 503, 'configuration_error');
        }
        $secure = strtolower((string) ($this->server['HTTPS'] ?? ''));
        $loopback = in_array($this->server['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
        if (!in_array($secure, ['on', '1'], true) && !($config->allowLocalHttp && $loopback)) {
            throw new AppException('HTTPS is required. Local HTTP must be explicitly enabled.', 403, 'https_required');
        }
        $header = $this->server['HTTP_AUTHORIZATION'] ?? $this->server['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (!is_string($header) || !preg_match('/^Bearer ([^\s]+)$/Di', $header, $matches)
            || !hash_equals($config->apiKey, $matches[1])) {
            throw new AppException('A valid bearer token is required.', 401, 'unauthorized');
        }
    }

    public function parameters(): array
    {
        $method = $this->server['REQUEST_METHOD'] ?? 'GET';
        if (!in_array($method, ['GET', 'POST'], true)) {
            throw new AppException('Only GET and POST are supported.', 405, 'method_not_allowed');
        }
        $parameters = $this->query;
        if (strlen($this->body) > 16384) {
            throw new AppException('The request body is too large.', 413, 'request_too_large');
        }
        if ($method === 'POST') {
            $contentType = strtolower(trim(explode(';', $this->server['CONTENT_TYPE'] ?? '')[0]));
            if ($contentType !== 'application/json') {
                throw new AppException('POST requests require application/json.', 415, 'unsupported_media_type');
            }
            try {
                $body = json_decode($this->body, false, 16, JSON_THROW_ON_ERROR);
            } catch (\JsonException $error) {
                throw new AppException('The request body must be a JSON object.');
            }
            if (!$body instanceof \stdClass) {
                throw new AppException('The request body must be a JSON object.');
            }
            $parameters = array_merge($parameters, (array) $body);
        }
        foreach (['action', 'domain'] as $key) {
            if (isset($parameters[$key]) && !is_string($parameters[$key])) {
                throw new AppException('The ' . $key . ' parameter must be a string.');
            }
        }
        if (isset($parameters['modules']) && (!is_array($parameters['modules']) || !array_is_list($parameters['modules']))) {
            throw new AppException('The modules parameter must be a JSON array.');
        }
        $action = $parameters['action'] ?? 'capabilities';
        if ($action === 'analyze' && $method !== 'POST') {
            throw new AppException('The analyze action requires POST.', 405, 'method_not_allowed');
        }
        return $parameters;
    }
}

final class JsonView
{
    public function encode(array $data): string
    {
        return json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR) . "\n";
    }

    public function send(array $data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        if ($status === 401) {
            header('WWW-Authenticate: Bearer');
        }
        if ($status === 429) {
            header('Retry-After: ' . (60 - time() % 60));
        }
        if ($status === 405) {
            header('Allow: GET, POST');
        }
        echo $this->encode($data);
    }
}

final class ProbeController
{
    public function __construct(private Config $config, private CollectionService $collection, private FileRateLimiter $limiter)
    {
    }

    public function handle(ProbeRequest $request): array
    {
        $request->authorize($this->config);
        $this->limiter->consume($this->config->apiKey);
        $parameters = $request->parameters();
        $action = $parameters['action'] ?? 'capabilities';
        if ($action === 'capabilities') {
            return ['tool' => 'w3bm@p', 'api_version' => '1.0', 'schema_version' => '1.0',
                'modules' => $this->collection->available(), 'environment_enabled' => $this->config->enableEnvironment,
                'limits' => ['requests_per_minute' => $this->config->rateLimit, 'timeout_seconds' => $this->config->timeout,
                    'max_response_bytes' => $this->config->maxBytes, 'max_redirects' => 3, 'max_discovered_urls' => 250]];
        }
        if ($action === 'environment') {
            if (!$this->config->enableEnvironment) {
                throw new AppException('Environment diagnostics are disabled.', 403, 'module_disabled');
            }
            return ['tool' => 'w3bm@p', 'php_version' => PHP_VERSION, 'extensions' => get_loaded_extensions()];
        }
        if ($action !== 'analyze' && !in_array($action, ['dns', 'rdap', 'headers', 'ssl', 'technologies', 'robots', 'sitemap', 'links'], true)) {
            throw new AppException('Unknown action.');
        }
        $modules = $action === 'analyze' ? ($parameters['modules'] ?? ['dns', 'headers', 'ssl', 'technologies']) : [$action];
        return $this->collection->analyze($parameters['domain'] ?? '', $modules, 'probe');
    }
}

final class Application
{
    public static function collection(Config $config, ?array $allowedDomains): CollectionService
    {
        $resolver = new SystemResolver();
        $policy = new NetworkPolicy($resolver, $allowedDomains);
        return new CollectionService($policy, $resolver, new CurlHttpClient($policy, $config));
    }

    public static function serve(): void
    {
        ini_set('display_errors', '0');
        $view = new JsonView();
        try {
            if (PHP_VERSION_ID < 80100) {
                throw new AppException('PHP 8.1 or newer is required.', 503, 'configuration_error');
            }
            $paths = ConfigurationPaths::discover(__DIR__, (string) ($_SERVER['DOCUMENT_ROOT'] ?? ''));
            $config = Config::fromEnvironment($paths->envFile());
            $controller = new ProbeController($config, self::collection($config, $config->allowedDomains),
                new FileRateLimiter($config->rateDirectory, $config->rateLimit));
            $body = file_get_contents('php://input', false, null, 0, 16385);
            $result = $controller->handle(new ProbeRequest($_SERVER, $_GET, $body === false ? '' : $body));
            $view->send($result);
        } catch (AppException $error) {
            $view->send(['error' => ['code' => $error->errorCode, 'message' => $error->getMessage()]], $error->status);
        } catch (Throwable $error) {
            error_log('w3bmap: ' . get_class($error));
            $view->send(['error' => ['code' => 'internal_error', 'message' => 'An internal connector error occurred.']], 500);
        }
    }
}

if (PHP_SAPI !== 'cli' && realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) {
    Application::serve();
}
