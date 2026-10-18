<?php

declare(strict_types=1);

namespace W3bmap\Cli;

use W3bmap\AppException;
use W3bmap\Application;
use W3bmap\Config;
use W3bmap\Domain;
use W3bmap\JsonView;

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/probe/w3bmap.php';

final class Options
{
    public string $domain = '';
    public array $modules = ['dns', 'headers', 'ssl', 'technologies'];
    public string $endpoint = '';
    public string $output = '';
    public string $action = 'analyze';
    public bool $help = false;

    public static function parse(array $arguments): self
    {
        $options = new self();
        for ($index = 1; $index < count($arguments); $index++) {
            $argument = $arguments[$index];
            if (in_array($argument, ['--help', '-h'], true)) {
                $options->help = true;
                continue;
            }
            if (!in_array($argument, ['--domain', '--modules', '--endpoint', '--output', '--action'], true)) {
                throw new AppException('Unknown argument: ' . $argument . '. Use --help for usage.');
            }
            $value = $arguments[++$index] ?? '';
            if ($value === '' || str_starts_with($value, '--')) {
                throw new AppException('A value is required after ' . $argument . '.');
            }
            switch ($argument) {
                case '--domain': $options->domain = $value; break;
                case '--modules': $options->modules = array_map('trim', explode(',', $value)); break;
                case '--endpoint': $options->endpoint = $value; break;
                case '--output': $options->output = $value; break;
                case '--action': $options->action = $value; break;
            }
        }
        if ($options->help) {
            return $options;
        }
        if (!in_array($options->action, ['analyze', 'capabilities', 'environment'], true)) {
            throw new AppException('The action must be analyze, capabilities, or environment.');
        }
        if ($options->action === 'analyze') {
            $options->domain = Domain::normalize($options->domain);
        }
        if ($options->action === 'environment' && $options->endpoint === '') {
            throw new AppException('Environment diagnostics require a connector endpoint.');
        }
        if ($options->modules === [] || count($options->modules) > 8
            || array_diff($options->modules, ['dns', 'rdap', 'headers', 'ssl', 'technologies', 'robots', 'sitemap', 'links']) !== []) {
            throw new AppException('Unsupported module list. Use --help for available modules.');
        }
        return $options;
    }
}

final class ConnectorClient
{
    public function __construct(private Config $config)
    {
    }

    public function query(Options $options): array
    {
        if (!extension_loaded('curl')) {
            throw new AppException('Connected mode requires the PHP cURL extension.');
        }
        $parts = parse_url($options->endpoint);
        if (!is_array($parts) || !isset($parts['scheme'], $parts['host']) || isset($parts['user'])
            || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])
            || preg_match('/[\x00-\x20\x7f\\\\]/', $options->endpoint)) {
            throw new AppException('Provide a connector URL without credentials, query parameters, or fragments.');
        }
        $local = in_array(strtolower($parts['host']), ['localhost', '127.0.0.1', '[::1]'], true);
        if ($parts['scheme'] !== 'https' && !($parts['scheme'] === 'http' && $local && $this->config->allowLocalHttp)) {
            throw new AppException('Connector URLs require HTTPS. Explicitly enabled loopback HTTP is allowed for development.');
        }
        if (strlen($this->config->apiKey) < 32 || preg_match('/[\x00-\x20\x7f]/', $this->config->apiKey)) {
            throw new AppException('Set W3BMAP_API_KEY to the connector token (at least 32 characters).');
        }
        $url = $options->endpoint . '?action=' . rawurlencode($options->action);
        $headers = ['Authorization: Bearer ' . $this->config->apiKey, 'Accept: application/json'];
        $body = '';
        $oversize = false;
        $handle = curl_init($url);
        curl_setopt_array($handle, [
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_PROXY => '',
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_WRITEFUNCTION => function ($curl, string $chunk) use (&$body, &$oversize): int {
                if (strlen($body) + strlen($chunk) > 16777216) {
                    $oversize = true;
                    return 0;
                }
                $body .= $chunk;
                return strlen($chunk);
            },
        ]);
        if ($options->action === 'analyze') {
            $headers[] = 'Content-Type: application/json';
            curl_setopt_array($handle, [CURLOPT_POST => true, CURLOPT_HTTPHEADER => $headers,
                CURLOPT_POSTFIELDS => json_encode(['domain' => $options->domain, 'modules' => $options->modules], JSON_THROW_ON_ERROR)]);
        }
        $success = curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        $error = curl_errno($handle);
        curl_close($handle);
        if ($oversize) {
            throw new AppException('The connector response exceeded the 16 MiB limit.', 502, 'response_too_large');
        }
        if ($success === false) {
            throw new AppException('Connector request failed (cURL code ' . $error . ').', 502, 'connector_error');
        }
        if ($status < 200 || $status >= 300) {
            // Do not echo arbitrary server responses that might contain secrets.
            throw new AppException('The connector returned HTTP ' . $status . '.', 502, 'connector_error');
        }
        try {
            $data = json_decode($body, true, 128, JSON_THROW_ON_ERROR);
        } catch (\JsonException $error) {
            throw new AppException('The connector did not return valid JSON.', 502, 'connector_error');
        }
        if (!is_array($data) || ($data['tool'] ?? '') !== 'w3bm@p') {
            throw new AppException('The endpoint is not a compatible w3bm@p connector.', 502, 'connector_error');
        }
        if ($options->action === 'analyze') {
            if (($data['schema_version'] ?? '') !== '1.0' || !is_array($data['nodes'] ?? null)
                || !is_array($data['edges'] ?? null) || !in_array($data['status'] ?? '', ['complete', 'partial', 'failed'], true)) {
                throw new AppException('The connector returned an incompatible graph document.', 502, 'connector_error');
            }
            // Preserve an empty results object when decoding and re-encoding JSON.
            $data['results'] = (object) ($data['results'] ?? []);
        }
        return $data;
    }
}

