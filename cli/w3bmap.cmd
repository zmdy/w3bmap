@echo off
setlocal DisableDelayedExpansion
rem Thin launcher: application behavior lives in the PHP classes.
if defined W3BMAP_PHP_BIN (
    "%W3BMAP_PHP_BIN%" "%~dp0w3bmap.php" %*
) else (
    php "%~dp0w3bmap.php" %*
)
exit /b %errorlevel%
