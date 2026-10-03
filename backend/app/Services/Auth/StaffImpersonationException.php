<?php

namespace App\Services\Auth;

use RuntimeException;

class StaffImpersonationException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $status = 401,
    ) {
        parent::__construct($message);
    }

    public static function make(string $errorCode, int $status = 401): self
    {
        $key = match ($errorCode) {
            'IMPERSONATION_EXPIRED' => 'auth.impersonation_expired',
            'IMPERSONATION_REPLAY' => 'auth.impersonation_replay',
            'IMPERSONATION_SITE_MISMATCH' => 'auth.impersonation_site_mismatch',
            'IMPERSONATION_UNAVAILABLE' => 'auth.impersonation_unavailable',
            'IMPERSONATION_SWITCH_UNAVAILABLE' => 'auth.impersonation_switch_unavailable',
            'IMPERSONATION_CURRENT_SITE' => 'auth.impersonation_current_site',
            'IMPERSONATION_NOT_ACTIVE' => 'auth.impersonation_not_active',
            default => 'auth.impersonation_invalid',
        };

        return new self($errorCode, __($key), $status);
    }
}
