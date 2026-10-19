<?php

declare(strict_types=1);

namespace W3bmap\CrawlTests;

use W3bmap\{AppException, CrawlOptions, CollectionService, NetworkPolicy, RecursiveCollectionService, HttpClient, HttpResponse, Resolver};
use W3bmap\Cli\Options;

require_once dirname(__DIR__) . '/cli/w3bmap.php';

final class CrawlResolver implements Resolver
{
    public array $lookups = [];
    public function addresses(string $host): array { return $host === 'private.example.com' ? ['127.0.0.1'] : ['1.1.1.1']; }
    public function records(string $host): array { $this->lookups[] = $host; return [['type' => 'A', 'ip' => '1.1.1.1']]; }
}

final class CrawlHttp implements HttpClient
{
    public array $requested = [];
    public bool $timeout = false;
    public function __construct(private NetworkPolicy $policy) {}
    public function get(string $url, bool $service = false): HttpResponse
    {
        $this->policy->destination($url, $service);
        $this->requested[] = $url;
        if ($this->timeout) throw new AppException('Fixture timeout.', 504, 'timeout');
        $path = (string) parse_url($url, PHP_URL_PATH);
        if ($path === '/redirect') {
            $this->policy->destination('https://outside.example.net/end');
            return new HttpResponse('https://outside.example.net/end', 200, [], '<a href="/child">Child</a>');
        }
        if ($path === '/binary') return new HttpResponse($url, 200, ['content-type' => ['application/pdf']], 'binary');
        if ($path === '/broken') throw new AppException('Fixture upstream failure.', 502, 'upstream_error');
        if ($service) return new HttpResponse($url, 200, [], '{"objectClassName":"domain","ldhName":"example.com"}');
        if ($path === '/robots.txt') return new HttpResponse($url, 200, [], 'User-agent: *');
        if ($path === '/sitemap.xml') return new HttpResponse($url, 200, [], '<urlset><url><loc>https://example.com/site-map-page</loc></url></urlset>');
        $links = match ($path) {
            '/' => ['/about?token=omit#section', '/about', '/docs/start', 'https://sub.example.com/', 'https://outside.example.net/', '/binary', '/file.pdf'],
            '/about' => ['/', '/deep', '/broken'],
            '/docs/start' => ['/docs/end', '/about'],
            '/deep' => ['/deeper'],
            default => [],
        };
        $signature = parse_url($url, PHP_URL_HOST) === 'outside.example.net' ? '/_nuxt/app.js'
            : ($path === '/about' ? '/_next/static/app.js' : '/wp-content/app.js');
        $body = '<html><script src="' . $signature . '"></script>';
        foreach ($links as $link) $body .= '<a href="' . htmlspecialchars($link) . '">Link</a>';
        return new HttpResponse($url, 200, ['content-type' => ['text/html'], 'server' => ['nginx']], $body . '</html>');
    }
}

