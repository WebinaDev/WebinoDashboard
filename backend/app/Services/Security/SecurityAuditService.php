<?php

namespace App\Services\Security;

use App\Models\CmsPage;
use App\Services\Performance\PerformanceSettingsService;

/**
 * Security score + checklist + customer-facing fix recommendations.
 * Reads Performance CDN status (read-only) to avoid writing into that module.
 */
final class SecurityAuditService
{
    /**
     * @return array{
     *   score: int,
     *   grade: string,
     *   checklist: list<array{id: string, ok: bool, weight: int, label: string, setting?: string, actionable: bool}>,
     *   actions: list<array{id: string, priority: string, title: string, hint: string, setting?: string, href?: string, actionable: bool}>,
     *   meta: array{cdn_provider: string, forms_without_captcha: int, forms_total: int}
     * }
     */
    public function insights(int $tenantId): array
    {
        $s = SecuritySettings::get($tenantId);
        $perf = app(PerformanceSettingsService::class)->get($tenantId);
        $cdnProvider = (string) ($perf['cdn_provider'] ?? 'none');
        // Require an explicit edge provider (not "auto"/"none") — Performance owns the setting.
        $cdnOk = in_array($cdnProvider, ['cloudflare', 'arvan', 'parspack', 'custom'], true);

        $formScan = $this->scanFormsNeedingCaptcha($tenantId);
        $captcha = $s['captcha'] ?? [];
        $provider = (string) ($captcha['provider'] ?? 'none');
        $protect = $captcha['protect'] ?? [];
        $captchaReady = $provider !== 'none' && (
            $provider === 'numeric' || (string) ($captcha['site_key'] ?? '') !== ''
        );
        $formsProtected = $captchaReady && ! empty($protect['forms']);
        $loginProtected = $captchaReady && ! empty($protect['login']);
        // Global protect.forms covers all public form posts; per-widget captcha is bonus.
        $formsOk = $formsProtected || ($formScan['total'] === 0);

        $headers = $s['headers'] ?? [];
        $ssl = $s['ssl'] ?? [];
        $edge = $s['edge'] ?? [];
        $login = $s['login'] ?? [];
        $privacy = $s['privacy'] ?? [];
        $waf = $s['waf'] ?? [];
        $forensics = $s['forensics'] ?? [];
        $spam = $s['spam'] ?? [];

        $checks = [
            [
                'id' => 'module_enabled',
                'ok' => ! empty($s['general']['enabled']),
                'weight' => 10,
                'label' => 'module_enabled',
                'setting' => 'general.enabled',
                'priority' => 'high',
                'title' => 'enable_module',
                'hint' => 'enable_module_hint',
                'actionable' => true,
            ],
            [
                'id' => 'force_https',
                'ok' => ! empty($ssl['force_https']),
                'weight' => 12,
                'label' => 'force_https',
                'setting' => 'ssl.force_https',
                'priority' => 'high',
                'title' => 'enable_force_https',
                'hint' => 'enable_force_https_hint',
                'actionable' => true,
            ],
            [
                'id' => 'hsts',
                'ok' => ! empty($ssl['hsts']),
                'weight' => 8,
                'label' => 'hsts',
                'setting' => 'ssl.hsts',
                'priority' => 'high',
                'title' => 'enable_hsts',
                'hint' => 'enable_hsts_hint',
                'actionable' => true,
            ],
            [
                'id' => 'cdn_present',
                'ok' => $cdnOk,
                'weight' => 8,
                'label' => 'cdn_present',
                'setting' => null,
                'priority' => 'high',
                'title' => 'configure_cdn',
                'hint' => 'configure_cdn_hint',
                'actionable' => false,
                'href' => '/dashboard/settings/site/performance',
            ],
            [
                'id' => 'hide_origin_ip',
                'ok' => ! empty($edge['hide_origin_ip']),
                'weight' => 8,
                'label' => 'hide_origin_ip',
                'setting' => 'edge.hide_origin_ip',
                'priority' => 'high',
                'title' => 'enable_hide_origin',
                'hint' => 'enable_hide_origin_hint',
                'actionable' => true,
            ],
            [
                'id' => 'forms_captcha',
                'ok' => $formsOk,
                'weight' => 10,
                'label' => 'forms_captcha',
                'setting' => 'captcha.protect.forms',
                'priority' => 'high',
                'title' => 'enable_forms_captcha',
                'hint' => 'enable_forms_captcha_hint',
                'actionable' => true,
            ],
            [
                'id' => 'login_captcha',
                'ok' => $loginProtected,
                'weight' => 6,
                'label' => 'login_captcha',
                'setting' => 'captcha.protect.login',
                'priority' => 'medium',
                'title' => 'enable_login_captcha',
                'hint' => 'enable_login_captcha_hint',
                'actionable' => true,
            ],
            [
                'id' => 'login_limit',
                'ok' => ! empty($login['limit_attempts']),
                'weight' => 8,
                'label' => 'login_limit',
                'setting' => 'login.limit_attempts',
                'priority' => 'high',
                'title' => 'enable_login_limit',
                'hint' => 'enable_login_limit_hint',
                'actionable' => true,
            ],
            [
                'id' => 'force_2fa',
                'ok' => ! empty($login['force_2fa_admins']),
                'weight' => 7,
                'label' => 'force_2fa',
                'setting' => 'login.force_2fa_admins',
                'priority' => 'medium',
                'title' => 'enable_force_2fa',
                'hint' => 'enable_force_2fa_hint',
                'actionable' => true,
            ],
            [
                'id' => 'waf',
                'ok' => ! empty($waf['enabled']),
                'weight' => 7,
                'label' => 'waf',
                'setting' => 'waf.enabled',
                'priority' => 'medium',
                'title' => 'enable_waf',
                'hint' => 'enable_waf_hint',
                'actionable' => true,
            ],
            [
                'id' => 'headers_frame',
                'ok' => ! empty($headers['x_frame_options']),
                'weight' => 5,
                'label' => 'headers_frame',
                'setting' => 'headers.x_frame_options',
                'priority' => 'medium',
                'title' => 'enable_x_frame',
                'hint' => 'enable_x_frame_hint',
                'actionable' => true,
            ],
            [
                'id' => 'headers_referrer',
                'ok' => ! empty($headers['referrer_policy']),
                'weight' => 4,
                'label' => 'headers_referrer',
                'setting' => 'headers.referrer_policy',
                'priority' => 'low',
                'title' => 'enable_referrer',
                'hint' => 'enable_referrer_hint',
                'actionable' => true,
            ],
            [
                'id' => 'hide_fingerprint',
                'ok' => ! empty($privacy['hide_app_fingerprint']),
                'weight' => 3,
                'label' => 'hide_fingerprint',
                'setting' => 'privacy.hide_app_fingerprint',
                'priority' => 'low',
                'title' => 'enable_hide_fingerprint',
                'hint' => 'enable_hide_fingerprint_hint',
                'actionable' => true,
            ],
            [
                'id' => 'honeypot',
                'ok' => ($spam['honeypot'] ?? true) !== false,
                'weight' => 3,
                'label' => 'honeypot',
                'setting' => 'spam.honeypot',
                'priority' => 'low',
                'title' => 'enable_honeypot',
                'hint' => 'enable_honeypot_hint',
                'actionable' => true,
            ],
            [
                'id' => 'forensics',
                'ok' => ($forensics['log_events'] ?? true) !== false,
                'weight' => 4,
                'label' => 'forensics',
                'setting' => 'forensics.log_events',
                'priority' => 'low',
                'title' => 'enable_forensics',
                'hint' => 'enable_forensics_hint',
                'actionable' => true,
            ],
        ];

        $earned = 0;
        $total = 0;
        $checklist = [];
        $actions = [];

        foreach ($checks as $check) {
            $total += $check['weight'];
            if ($check['ok']) {
                $earned += $check['weight'];
            } else {
                $actions[] = [
                    'id' => $check['id'],
                    'priority' => $check['priority'],
                    'title' => $check['title'],
                    'hint' => $check['hint'],
                    'setting' => $check['setting'],
                    'href' => $check['href'] ?? null,
                    'actionable' => (bool) $check['actionable'],
                ];
            }
            $checklist[] = [
                'id' => $check['id'],
                'ok' => (bool) $check['ok'],
                'weight' => $check['weight'],
                'label' => $check['label'],
                'setting' => $check['setting'],
                'actionable' => (bool) $check['actionable'],
            ];
        }

        $score = $total > 0 ? (int) round(($earned / $total) * 100) : 0;
        $grade = match (true) {
            $score >= 90 => 'A',
            $score >= 80 => 'B',
            $score >= 65 => 'C',
            $score >= 50 => 'D',
            default => 'F',
        };

        usort($actions, static function (array $a, array $b): int {
            $rank = ['high' => 0, 'medium' => 1, 'low' => 2];

            return ($rank[$a['priority']] ?? 9) <=> ($rank[$b['priority']] ?? 9);
        });

        return [
            'score' => $score,
            'grade' => $grade,
            'checklist' => $checklist,
            'actions' => array_slice($actions, 0, 14),
            'meta' => [
                'cdn_provider' => $cdnProvider,
                'forms_without_captcha' => $formScan['unprotected'],
                'forms_total' => $formScan['total'],
            ],
        ];
    }

