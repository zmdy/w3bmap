<?php

declare(strict_types=1);

namespace W3bmap\Tests;

use W3bmap\AppException;
use W3bmap\Config;
use W3bmap\ConfigurationPaths;
use W3bmap\EnvironmentFile;
use W3bmap\Installer\InstallationAccess;
use W3bmap\Installer\InstallationService;
use W3bmap\Installer\InstallationSettings;

require_once dirname(__DIR__) . '/probe/install.php';

final class InstallationTests
{
    private int $assertions = 0;

    private function check(bool $condition, string $message): void
    {
        $this->assertions++;
        if (!$condition) {
            throw new \RuntimeException($message);
        }
    }

    private function rejects(callable $action, int $status): void
    {
        try {
            $action();
        } catch (AppException $error) {
            $this->check($error->status === $status, 'Unexpected rejection status.');
            return;
        }
        throw new \RuntimeException('Expected rejection was missing.');
    }

    private function remove(string $directory): void
    {
        foreach (new \FilesystemIterator($directory) as $entry) {
            if ($entry->isDir() && !$entry->isLink()) {
                $this->remove($entry->getPathname());
            } else {
                unlink($entry->getPathname());
            }
        }
        rmdir($directory);
    }

    public function run(): void
    {
        $root = sys_get_temp_dir() . '/w3bmap-install-test-' . bin2hex(random_bytes(8));
        mkdir($root . '/public/probe', 0700, true);
        $original = getenv('W3BMAP_API_KEY');
        try {
            $paths = ConfigurationPaths::discover($root . '/public/probe', $root . '/public/probe');
            $this->check(!ConfigurationPaths::contains($root . '/public', $paths->directory), 'Private configuration is public.');
            $this->check($paths->directory === ConfigurationPaths::discover($root . '/public/probe', $root . '/public')->directory, 'Different server roots changed the private path.');
            $this->check($paths->directory === ConfigurationPaths::discover($root . '/public/probe')->directory, 'Missing document root changed the private path.');
            $this->rejects(fn () => new ConfigurationPaths($root . '/public/secrets', $root . '/public'), 503);
            $service = new InstallationService($paths);
            $this->check(!$service->installed(), 'A new installation was locked.');
            $code = $service->setupCode();
            $this->check(strlen($code) === 64 && $service->setupCode() === $code, 'Setup code must persist until installation.');
            $settings = new InstallationSettings();
            $this->rejects(fn () => $settings->values(['timeout' => 31], $paths), 400);
            $access = new InstallationAccess();
            $local = ['REMOTE_ADDR' => '127.0.0.1', 'HTTP_HOST' => 'localhost:8080'];
            $remote = ['REMOTE_ADDR' => '203.0.113.4', 'HTTP_HOST' => 'probe.example.com', 'HTTPS' => 'on'];
            $this->check($access->local($local), 'Loopback installation was rejected.');
            $this->check(!$access->local(['REMOTE_ADDR' => '127.0.0.1', 'HTTP_HOST' => 'attacker.example']), 'A rebinding Host was trusted.');
            $this->check($access->connectorUrl($local + ['SCRIPT_NAME' => '/probe/install.php']) === 'http://localhost:8080/probe/w3bmap.php', 'Connector URL construction failed.');
            $this->rejects(fn () => $access->authorize($local, ['csrf' => 'wrong'], 'token', $service), 403);
            $access->authorize($local, ['csrf' => 'token'], 'token', $service);
            $this->rejects(fn () => $access->authorize($remote, ['csrf' => 'token'], 'token', $service), 403);
            $this->rejects(fn () => $access->authorize(array_replace($remote, ['HTTPS' => 'off', 'HTTP_X_FORWARDED_PROTO' => 'https']), ['csrf' => 'token', 'setup_code' => $code], 'token', $service), 403);
            $access->authorize($remote, ['csrf' => 'token', 'setup_code' => $code], 'token', $service);
            $values = $service->install(['local_http' => '1']);
            $this->check($service->installed(), 'Installation did not publish .env.');
            $this->check(!file_exists($paths->directory . '/setup-token'), 'Setup code survived installation.');
            $this->check(strlen($values['W3BMAP_API_KEY']) === 64 && ctype_xdigit($values['W3BMAP_API_KEY']), 'Generated key is invalid.');
            $this->check(!array_key_exists('W3BMAP_ALLOWED_DOMAINS', $values), 'Installer wrote a retired domain setting.');
            putenv('W3BMAP_API_KEY=' . str_repeat('x', 64));
            $config = Config::fromEnvironment($paths->envFile());
            $this->check($config->apiKey === $values['W3BMAP_API_KEY'] && $config->allowLocalHttp && $config->rateLimit === 30, '.env was not loaded or lost precedence.');
            $before = file_get_contents($paths->envFile());
            $this->rejects(fn () => $service->install([]), 409);
            $this->check(file_get_contents($paths->envFile()) === $before, 'Second installation changed credentials.');
            $file = new EnvironmentFile();
            $this->check($file->parse("\xEF\xBB\xBF# comment\r\nW3BMAP_API_KEY='" . str_repeat('a', 32) . "'\r\nW3BMAP_ALLOWED_DOMAINS=\r\n")['W3BMAP_ALLOWED_DOMAINS'] === '', 'Legacy configuration parsing failed.');
            $legacy = $file->parse($before . "W3BMAP_ALLOWED_DOMAINS=example.com\n");
            file_put_contents($paths->envFile(), $file->encode($legacy));
            $this->check(Config::fromEnvironment($paths->envFile())->apiKey === $values['W3BMAP_API_KEY'], 'Legacy .env did not load.');
            foreach (['', $before . "UNKNOWN=value\n", $before . "W3BMAP_TIMEOUT=1\n", str_replace('"30"', '"bad', $before)] as $invalid) {
                $this->rejects(fn () => $file->parse($invalid), 503);
            }
            file_put_contents($paths->envFile(), 'invalid');
            $this->rejects(fn () => Config::fromEnvironment($paths->envFile()), 503);
            file_put_contents($paths->envFile(), $file->encode(array_replace($values, ['W3BMAP_TIMEOUT' => '31'])));
            $this->rejects(fn () => Config::fromEnvironment($paths->envFile()), 503);
            file_put_contents($paths->envFile(), str_repeat('x', 16385));
            $this->rejects(fn () => $file->read($paths->envFile()), 503);
            echo 'PASS: ' . $this->assertions . " installer/configuration assertions.\n";
        } finally {
            putenv($original === false ? 'W3BMAP_API_KEY' : 'W3BMAP_API_KEY=' . $original);
            $this->remove($root);
        }
    }
}

try {
    (new InstallationTests())->run();
} catch (\Throwable $error) {
    fwrite(STDERR, 'FAIL: ' . $error->getMessage() . "\n");
    exit(1);
}
