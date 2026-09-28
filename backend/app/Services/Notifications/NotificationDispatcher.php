<?php

namespace App\Services\Notifications;

use App\Models\BotSession;
use App\Models\Tenant;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\Auth\OtpSettings;
use App\Services\Bots\BotClientFactory;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Sms\ModirPayamakClient;
use Illuminate\Support\Facades\Log;

class NotificationDispatcher
{
    public const ADMIN_ROLES = ['admin', 'shop_manager'];

    public function __construct(protected TenantMailer $mailer) {}

    /**
     * @param  array{
     *     vars?: array<string, scalar|null>,
     *     customer_user_id?: int|null,
     *     customer_email?: string|null,
     *     customer_phone?: string|null,
     *     customer_link?: string|null,
     *     admin_link?: string|null,
     *     customer_title?: string|null,
     *     customer_body?: string|null,
     *     sms_body?: string|null,
     *     type?: string|null,
     *     only?: list<string>,
     *     skip?: list<string>,
     * }  $context
     * @return list<string>
     */
    public function dispatch(string $event, int $tenantId, array $context = []): array
    {
        if (! in_array($event, NotificationSettings::EVENTS, true) || $tenantId <= 0) {
            return [];
        }

        $settings = NotificationSettings::get($tenantId);
        $tenant = Tenant::query()->find($tenantId);
        $vars = array_merge([
            'site_name' => $tenant ? (string) ($tenant->store_display_name ?: $tenant->name) : '',
        ], array_map(fn ($v) => (string) ($v ?? ''), $context['vars'] ?? []));

        $only = $context['only'] ?? null;
        $skip = $context['skip'] ?? [];
        $sent = [];

        foreach (NotificationSettings::CHANNELS as $channel) {
            if (($only !== null && ! in_array($channel, $only, true)) || in_array($channel, $skip, true)) {
                continue;
            }
            $cfg = $settings['channels'][$channel] ?? [];
            if (empty($cfg['enabled'])) {
                continue;
            }
            $eventCfg = $cfg['events'][$event] ?? [];
            foreach (['customer', 'admin'] as $audience) {
                if (empty($eventCfg[$audience])) {
                    continue;
                }
                $body = $this->renderBody($event, $audience, $channel, (string) ($eventCfg[$audience.'_template'] ?? ''), $vars, $context);
                $title = $this->renderTitle($event, $audience, $vars, $context);
                try {
                    $ok = $this->deliver($channel, $audience, $event, $tenantId, $cfg, $title, $body, $context);
                } catch (\Throwable $e) {
                    Log::warning('notification_dispatch_failed', [
                        'tenant_id' => $tenantId,
                        'event' => $event,
                        'channel' => $channel,
                        'error' => $e->getMessage(),
                    ]);
                    $ok = false;
                }
                if ($ok) {
                    $sent[] = $channel.':'.$audience;
                }
            }
        }

        return $sent;
    }

    /**
     * @param  array<string, string>  $vars
     * @param  array<string, mixed>  $context
     */
    protected function renderBody(string $event, string $audience, string $channel, string $template, array $vars, array $context): string
    {
        if (trim($template) === '') {
            if ($audience === 'customer' && $channel === 'sms' && filled($context['sms_body'] ?? null)) {
                return (string) $context['sms_body'];
            }
            if ($audience === 'customer' && filled($context['customer_body'] ?? null)) {
                return (string) $context['customer_body'];
            }
            $template = (string) __("notifications.{$event}.{$audience}");
        }

        return $this->render($template, $vars);
    }

    /**
     * @param  array<string, string>  $vars
     * @param  array<string, mixed>  $context
     */
    protected function renderTitle(string $event, string $audience, array $vars, array $context): string
    {
        if ($audience === 'customer' && filled($context['customer_title'] ?? null)) {
            return (string) $context['customer_title'];
        }

        return $this->render((string) __("notifications.{$event}.title"), $vars);
    }

    /** @param  array<string, string>  $vars */
    public function render(string $template, array $vars): string
    {
        $pairs = [];
        foreach ($vars as $k => $v) {
            $pairs['{'.$k.'}'] = $v;
        }

        return strtr($template, $pairs);
    }

    /**
     * @param  array<string, mixed>  $cfg
     * @param  array<string, mixed>  $context
     */
    protected function deliver(string $channel, string $audience, string $event, int $tenantId, array $cfg, string $title, string $body, array $context): bool
    {
        $customerId = (int) ($context['customer_user_id'] ?? 0);

        return match ($channel) {
            'site' => $audience === 'customer'
                ? $this->siteCustomer($tenantId, $customerId, $event, $title, $body, $context)
                : $this->siteAdmins($tenantId, $event, $title, $body, $context),
            'email' => $this->mailer->send(
                $tenantId,
                $audience === 'customer' ? $this->customerEmail($context, $customerId) : $this->adminEmails($tenantId, $cfg),
                $title,
                $body
            ),
            'sms' => $this->sms(
                $tenantId,
                $audience === 'customer' ? $this->customerPhone($context, $customerId) : (string) ($cfg['admin_phone'] ?? ''),
                $body
            ),
            'bale', 'telegram' => $this->bot(
                $tenantId,
                $channel,
                $audience === 'customer' ? $this->customerChatId($tenantId, $channel, $customerId) : (string) ($cfg['admin_chat_id'] ?? ''),
                $title."\n".$body
            ),
            default => false,
        };
    }

