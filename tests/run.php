<?php

declare(strict_types=1);

namespace W3bmap\Tests;

use W3bmap\AppException;
use W3bmap\CollectionService;
use W3bmap\Config;
use W3bmap\Domain;
use W3bmap\FileRateLimiter;
use W3bmap\GraphDocument;
use W3bmap\HttpClient;
use W3bmap\HttpResponse;
use W3bmap\JsonView;
use W3bmap\NetworkPolicy;
use W3bmap\ProbeController;
use W3bmap\ProbeRequest;
use W3bmap\ResourceType;
use W3bmap\StatusCollector;
use W3bmap\Resolver;
use W3bmap\Url;
use W3bmap\WebCollector;
use W3bmap\Cli\ConnectorClient;
use W3bmap\Cli\Options;

require_once dirname(__DIR__) . '/cli/w3bmap.php';

final class FixtureResolver implements Resolver
{
    public array $ips = ['93.184.215.14'];

    public function addresses(string $host): array
    {
        return $this->ips;
    }

    public function records(string $host): array
    {
        return [
            ['host' => $host, 'type' => 'A', 'ip' => $this->ips[0], 'ttl' => 300],
            ['host' => $host, 'type' => 'MX', 'target' => 'mail.example.com', 'pri' => 10, 'ttl' => 300],
            ['host' => $host, 'type' => 'MX', 'target' => '.', 'pri' => 0, 'ttl' => 300],
        ];
    }
}

final class FixtureHttpClient implements HttpClient
{
    public string $sitemap = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/about</loc></url></urlset>';
    public bool $fail = false;
    /** Status answers keyed by URL, for the HTTP status module. */
    public array $statuses = [];
    public array $requested = [];

    public function get(string $url, bool $service = false): HttpResponse
    {
        if ($this->fail) {
            throw new AppException('Fixture upstream failure.', 502, 'upstream_error');
        }
        $this->requested[] = $url;
        if (isset($this->statuses[$url])) {
            $status = $this->statuses[$url];
            if ($status === 0) {
                throw new AppException('Fixture connection failure.', 502, 'upstream_error');
            }
            return new HttpResponse($url, $status, $status === 301 ? ['location' => ['https://example.com/moved']] : [], '');
        }
        if ($service) {
            return new HttpResponse($url, 200, [], '{"objectClassName":"domain","ldhName":"EXAMPLE.COM"}');
        }
        if (str_ends_with($url, '/sitemap.xml')) {
            return new HttpResponse($url, 200, [], $this->sitemap);
        }
        if (str_ends_with($url, '/robots.txt')) {
            return new HttpResponse($url, 200, [], "User-agent: *\nDisallow: /admin\n");
        }
        return new HttpResponse($url, 200, ['server' => ['nginx/1.0']],
            '<html><head><base href="/docs/"></head><body><script src="/wp-content/app.js"></script>'
            . '<a href="../about#team">About</a><a href="https://external.example/path">External</a>'
            . '<a href="/files/report.pdf">Report</a><a href="/assets/theme.css">Stylesheet</a>'
            . '<a href="javascript:alert(1)">Invalid</a><a href="mailto:test@example.com">Mail</a>'
            . '<a href="https://user:password@example.com/">Credentials</a></body></html>');
    }
}

final class TestSuite
{
    private int $assertions = 0;
    private string $temporaryDirectory;

    private function check(bool $condition, string $message): void
    {
        $this->assertions++;
        if (!$condition) {
            throw new \RuntimeException($message);
        }
    }

    private function rejects(callable $operation, string $code): void
    {
        try {
            $operation();
        } catch (AppException $error) {
            $this->check($error->errorCode === $code, 'Unexpected rejection: ' . $error->errorCode);
            return;
        }
        throw new \RuntimeException('Expected rejection: ' . $code);
    }

