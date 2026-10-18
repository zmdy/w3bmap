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

    public function get(string $url, bool $service = false): HttpResponse
    {
        if ($this->fail) {
            throw new AppException('Fixture upstream failure.', 502, 'upstream_error');
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

    private function collectionAndGraph(): void
    {
        $resolver = new FixtureResolver();
        $http = new FixtureHttpClient();
        $service = new CollectionService(new NetworkPolicy($resolver), $resolver, $http);
        $result = $service->analyze('example.com', ['dns', 'headers', 'technologies', 'links', 'sitemap', 'robots', 'rdap'], 'cli');
        $this->check($result['status'] === 'complete', 'Fixture collection failed.');
        $data = json_decode((new JsonView())->encode($result), true, 128, JSON_THROW_ON_ERROR);
        $this->check(count($data['results']['links']['links']) === 2, 'Unsafe links were not filtered.');
        $this->check($data['results']['links']['links'][0]['url'] === 'https://example.com/about', 'HTML base resolution failed.');
        $this->check($data['results']['sitemap']['urls'] === ['https://example.com/about'], 'Namespaced sitemap parsing failed.');
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
