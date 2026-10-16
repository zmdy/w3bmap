<?php

declare(strict_types=1);

namespace W3bmap\Installer;

use W3bmap\AppException;
use W3bmap\ConfigurationPaths;
use W3bmap\Domain;
use W3bmap\EnvironmentFile;

require_once __DIR__ . '/w3bmap.php';

final class InstallationSettings
{
    public function values(array $input, ConfigurationPaths $paths): array
    {
        $raw = $input['domains'] ?? '';
        if (!is_string($raw) || strlen($raw) > 8192) {
            throw new AppException('Provide an authorized domain list of at most 8192 characters.');
        }
        $domains = [];
        foreach (preg_split('/[\s,]+/', trim($raw), -1, PREG_SPLIT_NO_EMPTY) as $rule) {
            $wildcard = str_starts_with($rule, '*.');
            $domains[] = ($wildcard ? '*.' : '') . Domain::normalize($wildcard ? substr($rule, 2) : $rule);
        }
        if ($domains === []) {
            throw new AppException('Enter at least one domain you are authorized to analyze.');
        }
        return [
            'W3BMAP_API_KEY' => bin2hex(random_bytes(32)),
            'W3BMAP_ALLOWED_DOMAINS' => implode(',', array_unique($domains)),
            'W3BMAP_ALLOW_LOCAL_HTTP' => isset($input['local_http']) ? '1' : '0',
            'W3BMAP_ENABLE_ENVIRONMENT' => isset($input['environment']) ? '1' : '0',
            'W3BMAP_RATE_LIMIT' => $this->integer($input, 'rate_limit', 30, 1, 1000),
            'W3BMAP_TIMEOUT' => $this->integer($input, 'timeout', 10, 1, 30),
            'W3BMAP_MAX_BYTES' => $this->integer($input, 'max_bytes', 1048576, 1024, 5242880),
            'W3BMAP_RATE_DIRECTORY' => $paths->directory . '/rate',
        ];
    }

    private function integer(array $input, string $name, int $default, int $min, int $max): string
    {
        $value = filter_var($input[$name] ?? $default, FILTER_VALIDATE_INT);
        if ($value === false || $value < $min || $value > $max) {
            throw new AppException('Invalid ' . str_replace('_', ' ', $name) . '.');
        }
        return (string) $value;
    }
}

final class InstallationService
{
    public function __construct(public ConfigurationPaths $paths)
    {
    }

    public function installed(): bool
    {
        return file_exists($this->paths->envFile()) || is_link($this->paths->envFile());
    }

    public function setupCode(): string
    {
        $this->paths->ensureDirectory();
        $path = $this->paths->directory . '/setup-token';
        $handle = @fopen($path, 'x');
        if ($handle !== false) {
            try {
                if (PHP_OS_FAMILY !== 'Windows' && !chmod($path, 0600)) {
                    throw new AppException('Cannot restrict setup code permissions.', 503);
                }
                $code = bin2hex(random_bytes(32));
                if (fwrite($handle, $code) !== strlen($code)) {
                    throw new AppException('Cannot save the setup code.', 503);
                }
            } finally {
                fclose($handle);
            }
        }
        $code = is_link($path) ? false : @file_get_contents($path);
        if ($code === false || !preg_match('/^[a-f0-9]{64}$/D', $code)) {
            throw new AppException('The private setup code is unavailable. Check its file permissions.', 503);
        }
        return $code;
    }