final class ConsoleView
{
    public function help(): void
    {
        echo <<<'HELP'
w3bm@p CLI

Usage:
  w3bmap.sh --domain example.com [options]
  w3bmap.bat --domain example.com [options]
  php cli/w3bmap.php --domain example.com [options]

Options:
  --domain HOST       ASCII or punycode DNS hostname; no URL, port, or path
  --modules LIST      Comma-separated modules (default: dns,headers,ssl,technologies)
  --endpoint URL      Use your self-hosted PHP connector instead of local collection
  --action NAME       analyze (default), capabilities, or environment
  --output FILE       Write JSON to a new file; existing files are never overwritten
  --help, -h          Show help

Modules: dns, rdap, headers, ssl, technologies, robots, sitemap, links

Environment:
  W3BMAP_API_KEY           Bearer token for connected mode; never passed as an argument
  W3BMAP_ALLOW_LOCAL_HTTP  Set to 1 on both sides for loopback HTTP development
  W3BMAP_PHP_BIN           PHP executable path used by the SH and BAT launchers
  W3BMAP_TIMEOUT           Per-upstream-request timeout, 1–30 seconds (default: 10)
  W3BMAP_MAX_BYTES         Per-upstream-response limit (default: 1048576)

Requires PHP 8.1+. HTTP modules require cURL; other modules may require OpenSSL,
DOM, or SimpleXML. Standalone mode uses the same collectors as the connector.

Exit codes: 0 success; 1 request/configuration/output error; 2 invalid arguments;
            3 partial or failed collection (a graph is still written).

HELP;
    }

    public function write(array $data, string $output): void
    {
        $json = (new JsonView())->encode($data);
        if ($output === '') {
            fwrite(STDOUT, $json);
            return;
        }
        $file = @fopen($output, 'x');
        if ($file === false) {
            throw new AppException('Cannot create the output file. Ensure its parent exists and the file does not already exist.');
        }
        try {
            if (fwrite($file, $json) !== strlen($json)) {
                throw new AppException('Unable to write the complete output document.');
            }
        } finally {
            fclose($file);
        }
        fwrite(STDERR, 'Saved JSON to ' . $output . ".\n");
    }
}

final class CliController
{
    public function run(array $arguments): int
    {
        if (PHP_VERSION_ID < 80100) {
            fwrite(STDERR, "Error: PHP 8.1 or newer is required.\n");
            return 1;
        }
        $view = new ConsoleView();
        try {
            $options = Options::parse($arguments);
        } catch (AppException $error) {
            fwrite(STDERR, 'Error: ' . $error->getMessage() . "\n");
            return 2;
        }
        if ($options->help) {
            $view->help();
            return 0;
        }
        try {
            $config = Config::fromEnvironment();
            if ($options->endpoint !== '') {
                $result = (new ConnectorClient($config))->query($options);
            } else {
                $collection = Application::collection($config);
                $result = $options->action === 'capabilities'
                    ? ['tool' => 'w3bm@p', 'schema_version' => '1.0', 'source' => 'cli', 'modules' => $collection->available()]
                    : $collection->analyze($options->domain, $options->modules, 'cli');
            }
            $view->write($result, $options->output);
            return isset($result['status']) && $result['status'] !== 'complete' ? 3 : 0;
        } catch (AppException $error) {
            fwrite(STDERR, 'Error: ' . $error->getMessage() . "\n");
            return 1;
        } catch (\Throwable $error) {
            fwrite(STDERR, "Error: An internal CLI error occurred.\n");
            return 1;
        }
    }
}

if (realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) {
    exit((new CliController())->run($argv));
}