    /**
     * Apply one recommended fix by checklist id. Does not mutate Performance/SEO/shipping.
     *
     * @return array{settings: array<string, mixed>, insights: array<string, mixed>, applied: bool, message?: string}
     */
    public function applyFix(int $tenantId, string $checkId): array
    {
        if ($checkId === 'cdn_present') {
            return [
                'settings' => SecuritySettings::get($tenantId),
                'insights' => $this->insights($tenantId),
                'applied' => false,
                'message' => 'navigate_performance',
            ];
        }

        $current = SecuritySettings::get($tenantId);
        $patch = match ($checkId) {
            'module_enabled' => ['general' => ['enabled' => true]],
            'force_https' => ['ssl' => ['force_https' => true]],
            'hsts' => ['ssl' => ['hsts' => true, 'hsts_max_age' => 31536000]],
            'hide_origin_ip' => ['edge' => ['hide_origin_ip' => true]],
            'forms_captcha' => $this->captchaProtectPatch($current, 'forms'),
            'login_captcha' => $this->captchaProtectPatch($current, 'login'),
            'login_limit' => ['login' => ['limit_attempts' => true]],
            'force_2fa' => ['login' => ['force_2fa_admins' => true]],
            'waf' => ['waf' => ['enabled' => true]],
            'headers_frame' => ['headers' => ['x_frame_options' => 'SAMEORIGIN']],
            'headers_referrer' => ['headers' => ['referrer_policy' => 'strict-origin-when-cross-origin']],
            'hide_fingerprint' => ['privacy' => ['hide_app_fingerprint' => true]],
            'honeypot' => ['spam' => ['honeypot' => true]],
            'forensics' => ['forensics' => ['log_events' => true]],
            default => null,
        };

        if ($patch === null) {
            return [
                'settings' => $current,
                'insights' => $this->insights($tenantId),
                'applied' => false,
                'message' => 'unknown_check',
            ];
        }

        $settings = SecuritySettings::save($tenantId, $patch);

        return [
            'settings' => $settings,
            'insights' => $this->insights($tenantId),
            'applied' => true,
        ];
    }