    public function install(array $input): array
    {
        $values = (new InstallationSettings())->values($input, $this->paths);
        $content = (new EnvironmentFile())->encode($values);
        $this->paths->ensureDirectory();
        $lock = @fopen($this->paths->directory . '/.install.lock', 'c');
        if ($lock === false || !flock($lock, LOCK_EX)) {
            if (is_resource($lock)) {
                fclose($lock);
            }
            throw new AppException('Cannot acquire the installation lock.', 503);
        }
        $temporary = $this->paths->directory . '/.env-' . bin2hex(random_bytes(12));
        try {
            clearstatcache();
            if ($this->installed()) {
                throw new AppException('Installation is locked because the private .env already exists.', 409);
            }
            $handle = @fopen($temporary, 'x');
            if ($handle === false) {
                throw new AppException('Cannot create the private configuration file.', 503);
            }
            try {
                if (PHP_OS_FAMILY !== 'Windows' && !chmod($temporary, 0600)) {
                    throw new AppException('Cannot restrict configuration permissions.', 503);
                }
                if (fwrite($handle, $content) !== strlen($content) || !fflush($handle)) {
                    throw new AppException('Cannot save the complete configuration.', 503);
                }
            } finally {
                fclose($handle);
            }
            if (!@rename($temporary, $this->paths->envFile())) {
                throw new AppException('Cannot publish the private configuration.', 503);
            }
            @unlink($this->paths->directory . '/setup-token');
            return $values;
        } finally {
            if (is_file($temporary)) {
                @unlink($temporary);
            }
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }
}

final class InstallationAccess
{
    public function connectorUrl(array $server): string
    {
        $host = (string) ($server['HTTP_HOST'] ?? '');
        if (!preg_match('/^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::[0-9]{1,5})?$/Di', $host)) {
            throw new AppException('The request Host header is invalid.', 400);
        }
        return ($this->secure($server) ? 'https://' : 'http://') . $host
            . rtrim(dirname((string) ($server['SCRIPT_NAME'] ?? '/install.php')), '/\\') . '/w3bmap.php';
    }

    public function secure(array $server): bool
    {
        return in_array(strtolower((string) ($server['HTTPS'] ?? '')), ['on', '1'], true);
    }