    public function run(): void
    {
        $this->temporaryDirectory = sys_get_temp_dir() . '/w3bmap-tests-' . bin2hex(random_bytes(8));
        mkdir($this->temporaryDirectory, 0700);
        try {
            $this->domainsAndNetwork();
            $this->authenticationAndRequests();
            $this->collectionAndGraph();
            $this->rateLimitAndCli();
            echo 'Passed ' . $this->assertions . " assertions. No external network requests were made.\n";
        } finally {
            foreach (glob($this->temporaryDirectory . '/*') ?: [] as $file) {
                unlink($file);
            }
            rmdir($this->temporaryDirectory);
        }
    }

    private function domainsAndNetwork(): void
    {
        $this->check(Domain::normalize(' EXAMPLE.com. ') === 'example.com', 'Domain normalization failed.');
        foreach (['127.0.0.1', '[::1]', '2130706433', 'https://example.com', 'example.com:443', 'example.com/path',
            'localhost', '-bad.example', 'test..example', "example.com\nInjected: true"] as $invalid) {
            $this->rejects(fn () => Domain::normalize($invalid), 'invalid_request');
        }
        foreach (['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.100.100.200',
            '0.0.0.0', '192.0.2.1', '198.18.0.1', '224.0.0.1', '255.255.255.255', '::1', 'fe80::1', 'fc00::1',
            '::ffff:127.0.0.1', '64:ff9b::7f00:1', '2001:db8::1', '2002:7f00:1::1', '3fff::1'] as $address) {
            $this->check(!NetworkPolicy::isPublicIp($address), 'Unsafe address accepted: ' . $address);
        }
        foreach (['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111', '2001:4860:4860::8888'] as $address) {
            $this->check(NetworkPolicy::isPublicIp($address), 'Public address rejected: ' . $address);
        }
        $resolver = new FixtureResolver();
        $policy = new NetworkPolicy($resolver);
        foreach (['example.com', 'a.example.net', 'other.org'] as $host) {
            $this->check($policy->authorize($host) === $host, 'Public target required prior registration.');
        }
        $this->rejects(fn () => $policy->destination('file:///etc/passwd'), 'blocked_destination');
        $this->rejects(fn () => $policy->destination('https://user:password@example.com'), 'blocked_destination');
        $this->rejects(fn () => $policy->destination('https://example.com:8080/'), 'blocked_destination');
        $this->check($policy->destination('https://outside.example/')[0] === 'outside.example', 'Public destination was rejected.');
        $resolver->ips = ['93.184.215.14', '127.0.0.1'];
        $this->rejects(fn () => $policy->destination('https://example.com/'), 'blocked_destination');
        $resolver->ips = [];
        $this->rejects(fn () => $policy->resolvePublic('example.com'), 'dns_error');
        $this->check(Url::resolve('https://example.com/a/page', '../about#team') === 'https://example.com/about', 'Relative URL failed.');
        $this->check(Url::resolve('https://example.com/', 'javascript:alert(1)') === null, 'Unsafe URL scheme accepted.');
        $this->check(Url::resolve('https://example.com/', '//external.example/a') === 'https://external.example/a', 'Protocol-relative URL failed.');
    }

