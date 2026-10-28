<?php

namespace App\Services\WordpressImport;

use RuntimeException;

/**
 * Thrown by an importer when a record cannot be imported for a known, non-error reason
 * (e.g. a redirect with no resolvable target). The runner marks the item `skipped` with
 * this message instead of `failed`, so it does not count as an import error.
 */
final class SkipImport extends RuntimeException {}
