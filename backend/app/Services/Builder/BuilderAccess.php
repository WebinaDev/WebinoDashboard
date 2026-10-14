<?php

namespace App\Services\Builder;

use App\Models\BuilderRolePolicy;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * Per-role builder permissions on top of the content capability.
 * edit = change drafts, publish = publish/unpublish/schedule, design = globals, theme templates, kits.
 * Admins are always allowed; a role without a policy row keeps full access (backwards compatible).
 */
class BuilderAccess
{
    public const ABILITIES = ['edit', 'publish', 'design'];

    public static function allows(?User $user, string $ability): bool
    {
        if (! $user) {
            return false;
        }
        $role = (string) ($user->role ?? '');
        if ($role === 'admin') {
            return true;
        }
        $row = BuilderRolePolicy::query()->where('tenant_id', $user->tenant_id)->where('role', $role)->first();
        if (! $row) {
            return true;
        }

        return (bool) $row->{'can_'.$ability};
    }

    public static function authorize(Request $request, string $ability): void
    {
        abort_unless(self::allows($request->user(), $ability), 403, 'builder_'.$ability.'_forbidden');
    }

    /** @return array<string, bool> */
    public static function abilities(?User $user): array
    {
        $out = [];
        foreach (self::ABILITIES as $ability) {
            $out[$ability] = self::allows($user, $ability);
        }

        return $out;
    }
}