    private function authenticationAndRequests(): void
    {
        $key = str_repeat('a', 64);
        $config = new Config($key);
        $server = ['HTTPS' => 'on', 'HTTP_AUTHORIZATION' => 'Bearer ' . $key, 'REQUEST_METHOD' => 'GET', 'REMOTE_ADDR' => '127.0.0.1'];
        (new ProbeRequest($server, [], ''))->authorize($config);
        $this->check(true, 'Valid bearer token accepted.');
        $withoutAuthorization = $server;
        unset($withoutAuthorization['HTTP_AUTHORIZATION']);
        foreach (['Authorization', 'authorization', 'AUTHORIZATION'] as $name) {
            (new ProbeRequest($withoutAuthorization, [], '', [$name => 'Bearer ' . $key]))->authorize($config);
            $this->check(true, 'Apache header fallback rejected a valid token.');
        }
        (new ProbeRequest($withoutAuthorization + ['REDIRECT_HTTP_AUTHORIZATION' => 'Bearer ' . $key], [], ''))->authorize($config);
        $this->check(true, 'Redirected authorization header was rejected.');
        $this->rejects(fn () => (new ProbeRequest($withoutAuthorization, [], '', ['Authorization' => 'Bearer wrong']))->authorize($config), 'unauthorized');
        $this->rejects(fn () => (new ProbeRequest($withoutAuthorization, [], '', ['Authorization' => ['Bearer ' . $key]]))->authorize($config), 'unauthorized');
        $this->rejects(fn () => (new ProbeRequest(array_replace($server, ['HTTP_AUTHORIZATION' => 'Bearer wrong']), [], '', ['Authorization' => 'Bearer ' . $key]))->authorize($config), 'unauthorized');
        $this->rejects(fn () => (new ProbeRequest($withoutAuthorization, [], '', ['X-Authorization' => 'Bearer ' . $key]))->authorize($config), 'unauthorized');
        $this->rejects(fn () => (new ProbeRequest($server, [], ''))->authorize(new Config()), 'configuration_error');
        $badToken = array_merge($server, ['HTTP_AUTHORIZATION' => 'Bearer wrong']);
        $this->rejects(fn () => (new ProbeRequest($badToken, [], ''))->authorize($config), 'unauthorized');
        $http = array_merge($server, ['HTTPS' => 'off', 'HTTP_X_FORWARDED_PROTO' => 'https']);
        $this->rejects(fn () => (new ProbeRequest($http, [], ''))->authorize($config), 'https_required');
        $config->allowLocalHttp = true;
        (new ProbeRequest($http, [], ''))->authorize($config);
        $remoteHttp = array_merge($http, ['REMOTE_ADDR' => '192.168.1.2']);
        $this->rejects(fn () => (new ProbeRequest($remoteHttp, [], ''))->authorize($config), 'https_required');
        $this->rejects(fn () => (new ProbeRequest($server, ['action' => ['dns']], ''))->parameters(), 'invalid_request');
        $this->rejects(fn () => (new ProbeRequest($server, ['action' => 'analyze'], ''))->parameters(), 'method_not_allowed');
        $post = array_merge($server, ['REQUEST_METHOD' => 'POST', 'CONTENT_TYPE' => 'application/json']);
        foreach (['{', '[]', 'null', '{"action":123}', '{"modules":{"x":"dns"}}'] as $body) {
            $this->rejects(fn () => (new ProbeRequest($post, [], $body))->parameters(), 'invalid_request');
        }
        $this->rejects(fn () => (new ProbeRequest($post, [], str_repeat('x', 16385)))->parameters(), 'request_too_large');
        $this->rejects(fn () => (new ProbeRequest(array_merge($post, ['CONTENT_TYPE' => 'text/plain']), [], '{}'))->parameters(), 'unsupported_media_type');
        $parameters = (new ProbeRequest($post, ['action' => 'analyze'], '{"domain":"example.com","modules":["dns"]}'))->parameters();
        $this->check($parameters['modules'] === ['dns'], 'POST parameter parsing failed.');
        $resolver = new FixtureResolver();
        $collection = new CollectionService(new NetworkPolicy($resolver), $resolver, new FixtureHttpClient());
        $controller = new ProbeController($config, $collection, new FileRateLimiter($this->temporaryDirectory, 100));
        $capabilities = $controller->handle(new ProbeRequest($server, [], ''));
        $this->check(in_array('dns', $capabilities['modules'], true), 'Capabilities missing DNS.');
        $this->check(!str_contains((new JsonView())->encode($capabilities), $key), 'Capabilities leaked a token.');
        $this->rejects(fn () => $controller->handle(new ProbeRequest($server, ['action' => 'environment'], '')), 'module_disabled');
        $this->rejects(fn () => $controller->handle(new ProbeRequest($server, ['action' => 'unknown'], '')), 'invalid_request');
        $result = $controller->handle(new ProbeRequest($server, ['action' => 'dns', 'domain' => 'outside.example'], ''));
        $this->check($result['status'] === 'complete', 'Authenticated public domain query failed.');
    }

