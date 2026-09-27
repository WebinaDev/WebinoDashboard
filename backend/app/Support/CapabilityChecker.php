<?php

namespace App\Support;

use App\Models\RoleCapability;
use App\Models\User;
use Illuminate\Support\Facades\Cache;

class CapabilityChecker
{
    /** @return list<string> */
    public function capabilitiesForRole(string $role): array
    {
        $role = trim($role);
        if ($role === '') {
            return [];
        }

        /** @var list<string> $caps */
        $caps = Cache::remember(
            'role_capabilities:'.$role,
            3600,
            fn () => RoleCapability::query()
                ->where('role', $role)
                ->orderBy('capability')
                ->pluck('capability')
                ->all()
        );

        return $caps;
    }

    /** @return list<string> */
    public function capabilitiesForUser(User $user): array
    {
        if ((string) $user->role === 'admin') {
            return ['*'];
        }

        $caps = $this->capabilitiesForRole((string) $user->role);
        if (in_array('*', $caps, true)) {
            return ['*'];
        }

        return $caps;
    }

    public function allows(User $user, string $required): bool
    {
        if ((string) $user->role === 'admin') {
            return true;
        }

        $required = trim($required);
        if ($required === '') {
            return false;
        }

        foreach ($this->capabilitiesForRole((string) $user->role) as $granted) {
            if ($this->capabilityMatches($granted, $required)) {
                return true;
            }
        }

        return false;
    }

    public function capabilityMatches(string $granted, string $required): bool
    {
        if ($granted === '*' || $granted === $required) {
            return true;
        }

        if (str_ends_with($granted, '.*')) {
            $prefix = substr($granted, 0, -2);

            return $required === $prefix || str_starts_with($required, $prefix.'.');
        }

        return false;
    }

    public static function flushRoleCache(?string $role = null): void
    {
        if ($role !== null) {
            Cache::forget('role_capabilities:'.$role);

            return;
        }

        foreach (config('capabilities.roles', []) as $roleName) {
            Cache::forget('role_capabilities:'.(string) $roleName);
        }
    }
}
