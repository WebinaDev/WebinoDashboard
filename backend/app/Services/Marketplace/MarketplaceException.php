<?php

namespace App\Services\Marketplace;

use RuntimeException;

class MarketplaceException extends RuntimeException
{
    /** @param  array<string, mixed>  $response */
    public function __construct(
        string $message,
        public readonly int $status = 0,
        public readonly array $response = [],
        public readonly int $retryAfter = 0,
        public readonly ?string $path = null,
    ) {
        parent::__construct($message, $status);
    }

    public function isAuthError(): bool
    {
        return $this->status === 401 || $this->status === 403;
    }

    public function isRateLimited(): bool
    {
        return $this->status === 429;
    }

    public function isTransient(): bool
    {
        return $this->status === 0 || $this->status === 429 || $this->status >= 500;
    }
}
