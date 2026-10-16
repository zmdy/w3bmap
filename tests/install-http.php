<?php

declare(strict_types=1);

namespace W3bmap\Tests;

use W3bmap\ConfigurationPaths;

require_once dirname(__DIR__) . '/probe/w3bmap.php';

final class InstallationHttpTests
{
    private int $assertions = 0;
    private \CurlHandle $client;

    private function check(bool $condition, string $message): void
    {
        $this->assertions++;
        if (!$condition) {
            throw new \RuntimeException($message);
        }
    }

    private function request(string $url, ?array $form = null, ?string $key = null): array
    {
        curl_setopt_array($this->client, [CURLOPT_URL => $url, CURLOPT_POST => $form !== null,
            CURLOPT_HTTPHEADER => $key === null ? [] : ['Authorization: Bearer ' . $key]]);
        if ($form !== null) {
            curl_setopt($this->client, CURLOPT_POSTFIELDS, http_build_query($form));
        }
        $body = curl_exec($this->client);
        return [(int) curl_getinfo($this->client, CURLINFO_RESPONSE_CODE), $body];
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
        $root = sys_get_temp_dir() . '/w3bmap-http-test-' . bin2hex(random_bytes(8));
        mkdir($root . '/public', 0700, true);
        foreach (['install.php', 'w3bmap.php'] as $file) {
            copy(dirname(__DIR__) . '/probe/' . $file, $root . '/public/' . $file);
        }
        $socket = stream_socket_server('tcp://127.0.0.1:0', $number, $message);
        if ($socket === false) {
            throw new \RuntimeException('Cannot reserve a test port.');
        }
        $address = stream_socket_get_name($socket, false);
        fclose($socket);
        $process = proc_open([PHP_BINARY, '-S', $address, '-t', $root . '/public'],
            [0 => ['pipe', 'r'], 1 => ['file', $root . '/server.log', 'a'], 2 => ['file', $root . '/server.log', 'a']], $pipes,
            $root, null, ['bypass_shell' => true]);
        if (!is_resource($process)) {
            throw new \RuntimeException('Cannot start the isolated test server.');
        }
        fclose($pipes[0]);
        $this->client = curl_init();
        curl_setopt_array($this->client, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 5,
            CURLOPT_COOKIEFILE => '', CURLOPT_PROXY => '']);
        try {
            $base = 'http://' . $address;
            for ($attempt = 0; $attempt < 50; $attempt++) {
                [$status, $html] = $this->request($base . '/install.php');
                if ($status !== 0) {
                    break;
                }
                usleep(100000);
            }
            $this->check($status === 200 && str_contains($html, 'Authorized domains'), 'Installer form was not served.');
            preg_match('/name="csrf" value="([a-f0-9]{64})"/', $html, $match);
            $csrf = $match[1] ?? '';
            $this->check(strlen($csrf) === 64, 'CSRF field is missing.');
            [$status] = $this->request($base . '/install.php', ['domains' => 'example.com']);
            $this->check($status === 403, 'HTTP installation accepted a missing CSRF token.');
            [$status] = $this->request($base . '/install.php', ['csrf' => $csrf, 'domains' => '*']);
            $this->check($status === 400, 'HTTP installation accepted an unrestricted target.');
            [$status, $html] = $this->request($base . '/install.php', ['csrf' => $csrf, 'domains' => 'example.com', 'local_http' => '1']);
            $this->check($status === 200 && str_contains($html, 'Installation complete'), 'HTTP installation failed.');
            preg_match('/id="api-key" readonly autocomplete="off" value="([a-f0-9]{64})"/', $html, $match);
            $key = $match[1] ?? '';
            $this->check(strlen($key) === 64, 'The generated API key was not displayed once.');
            $this->check(str_contains($html, $base . '/w3bmap.php'), 'The extension endpoint must be an absolute URL.');
            $paths = ConfigurationPaths::discover($root . '/public', $root . '/public');
            $this->check(is_file($paths->envFile()) && !ConfigurationPaths::contains($root . '/public', $paths->envFile()), 'The HTTP installer did not save a private .env.');
            [$status] = $this->request($base . '/.env');
            $this->check($status === 404, 'The .env file is publicly accessible.');
            [$status] = $this->request($base . '/w3bmap.php?action=capabilities');
            $this->check($status === 401, 'The installed API allowed anonymous access.');
            [$status, $json] = $this->request($base . '/w3bmap.php?action=capabilities', null, $key);
            $this->check($status === 200 && is_array(json_decode($json, true)), 'The API did not accept its generated .env key.');
            $content = file_get_contents($paths->envFile());
            file_put_contents($paths->envFile(), str_replace('W3BMAP_RATE_LIMIT="30"', 'W3BMAP_RATE_LIMIT="31"', $content));
            [$status, $json] = $this->request($base . '/w3bmap.php?action=capabilities', null, $key);
            $this->check($status === 200 && json_decode($json, true)['limits']['requests_per_minute'] === 31, 'Editing .env required a server restart.');
            [$status, $html] = $this->request($base . '/install.php');
            $this->check($status === 200 && str_contains($html, 'Installation locked') && !str_contains($html, $key), 'Refresh revealed the API key or unlocked setup.');
            [$status] = $this->request($base . '/install.php', ['csrf' => $csrf, 'domains' => 'other.example']);
            $this->check($status === 409, 'Repeated HTTP installation was not locked.');
            file_put_contents($paths->envFile(), 'invalid');
            [$status] = $this->request($base . '/w3bmap.php?action=capabilities', null, $key);
            $this->check($status === 503, 'Malformed .env did not fail closed.');
            echo 'PASS: ' . $this->assertions . " installer HTTP assertions.\n";
        } finally {
            curl_close($this->client);
            proc_terminate($process);
            proc_close($process);
            $this->remove($root);
        }
    }
}

try {
    (new InstallationHttpTests())->run();
} catch (\Throwable $error) {
    fwrite(STDERR, 'FAIL: ' . $error->getMessage() . "\n");
    exit(1);
}