    public function local(array $server): bool
    {
        $host = strtolower((string) ($server['HTTP_HOST'] ?? ''));
        return in_array($server['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)
            && preg_match('/^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/D', $host) === 1;
    }

    public function authorize(array $server, array $input, string $csrf, InstallationService $service): void
    {
        if (!$this->local($server) && !$this->secure($server)) {
            throw new AppException('Remote installation requires HTTPS.', 403);
        }
        if (!is_string($input['csrf'] ?? null) || !hash_equals($csrf, $input['csrf'])) {
            throw new AppException('The installation session expired. Reload the page and try again.', 403);
        }
        if (!$this->local($server) && (!is_string($input['setup_code'] ?? null)
            || !hash_equals($service->setupCode(), $input['setup_code']))) {
            throw new AppException('Read the setup code from the private setup-token file and try again.', 403);
        }
    }
}

final class InstallationView
{
    public function render(ConfigurationPaths $paths, string $csrf, bool $local, bool $http, string $message = '', ?array $result = null, bool $locked = false, string $endpoint = ''): void
    {
        $escape = static fn (string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        ?>
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>w3bm@p · Connector setup</title>
<style>body{font:16px/1.6 system-ui,sans-serif;background:#101722;color:#e8eef5;margin:0;padding:40px 20px}main{max-width:760px;margin:auto}h1{font-size:30px;margin-bottom:0}p{color:#b8c6d8}form,.panel{background:#192433;border:1px solid #35465a;border-radius:16px;padding:28px;margin:24px 0}label{display:block;margin:18px 0 6px}input:not([type=checkbox]),textarea{box-sizing:border-box;width:100%;background:#101722;color:#e8eef5;border:1px solid #52657b;border-radius:7px;padding:11px;font:inherit}textarea{min-height:90px}small{color:#b8c6d8}code{overflow-wrap:anywhere}button{margin-top:24px;background:#9fe7cb;color:#10251e;border:0;border-radius:8px;padding:13px 22px;font:600 16px system-ui;cursor:pointer}.notice{border-left:3px solid #9fe7cb;padding:12px 18px;background:#192433}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px}a{color:#9fe7cb}</style>
</head><body><main><small>DISCOVER · ANALYZE · CONNECT · VISUALIZE</small><h1>w3bm@p connector setup</h1>
<p>Generate your API key and save the PHP connector settings in a private .env file.</p>
<?php if ($message !== ''): ?><p class="notice" role="alert"><?= $escape($message) ?></p><?php endif; ?>
<?php if ($result !== null): ?>
<section class="panel"><h2>Installation complete</h2><p>Save this API key now. This page will not display it again.</p>
<label for="api-key">API key</label><input id="api-key" readonly autocomplete="off" value="<?= $escape($result['W3BMAP_API_KEY']) ?>">
<p>In the extension settings, enter the connector URL below and the API key above.</p>
<code><?= $escape($endpoint) ?></code>
<p>Authorized domains: <code><?= $escape($result['W3BMAP_ALLOWED_DOMAINS']) ?></code></p>
<p>The installer is now locked. You can remove install.php from your deployment.</p></section>
<?php elseif ($locked): ?><section class="panel"><h2>Installation locked</h2><p>A private .env already exists. Edit that file to change settings. The API key is never shown by this page again.</p></section>
<?php else: ?>
<form method="post" action=""><input type="hidden" name="csrf" value="<?= $escape($csrf) ?>">
<?php if (!$local): ?><p>Read the one-time setup code using your hosting file manager or SSH:<br><code><?= $escape($paths->directory . '/setup-token') ?></code></p><label for="setup-code">Setup code</label><input id="setup-code" name="setup_code" type="password" required autocomplete="off"><?php endif; ?>
<label for="domains">Authorized domains</label><textarea id="domains" name="domains" required maxlength="8192" placeholder="example.com, www.example.com"></textarea>
<small>Separate domains with commas or new lines. *.example.com allows subdomains; add example.com separately for the root domain.</small>
<div class="grid"><div><label for="rate">Requests per minute</label><input id="rate" name="rate_limit" type="number" min="1" max="1000" value="30" required></div>
<div><label for="timeout">Request timeout (seconds)</label><input id="timeout" name="timeout" type="number" min="1" max="30" value="10" required></div>
<div><label for="bytes">Maximum response bytes</label><input id="bytes" name="max_bytes" type="number" min="1024" max="5242880" value="1048576" required></div></div>
<label><input type="checkbox" name="local_http" value="1" <?= $local && $http ? 'checked' : '' ?>> Allow HTTP from a direct loopback client for local development</label>
<label><input type="checkbox" name="environment" value="1"> Enable authenticated PHP environment diagnostics</label>
<button type="submit">Generate key and install</button></form>
<?php endif; ?>
<p>Private configuration: <code><?= $escape($paths->envFile()) ?></code></p>
<p>Settings are loaded on every request. No Apache configuration changes or restart are needed.</p>
</main></body></html>
        <?php
    }
}

final class InstallationController
{
    public function serve(): void
    {
        ini_set('display_errors', '0');
        header('Cache-Control: no-store');
        header('Content-Type: text/html; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
        header('Referrer-Policy: no-referrer');
        try {
            $paths = ConfigurationPaths::discover(__DIR__, (string) ($_SERVER['DOCUMENT_ROOT'] ?? ''));
            $service = new InstallationService($paths);
            $access = new InstallationAccess();
            $endpoint = $access->connectorUrl($_SERVER);
            $local = $access->local($_SERVER);
            if (!$local && !$access->secure($_SERVER)) {
                throw new AppException('Open the installer on localhost, or use HTTPS for a remote installation.', 403);
            }
            if ($service->installed()) {
                http_response_code(($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' ? 409 : 200);
                (new InstallationView())->render($paths, '', $local, false, '', null, true);
                return;
            }
            session_name('w3bmap_setup_' . substr(hash('sha256', $paths->directory), 0, 16));
            if (!session_start(['use_strict_mode' => 1, 'use_only_cookies' => 1, 'cookie_httponly' => 1,
                'cookie_samesite' => 'Strict', 'cookie_secure' => $access->secure($_SERVER)])) {
                throw new AppException('Cannot start the installation session.', 503);
            }
            $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
            $csrf = $_SESSION['csrf'];
            if (!$local) {
                $service->setupCode();
            }
            $result = null;
            $message = '';
            try {
                if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
                    $access->authorize($_SERVER, $_POST, $csrf, $service);
                    $result = $service->install($_POST);
                    unset($_SESSION['csrf']);
                }
            } catch (AppException $error) {
                http_response_code($error->status);
                $message = $error->getMessage();
            }
            session_write_close();
            (new InstallationView())->render($paths, $csrf, $local, !$access->secure($_SERVER), $message, $result, false, $endpoint);
        } catch (\Throwable $error) {
            http_response_code($error instanceof AppException ? $error->status : 500);
            echo '<!doctype html><html lang="en"><title>Connector setup</title><h1>Connector setup unavailable</h1><p>'
                . htmlspecialchars($error instanceof AppException ? $error->getMessage() : 'An internal installation error occurred.', ENT_QUOTES, 'UTF-8') . '</p></html>';
        }
    }
}

if (PHP_SAPI !== 'cli' && realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) {
    (new InstallationController())->serve();
}
