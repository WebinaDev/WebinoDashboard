<?php

namespace App\Services\Builder;

use App\Models\BuilderFormSetting;
use App\Models\Tenant;
use App\Services\Notifications\TenantMailer;
use App\Services\Sms\SmsPanelAdapterRegistry;
use App\Services\WordpressImport\ImportUrlGuard;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/** Runs the configured actions after a public builder form submission: email, SMS, webhook, redirect. */
class BuilderFormActions
{
    public const KEYS = ['email_to', 'sms_to', 'sms_text', 'webhook_url', 'redirect_url'];

    /** @return array<string, string> */
    public static function settings(int $tenantId, string $formKey): array
    {
        $row = BuilderFormSetting::query()->where('tenant_id', $tenantId)->where('form_key', $formKey)->first();
        $actions = is_array($row?->actions) ? $row->actions : [];

        return array_map(fn ($v) => is_string($v) ? $v : '', array_intersect_key($actions, array_flip(self::KEYS)));
    }

    /** Webhooks must be public https URLs (no private / loopback / metadata hosts). */
    public static function webhookAllowed(string $url): bool
    {
        try {
            $parts = ImportUrlGuard::parseHttp($url);
        } catch (\Throwable) {
            return false;
        }
        if ($parts['scheme'] !== 'https' || ImportUrlGuard::isBlockedHost($parts['host'])) {
            return false;
        }
        if (! filter_var($parts['host'], FILTER_VALIDATE_IP)) {
            $ips = @gethostbynamel($parts['host']) ?: [];
            foreach ($ips as $ip) {
                if (ImportUrlGuard::isBlockedIp($ip)) {
                    return false;
                }
            }
        }

        return true;
    }

    /** Redirects stay on-site (relative path) or plain https. */
    public static function safeRedirect(string $url): ?string
    {
        $url = trim($url);
        if ($url === '') {
            return null;
        }
        if (str_starts_with($url, '/') && ! str_starts_with($url, '//')) {
            return $url;
        }

        return preg_match('#^https://[^\s]+$#i', $url) ? $url : null;
    }

    /**
     * @param  array<string, string>  $fields
     * @return array{redirect: ?string}
     */
    public static function run(int $tenantId, string $formKey, array $fields): array
    {
        $settings = self::settings($tenantId, $formKey);
        $summary = collect($fields)->map(fn ($v, $k) => "$k: $v")->implode("\n");

        if (($settings['email_to'] ?? '') !== '') {
            $to = array_slice(array_map('trim', explode(',', $settings['email_to'])), 0, 5);
            try {
                app(TenantMailer::class)->send($tenantId, $to, 'فرم جدید: '.$formKey, $summary);
            } catch (\Throwable $e) {
                Log::warning('builder_form_mail_failed', ['tenant_id' => $tenantId, 'error' => $e->getMessage()]);
            }
        }

        if (($settings['sms_to'] ?? '') !== '' && ($tenant = Tenant::query()->find($tenantId))) {
            $text = ($settings['sms_text'] ?? '') !== '' ? strtr($settings['sms_text'], collect($fields)->mapWithKeys(fn ($v, $k) => ['{'.$k.'}' => $v])->all()) : 'فرم جدید: '.$formKey;
            try {
                app(SmsPanelAdapterRegistry::class)->send($tenant, ['to' => $settings['sms_to'], 'message' => mb_substr($text, 0, 300)]);
            } catch (\Throwable $e) {
                Log::warning('builder_form_sms_failed', ['tenant_id' => $tenantId, 'error' => $e->getMessage()]);
            }
        }

        $webhook = $settings['webhook_url'] ?? '';
        if ($webhook !== '' && self::webhookAllowed($webhook)) {
            dispatch(function () use ($webhook, $formKey, $fields): void {
                try {
                    Http::timeout(5)->withoutRedirecting()->asJson()->post($webhook, ['form_key' => $formKey, 'fields' => $fields, 'submitted_at' => now()->toIso8601String()]);
                } catch (\Throwable $e) {
                    Log::warning('builder_form_webhook_failed', ['error' => $e->getMessage()]);
                }
            })->afterResponse();
        }

        return ['redirect' => self::safeRedirect($settings['redirect_url'] ?? '')];
    }
}
