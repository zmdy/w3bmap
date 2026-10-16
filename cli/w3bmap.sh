#!/bin/sh
# Thin launcher: application behavior lives in the PHP classes.
set -eu

case "$0" in
    */*) launcher_directory=${0%/*} ;;
    *) launcher_directory=. ;;
esac
script_directory=$(CDPATH= cd -- "$launcher_directory" && pwd)
php_binary=${W3BMAP_PHP_BIN:-php}

if ! command -v "$php_binary" >/dev/null 2>&1; then
    printf '%s\n' 'Error: PHP was not found. Install PHP 8.1+ or set W3BMAP_PHP_BIN.' >&2
    exit 1
fi

exec "$php_binary" "$script_directory/w3bmap.php" "$@"
