<?php

namespace App\Services\Support;

use App\Services\Modules\ModuleSettingsService;

final class TicketSettings
{
    public const MODULE = 'settings';

    public const KEY = 'support.tickets';

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        return [
            'number_prefix' => 'TKT',
            'guest_allowed' => true,
            'max_open_per_user' => 10,
            'auto_close_days' => 14,
            'allow_customer_edit_hours' => 1,
            'default_priority' => 'normal',
            'assignment' => [
                'mode' => 'department_default', // department_default | round_robin | manual
                'notify_assignee' => true,
                'allow_cross_department_refer' => true,
            ],
            'attachments' => [
                'max_files' => 5,
                'max_kb' => 8192,
            ],
            'statuses' => ['open', 'answered', 'pending', 'closed'],
            'priorities' => ['low', 'normal', 'high', 'urgent'],
        ];
    }

    /** @return array<string, mixed> */
    public static function get(int $tenantId): array
    {
        $stored = app(ModuleSettingsService::class)->get($tenantId, self::MODULE, self::KEY, []);

        return array_replace_recursive(self::defaults(), is_array($stored) ? $stored : []);
    }

    /** @param  array<string, mixed>  $input */
    public static function put(int $tenantId, array $input): array
    {
        $current = self::get($tenantId);
        $next = array_replace_recursive($current, $input);
        $next['number_prefix'] = substr(preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($next['number_prefix'] ?? 'TKT')) ?: 'TKT', 0, 12);
        $next['guest_allowed'] = (bool) ($next['guest_allowed'] ?? true);
        $next['max_open_per_user'] = max(0, min(100, (int) ($next['max_open_per_user'] ?? 10)));
        $next['auto_close_days'] = max(0, min(365, (int) ($next['auto_close_days'] ?? 14)));
        $next['allow_customer_edit_hours'] = max(0, min(72, (int) ($next['allow_customer_edit_hours'] ?? 1)));
        $prio = (string) ($next['default_priority'] ?? 'normal');
        $next['default_priority'] = in_array($prio, ['low', 'normal', 'high', 'urgent'], true) ? $prio : 'normal';
        $mode = (string) data_get($next, 'assignment.mode', 'department_default');
        data_set($next, 'assignment.mode', in_array($mode, ['department_default', 'round_robin', 'manual'], true) ? $mode : 'department_default');
        data_set($next, 'assignment.notify_assignee', (bool) data_get($next, 'assignment.notify_assignee', true));
        data_set($next, 'assignment.allow_cross_department_refer', (bool) data_get($next, 'assignment.allow_cross_department_refer', true));

        app(ModuleSettingsService::class)->put($tenantId, self::MODULE, self::KEY, $next);

        return $next;
    }
}