    private function httpStatusModule(): void
    {
        $this->check(StatusCollector::classify(404) === 'missing', '404 must be reported as missing.');
        $this->check(StatusCollector::classify(403) === 'forbidden', '403 must be reported as forbidden.');
        $this->check(StatusCollector::classify(503) === 'server_error', '5xx must be reported as a server error.');
        $this->check(StatusCollector::classify(301) === 'redirect', '3xx must be reported as a redirect.');
        $this->check(StatusCollector::classify(200) === 'ok', '2xx must be reported as ok.');
        $this->check(!StatusCollector::inScope('https://external.example/path', 'example.com'), 'Out-of-scope URLs must not be requested.');
        $this->check(StatusCollector::inScope('https://api.example.com/x', 'example.com'), 'Subdomains must stay in scope.');

        $resolver = new FixtureResolver();
        $http = new FixtureHttpClient();
        $http->statuses = [
            'https://example.com/about' => 404,
            'https://example.com/files/report.pdf' => 403,
            'https://example.com/assets/theme.css' => 0,
        ];
        $service = new CollectionService(new NetworkPolicy($resolver), $resolver, $http);
        // Status is requested first but must still run after the module that discovers URLs.
        $result = $service->analyze('example.com', ['status', 'links'], 'cli');
        $data = json_decode((new JsonView())->encode($result), true, 128, JSON_THROW_ON_ERROR);
        $checks = [];
        foreach ($data['results']['status']['checks'] as $check) {
            $checks[$check['url']] = $check;
        }
        $this->check($data['results']['status']['failing'] === 3, 'Failing pages were not counted.');
        $this->check($checks['https://example.com/about']['result'] === 'missing', 'A 404 page was not reported.');
        $this->check($checks['https://example.com/files/report.pdf']['result'] === 'forbidden', 'A 403 asset was not reported.');
        $this->check($checks['https://example.com/assets/theme.css']['result'] === 'unreachable', 'A failed request was not reported.');
        $this->check(!isset($checks['https://external.example/path']), 'An external URL must not be requested.');
        $types = array_column($data['nodes'], 'evidence', 'id');
        $this->check(($types['page:https://example.com/about']['http_status'] ?? null) === 404, 'The status must be kept as evidence.');
        $errors = array_filter($data['edges'], fn ($edge) => $edge['type'] === 'reports_error');
        $this->check(count($errors) === 3, 'Failing entities must be reachable through the graph.');
        foreach ($data['edges'] as $edge) {
            $this->check(in_array($edge['source'], array_column($data['nodes'], 'id'), true), 'Dangling error edge found.');
        }
        $empty = (new CollectionService(new NetworkPolicy($resolver), $resolver, new FixtureHttpClient()))
            ->analyze('example.com', ['status'], 'cli');
        $this->check($empty['errors'][0]['code'] === 'no_result', 'Status checks without discovered URLs must report no_result.');
    }

