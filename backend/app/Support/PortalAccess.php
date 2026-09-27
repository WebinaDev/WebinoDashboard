<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Http\Request;

final class PortalAccess
{
    public static function allows(User $user): bool
    {
        $caps = app(CapabilityChecker::class);

        return $caps->allows($user, 'account.portal') || $caps->allows($user, 'partner.portal');
    }

    public static function authorize(Request $request): User
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        abort_unless(self::allows($user), 403);

        return $user;
    }
}
