<?php

namespace App\Support;

use App\Models\RoleCapability;
use App\Models\UserCapabilityOverride;
use App\Models\User;
use Illuminate\Support\Facades\Cache;

class CapabilityChecker
{
    /** @return list<string> */
    public function capabilitiesForRole(string $role, ?int $tenantId = null): array
    {
        $role = trim($role);
        if ($role === '') {
            return [];
        }

        /** @var list<string> $caps */
        $caps = Cache::remember(
            'role_capabilities:'.($tenantId ?? 'global').':'.$role,
            3600,
            function () use ($role, $tenantId): array {
                $query = RoleCapability::query()->where('role', $role);
                if ($tenantId !== null && (clone $query)->where('tenant_id', $tenantId)->exists()) {
                    $query->where('tenant_id', $tenantId);
                } else {
                    $query->whereNull('tenant_id');
                }
                return $query->orderBy('capability')->pluck('capability')->all();
            }
        );

        return $caps;
    }

    /** @return list<string> */
    public function capabilitiesForUser(User $user): array
    {
        if ((string) $user->role === 'admin') {
            return ['*'];
        }

        $caps = $this->capabilitiesForRole((string) $user->role, (int) $user->tenant_id);
        $overrides = UserCapabilityOverride::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->get(['capability', 'effect']);
        $denied = $overrides->where('effect', 'deny')->pluck('capability')->all();
        $allowed = $overrides->where('effect', 'allow')->pluck('capability')->all();
        if ($denied !== []) {
            $grants = array_values(array_unique(array_merge($caps, $allowed)));
            $caps = [];
            foreach (config('capabilities.catalog', []) as $candidate) {
                if (str_ends_with((string) $candidate, '.*')) continue;
                $granted = in_array('*', $grants, true);
                foreach ($grants as $grant) {
                    if ($this->capabilityMatches((string) $grant, (string) $candidate)) {
                        $granted = true;
                        break;
                    }
                }
                $blocked = false;
                foreach ($denied as $deny) {
                    if ($this->capabilityMatches((string) $deny, (string) $candidate)) {
                        $blocked = true;
                        break;
                    }
                }
                if ($granted && ! $blocked) $caps[] = $candidate;
            }
            return array_values(array_unique($caps));
        }
        $caps = array_values(array_unique(array_merge($caps, $allowed)));
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

        $overrides = UserCapabilityOverride::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->get(['capability', 'effect']);
        foreach ($overrides->where('effect', 'deny') as $override) {
            if ($this->capabilityMatches((string) $override->capability, $required)) {
                return false;
            }
        }
        foreach ($overrides->where('effect', 'allow') as $override) {
            if ($this->capabilityMatches((string) $override->capability, $required)) {
                return true;
            }
        }

        foreach ($this->capabilitiesForRole((string) $user->role, (int) $user->tenant_id) as $granted) {
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
            Cache::forget('role_capabilities:global:'.$role);
            foreach (\App\Models\Tenant::query()->pluck('id') as $tenantId) {
                Cache::forget('role_capabilities:'.$tenantId.':'.$role);
            }

            return;
        }

        foreach (config('capabilities.roles', []) as $roleName) {
            Cache::forget('role_capabilities:global:'.(string) $roleName);
            foreach (\App\Models\Tenant::query()->pluck('id') as $tenantId) {
                Cache::forget('role_capabilities:'.$tenantId.':'.(string) $roleName);
            }
        }
    }
}