    private function collectionAndGraph(): void
    {
        $resolver = new FixtureResolver();
        $http = new FixtureHttpClient();
        $service = new CollectionService(new NetworkPolicy($resolver), $resolver, $http);
        $result = $service->analyze('example.com', ['dns', 'headers', 'technologies', 'links', 'sitemap', 'robots', 'rdap'], 'cli');
        $this->check($result['status'] === 'complete', 'Fixture collection failed.');
        $data = json_decode((new JsonView())->encode($result), true, 128, JSON_THROW_ON_ERROR);
        $this->check(count($data['results']['links']['links']) === 4, 'Unsafe links were not filtered.');
        $this->check($data['results']['links']['links'][0]['url'] === 'https://example.com/about', 'HTML base resolution failed.');
        $this->check($data['results']['sitemap']['urls'] === ['https://example.com/about'], 'Namespaced sitemap parsing failed.');
        $this->check($data['schema_version'] === '1.1', 'The collection must declare the current schema version.');
        $byId = array_column($data['nodes'], 'type', 'id');
        $this->check(($byId['asset:https://example.com/files/report.pdf'] ?? null) === 'asset', 'A linked download must be an asset.');
        $this->check(($byId['asset:https://example.com/assets/theme.css'] ?? null) === 'asset', 'A linked stylesheet must be an asset.');
        $this->check(($byId['page:https://example.com/about'] ?? null) === 'page', 'A linked document must stay a page.');
        $this->check(!isset($byId['page:https://example.com/files/report.pdf']), 'An asset must not also exist as a page.');
        $assetEdge = array_values(array_filter($data['edges'], fn ($edge) => $edge['target'] === 'asset:https://example.com/files/report.pdf'))[0];
        $this->check($assetEdge['type'] === 'references_resource', 'A linked asset must be a reference, not navigation.');
        $this->check(ResourceType::classify('https://example.com/shop/item.php') === 'page', 'A dynamic page must not be an asset.');
        $this->check(ResourceType::classify('https://example.com/app', 'script') === 'asset', 'The request kind must classify extensionless assets.');
        $this->check(ResourceType::classify('https://example.com/v1.2/guide') === 'page', 'A dotted path segment is not an extension.');
        $this->check(count($data['results']['technologies']['matches']) === 2, 'Technology detection failed.');
        $ids = array_column($data['nodes'], 'id');
        $this->check(count($ids) === count(array_unique($ids)), 'Duplicate nodes found.');
        $this->check(!in_array('domain:', $ids, true), 'A null MX must not create an empty domain node.');
        foreach ($data['edges'] as $edge) {
            $this->check(in_array($edge['source'], $ids, true) && in_array($edge['target'], $ids, true), 'Dangling graph edge found.');
        }
        $technologyEdge = array_values(array_filter($data['edges'], fn ($edge) => $edge['type'] === 'uses'))[0];
        $this->check($technologyEdge['verification'] === 'inferred', 'Fingerprint was incorrectly presented as proven.');
        $this->rejects(fn () => $service->analyze('example.com', ['invalid'], 'cli'), 'invalid_request');
        $this->rejects(fn () => $service->analyze('example.com', [], 'cli'), 'invalid_request');
        $http->sitemap = '<!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><urlset><url><loc>&xxe;</loc></url></urlset>';
        $result = $service->analyze('example.com', ['dns', 'sitemap'], 'probe');
        $this->check($result['status'] === 'partial' && $result['errors'][0]['code'] === 'parse_error', 'Unsafe XML was not rejected.');
        $http->sitemap = '<sitemapindex><sitemap><loc>https://example.com/child.xml</loc></sitemap></sitemapindex>';
        $result = $service->analyze('example.com', ['sitemap'], 'cli');
        $this->check($result['nodes'][1]['type'] === 'sitemap', 'Sitemap index was treated as a page.');
        $http->fail = true;
        $failed = $service->analyze('example.com', ['headers'], 'cli');
        $this->check($failed['status'] === 'failed', 'Complete collection failure was hidden.');
        $this->check(str_contains((new JsonView())->encode($failed), '"results": {}'), 'Empty results must serialize as an object.');
        $this->httpStatusModule();
    }

    private function rateLimitAndCli(): void
    {
        $limiter = new FileRateLimiter($this->temporaryDirectory, 1);
        $limiter->consume('rate-test');
        $this->rejects(fn () => $limiter->consume('rate-test'), 'rate_limited');
        $this->check(Options::parse(['cli', '--help'])->help, 'CLI help parsing failed.');
        $this->rejects(fn () => Options::parse(['cli', '--domain']), 'invalid_request');
        $this->rejects(fn () => Options::parse(['cli', '--domain', 'example.com', '--modules', 'dns,unknown']), 'invalid_request');
        $this->rejects(fn () => Options::parse(['cli', '--token', 'secret']), 'invalid_request');
        $options = Options::parse(['cli', '--domain', 'example.com', '--endpoint', 'http://remote.example/probe.php']);
        $this->rejects(fn () => (new ConnectorClient(new Config(str_repeat('a', 64))))->query($options), 'invalid_request');
    }
}

try {
    (new TestSuite())->run();
} catch (\Throwable $error) {
    fwrite(STDERR, 'FAIL: ' . $error->getMessage() . "\n");
    exit(1);
}
