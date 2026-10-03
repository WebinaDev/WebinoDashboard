<?php

namespace App\Support;

final class AuditActor
{
    /** @return array{by: int|null, erp_staff_id?: int, erp_staff_name?: string} */
    public static function stamp(): array
    {
        $stamp = ['by' => auth()->id()];
        $request = request();
        if ($request === null) {
            return $stamp;
        }
        $session = ImpersonationSession::current($request);
        if (! is_array($session)) {
            return $stamp;
        }
        $staffId = (int) ($session['staff_id'] ?? 0);
        if ($staffId > 0) {
            $stamp['erp_staff_id'] = $staffId;
        }
        $name = trim((string) ($session['staff_name'] ?? ''));
        if ($name !== '') {
            $stamp['erp_staff_name'] = $name;
        }

        return $stamp;
    }
}