final class CrawlTests
{
    private int $assertions = 0;
    private function check(bool $condition, string $message): void { $this->assertions++; if (!$condition) throw new \RuntimeException($message); }
    private function rejects(callable $operation): void
    {
        try { $operation(); } catch (AppException $error) { $this->assertions++; return; }
        throw new \RuntimeException('Expected crawl rejection.');
    }
    public function collect(array $values, bool $timeout = false): array
    {
        $options = new CrawlOptions(['url' => 'https://example.com/'] + $values);
        $resolver = new CrawlResolver();
        $policy = new NetworkPolicy($resolver, $options);
        $http = new CrawlHttp($policy);
        $http->timeout = $timeout;
        $result = (new RecursiveCollectionService($policy, $http, new CollectionService($policy, $resolver, $http)))->analyze($options, ['dns', 'headers', 'technologies', 'links'], 'cli');
        return [$result, $http, $resolver];
    }
    public function run(): void
    {
        foreach ([['url' => 'file:///secret'], ['url' => 'http://localhost/'], ['url' => 'https://user:pass@example.com/'],
            ['url' => 'https://example.com:8080/'], ['depth' => 6], ['max_pages' => 0], ['max_hosts' => 11], ['scope' => []],
            ['include' => 'bad'], ['seeds' => ['http://127.0.0.1/']]] as $invalid)
            $this->rejects(fn () => new CrawlOptions(array_merge(['url' => 'https://example.com/'], $invalid)));
        $this->check(CrawlOptions::normalize('https://EXAMPLE.com/a/../about?private=value#fragment') === 'https://example.com/about', 'URL normalization failed.');
        [$graph, $http, $resolver] = $this->collect(['depth' => 1]);
        $crawl = ((array) $graph['results'])['crawl'];
        $urls = array_column($crawl['pages'], 'requested_url');
        $this->check(count(array_filter($urls, fn ($url) => $url === 'https://example.com/about')) === 1, 'Duplicate URL was visited.');
        $this->check(!in_array('https://example.com/deep', $urls, true), 'Depth limit was ignored.');
        $this->check(!in_array('https://outside.example.net/', $urls, true), 'Host scope was ignored.');
        $this->check(!in_array('https://example.com/file.pdf', $http->requested, true), 'An attachment was fetched.');
        $this->check($resolver->lookups === ['example.com'], 'Host metadata was repeated per page.');
        $this->check($crawl['pages'][1]['technologies'] !== [], 'Page technology evidence is missing.');
        $rootTechnologies = array_column($crawl['pages'][0]['technologies'], 'id');
        $aboutTechnologies = array_column($crawl['pages'][1]['technologies'], 'id');
        $this->check(in_array('wordpress', $rootTechnologies, true) && !in_array('nextjs', $rootTechnologies, true), 'Start-page technologies are incorrect.');
        $this->check(in_array('nextjs', $aboutTechnologies, true) && !in_array('wordpress', $aboutTechnologies, true), 'Recursive page reused the start-page technologies.');
        $this->check(count(array_filter($graph['edges'], fn ($edge) => $edge['source'] === 'page:https://example.com/about' && $edge['target'] === 'technology:nextjs' && $edge['evidence']['url'] === 'https://example.com/about')) === 1, 'Recursive technology evidence is not linked to its actual page.');
        $this->check(count(array_filter($graph['edges'], fn ($edge) => $edge['source'] === 'page:https://example.com/about' && $edge['type'] === 'uses')) > 0, 'Page-to-technology relationship is missing.');
        $about = array_values(array_filter($graph['nodes'], fn ($node) => $node['id'] === 'page:https://example.com/about'))[0];
        $this->check($about['evidence']['visited'] === true, 'Visited page was left as an unvisited reference.');
        [$zero] = $this->collect(['depth' => 0]);
        $this->check(((array) $zero['results'])['crawl']['visited_pages'] === 1, 'Depth zero must visit only the start page.');
        [$deep, $deepHttp] = $this->collect(['depth' => 3]);
        $deepPages = ((array) $deep['results'])['crawl']['pages'];
        $this->check(array_values(array_filter($deepPages, fn ($page) => $page['url'] === 'https://example.com/deeper'))[0]['depth'] === 3, 'Multi-level traversal depth is incorrect.');
        $this->check(count(array_filter($deepHttp->requested, fn ($url) => $url === 'https://example.com/')) === 1, 'A cycle fetched the start URL twice.');
        [$limited] = $this->collect(['depth' => 5, 'max_pages' => 2]);
        $this->check(((array) $limited['results'])['crawl']['stop_reason'] === 'page_limit' && $limited['status'] === 'partial', 'Page limit was not reported.');
        [$sub] = $this->collect(['scope' => 'subdomains']);
        $this->check(isset(((array) $sub['results'])['crawl']['hosts']-> {'sub.example.com'}), 'Subdomain scope did not visit the subdomain.');
        [$all] = $this->collect(['scope' => 'all', 'max_hosts' => 3]);
        $this->check(((array) $all['results'])['crawl']['visited_hosts'] === 3, 'All-public scope did not visit external hosts.');
        $externalPage = array_values(array_filter(((array) $all['results'])['crawl']['pages'], fn ($page) => $page['url'] === 'https://outside.example.net/'))[0];
        $this->check(in_array('nuxt', array_column($externalPage['technologies'], 'id'), true), 'An external site was not independently fingerprinted.');
        $this->check(count(array_filter($all['edges'], fn ($edge) => $edge['source'] === 'page:https://outside.example.net/' && $edge['target'] === 'technology:nuxt')) === 1, 'External page-to-technology relationship is missing.');
        [$filter] = $this->collect(['depth' => 3, 'include' => ['https://example.com/docs/*'], 'exclude' => ['*/end']]);
        $filtered = array_column(((array) $filter['results'])['crawl']['pages'], 'requested_url');
        $this->check($filtered === ['https://example.com/', 'https://example.com/docs/start'], 'Include/exclude URL filters failed.');
        [$seeds] = $this->collect(['depth' => 1, 'seeds' => ['https://example.com/deep']]);
        $this->check(array_column(((array) $seeds['results'])['crawl']['pages'], 'requested_url') === ['https://example.com/', 'https://example.com/deep'], 'Explicit first-hop URLs were ignored.');
        [$timed] = $this->collect(['depth' => 5], true);
        $this->check(((array) $timed['results'])['crawl']['stop_reason'] === 'time_limit', 'Timeout did not stop the crawl.');
        $redirect = new CrawlOptions(['url' => 'https://example.com/redirect']);
        $policy = new NetworkPolicy(new CrawlResolver(), $redirect);
        $this->rejects(fn () => (new CrawlHttp($policy))->get($redirect->startUrl));
        $this->rejects(fn () => (new NetworkPolicy(new CrawlResolver(), new CrawlOptions(['url' => 'https://example.com/', 'scope' => 'all'])))->destination('https://private.example.com/'));
        [$private, $privateHttp] = $this->collect(['scope' => 'all', 'seeds' => ['https://private.example.com/']]);
        $this->check(!in_array('https://private.example.com/', $privateHttp->requested, true) && $private['status'] === 'partial', 'A private-network page was requested.');
        [$hostLimited] = $this->collect(['scope' => 'all', 'max_hosts' => 1]);
        $this->check(((array) $hostLimited['results'])['crawl']['visited_hosts'] === 1 && ((array) $hostLimited['results'])['crawl']['stop_reason'] === 'host_limit', 'Host limit was ignored.');
        $cli = Options::parse(['w3bmap', '--url', 'https://example.com/docs/', '--depth', '2', '--scope', 'host', '--include', 'https://example.com/docs/*']);
        $this->check($cli->action === 'crawl' && $cli->crawl->depth === 2, 'CLI recursion options were ignored.');
        $this->rejects(fn () => Options::parse(['w3bmap', '--domain', 'example.com', '--depth', '-1']));
        $ids = array_fill_keys(array_column($graph['nodes'], 'id'), true);
        foreach ($graph['edges'] as $edge) $this->check(isset($ids[$edge['source']], $ids[$edge['target']]), 'Recursive graph contains a dangling edge.');
        echo 'PASS: ' . $this->assertions . " recursive collection assertions. No external requests were made.\n";
    }
}

if (realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) {
    try { (new CrawlTests())->run(); } catch (\Throwable $error) { fwrite(STDERR, 'FAIL: ' . $error->getMessage() . "\n"); exit(1); }
}