    /** @param  array<string, mixed>  $context */
    protected function siteCustomer(int $tenantId, int $userId, string $event, string $title, string $body, array $context): bool
    {
        if ($userId <= 0) {
            return false;
        }
        UserNotification::query()->create([
            'tenant_id' => $tenantId,
            'user_id' => $userId,
            'type' => (string) ($context['type'] ?? $event),
            'title' => $title,
            'body' => $body,
            'link' => (string) ($context['customer_link'] ?? ''),
            'created_at' => now(),
        ]);

        return true;
    }

    /** @param  array<string, mixed>  $context */
    protected function siteAdmins(int $tenantId, string $event, string $title, string $body, array $context): bool
    {
        $admins = $this->admins($tenantId);
        foreach ($admins as $admin) {
            UserNotification::query()->create([
                'tenant_id' => $tenantId,
                'user_id' => $admin->id,
                'type' => (string) ($context['type'] ?? $event),
                'title' => $title,
                'body' => $body,
                'link' => (string) ($context['admin_link'] ?? ''),
                'created_at' => now(),
            ]);
        }

        return $admins->isNotEmpty();
    }

    /** @return \Illuminate\Support\Collection<int, User> */
    protected function admins(int $tenantId)
    {
        return User::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('role', self::ADMIN_ROLES)
            ->where('is_active', true)
            ->get(['id', 'email', 'phone']);
    }

    /** @param  array<string, mixed>  $context */
    protected function customerEmail(array $context, int $userId): string
    {
        $email = (string) ($context['customer_email'] ?? '');
        if ($email === '' && $userId > 0) {
            $email = (string) (User::query()->whereKey($userId)->value('email') ?? '');
        }

        return str_ends_with($email, '@otp.local') ? '' : $email;
    }

    /**
     * @param  array<string, mixed>  $cfg
     * @return list<string>
     */
    protected function adminEmails(int $tenantId, array $cfg): array
    {
        $configured = array_filter(array_map('trim', explode(',', (string) ($cfg['admin_email'] ?? ''))));
        if ($configured !== []) {
            return array_values($configured);
        }

        return $this->admins($tenantId)->pluck('email')->filter()->values()->all();
    }

    /** @param  array<string, mixed>  $context */
    protected function customerPhone(array $context, int $userId): string
    {
        $phone = (string) ($context['customer_phone'] ?? '');
        if ($phone === '' && $userId > 0) {
            $phone = (string) (User::query()->whereKey($userId)->value('phone') ?? '');
        }

        return $phone;
    }

    protected function customerChatId(int $tenantId, string $provider, int $userId): string
    {
        if ($userId <= 0) {
            return '';
        }

        return (string) (BotSession::query()
            ->where('tenant_id', $tenantId)
            ->where('provider', $provider)
            ->where('user_id', $userId)
            ->whereNotNull('chat_id')
            ->orderByDesc('last_seen_at')
            ->value('chat_id') ?? '');
    }

    protected function sms(int $tenantId, string $phone, string $message): bool
    {
        $phones = array_values(array_filter(array_map('trim', explode(',', $phone))));
        $tenant = Tenant::query()->find($tenantId);
        if ($phones === [] || ! $tenant) {
            return false;
        }
        $from = (string) (OtpSettings::forTenant($tenantId, app(ModuleSettingsService::class))['sender_line_service'] ?? '');
        $body = ['message' => $message, 'recipients' => $phones];
        if ($from !== '') {
            $body['from_number'] = $from;
        }
        $result = app(ModirPayamakClient::class)->post($tenant, 'send', $body);
        $data = is_array($result['data'] ?? null) ? $result['data'] : [];

        return ! empty($result['ok']) && empty($data['unavailable']);
    }

    protected function bot(int $tenantId, string $provider, string $chatId, string $message): bool
    {
        if ($chatId === '') {
            return false;
        }
        $client = BotClientFactory::forTenant($tenantId, $provider);
        if (! $client) {
            return false;
        }
        $res = $client->sendMessage($chatId, 'text', $message);
        $ok = ! empty($res['ok']);
        BotClientFactory::log($tenantId, $provider, $chatId, 'text', $message, $ok ? 'sent' : 'failed');

        return $ok;
    }
}