    /** @return array{total: int, unprotected: int} */
    private function scanFormsNeedingCaptcha(int $tenantId): array
    {
        $total = 0;
        $unprotected = 0;
        $pages = CmsPage::query()
            ->where('tenant_id', $tenantId)
            ->whereNotNull('builder_published')
            ->orderByDesc('id')
            ->limit(40)
            ->get(['id', 'builder_published']);

        foreach ($pages as $page) {
            $doc = $page->builder_published;
            if (! is_array($doc)) {
                continue;
            }
            $this->walkNodes($doc, $total, $unprotected);
        }

        return ['total' => $total, 'unprotected' => $unprotected];
    }

    /** @param  array<string, mixed>|list<mixed>  $node */
    private function walkNodes(mixed $node, int &$total, int &$unprotected): void
    {
        if (! is_array($node)) {
            return;
        }
        if (($node['type'] ?? null) === 'form') {
            $total++;
            $props = is_array($node['props'] ?? null) ? $node['props'] : [];
            if (empty($props['captcha'])) {
                $unprotected++;
            }
        }
        foreach (['children', 'nodes', 'sections', 'blocks'] as $key) {
            if (! empty($node[$key]) && is_array($node[$key])) {
                foreach ($node[$key] as $child) {
                    $this->walkNodes($child, $total, $unprotected);
                }
            }
        }
        // Some docs store a root tree under "root" / "body".
        foreach (['root', 'body', 'document'] as $key) {
            if (isset($node[$key]) && is_array($node[$key])) {
                $this->walkNodes($node[$key], $total, $unprotected);
            }
        }
    }

    /**
     * @param  array<string, mixed>  $current
     * @return array<string, mixed>
     */
    private function captchaProtectPatch(array $current, string $surface): array
    {
        $provider = (string) data_get($current, 'captcha.provider', 'none');
        if ($provider === 'none' || $provider === '') {
            $provider = 'numeric';
        }

        return [
            'captcha' => [
                'provider' => $provider,
                'protect' => [$surface => true],
            ],
        ];
    }
}
