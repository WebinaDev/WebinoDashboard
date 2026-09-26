<?php

namespace App\Services\Marketplace\Basalam;

use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplaceLogger;
use App\Services\Marketplace\MarketplaceSettingsService;
use Illuminate\Support\Facades\Cache;

/**
 * Booth-level Basalam APIs: vendor profile, shipping profiles, raw discounts and chat widget
 * (port of VendorInfoService, ShippingService and the chat/discount REST handlers).
 */
class BasalamBooth
{
    public const VENDOR_FIELDS = ['title', 'summary', 'status', 'city', 'province', 'is_active'];

    public const CHAT_WIDGET_PATH = '/basalam-chat/widget-loader.js';

    public function __construct(protected BasalamClient $client) {}

    public static function for(int $tenantId): self
    {
        return new self(BasalamClient::for($tenantId));
    }

    protected function settings(): MarketplaceSettingsService
    {
        return app(MarketplaceSettingsService::class);
    }

    protected function tid(): int
    {
        return $this->client->tenantId();
    }

    /** @return array<string, mixed>|null */
    public function vendor(bool $refresh = false): ?array
    {
        $state = $this->settings()->state($this->tid(), 'basalam');
        if (! $refresh && is_array($state['vendor'] ?? null) && (int) ($state['vendor_fetched_at'] ?? 0) > time() - 600) {
            return $state['vendor'];
        }
        $vendorId = $this->client->vendorId();
        $info = $this->client->get(sprintf(BasalamEndpoints::VENDOR_INFO, $vendorId));
        $vendor = is_array($info['data'] ?? null) && isset($info['data']['id']) ? $info['data'] : $info;
        $this->settings()->putState($this->tid(), 'basalam', [
            'vendor' => $vendor,
            'vendor_fetched_at' => time(),
            'vendor_title' => (string) ($vendor['title'] ?? ''),
        ]);

        return $vendor;
    }

    /**
     * @param  array<string, mixed>  $fields
     * @return array<string, mixed>
     */
    public function updateVendor(array $fields): array
    {
        $body = array_intersect_key($fields, array_flip(self::VENDOR_FIELDS));
        if ($body === []) {
            throw new MarketplaceException(__('marketplace.basalam_vendor_no_fields'), 422);
        }
        $result = $this->client->patch(sprintf(BasalamEndpoints::VENDOR_INFO, $this->client->vendorId()), $body);
        MarketplaceLogger::info($this->tid(), 'basalam', 'booth', 'Vendor profile updated', ['fields' => array_keys($body)]);

        return ['result' => $result, 'vendor' => $this->vendor(true)];
    }

    /** @return array<string, mixed> */
    public function shipping(): array
    {
        $vendorId = $this->client->vendorId();
        $safe = function (callable $fn): array {
            try {
                return ['ok' => true, 'data' => $fn()];
            } catch (MarketplaceException $e) {
                return ['ok' => false, 'data' => null, 'error' => $e->getMessage()];
            }
        };
        $profiles = $safe(fn () => $this->client->get(BasalamEndpoints::SHIPPING_PROFILES, ['page' => 1, 'per_page' => 50, 'vendor_id' => $vendorId]));
        $carriers = $safe(fn () => $this->client->get(BasalamEndpoints::SHIPPING_CARRIERS));
        $vendorCarriers = $safe(fn () => $this->client->get(BasalamEndpoints::SHIPPING_VENDOR_CARRIERS, ['vendor_id' => $vendorId]));
        $strategy = $safe(fn () => $this->client->get(BasalamEndpoints::SHIPPING_PROFILE_STRATEGY, ['vendor_id' => $vendorId]));

        return [
            'ok' => $profiles['ok'],
            'error' => $profiles['error'] ?? null,
            'profiles' => $profiles['data'],
            'carriers' => $carriers['data'],
            'vendor_carriers' => $vendorCarriers['data'],
            'strategy' => $strategy['data'],
        ];
    }

    /**
     * create / update / delete a shipping profile (`action` + `profile_id`, like the WP handler).
     *
     * @param  array<string, mixed>  $params
     * @return array<mixed>
     */
    public function shippingAction(array $params): array
    {
        $action = strtolower((string) ($params['action'] ?? ''));
        $profileId = (int) ($params['profile_id'] ?? $params['id'] ?? 0);
        $body = $params;
        unset($body['profile_id'], $body['id'], $body['action']);
        if (isset($body['title'])) {
            $body['title'] = trim(strip_tags((string) $body['title']));
        }

        if (in_array($action, ['delete', 'delete_profile'], true)) {
            $this->assertProfile($profileId);
            $result = $this->client->delete(sprintf(BasalamEndpoints::SHIPPING_PROFILE, $profileId));
        } elseif (in_array($action, ['update', 'update_profile'], true) || $profileId > 0) {
            $this->assertProfile($profileId);
            $result = $this->client->patch(sprintf(BasalamEndpoints::SHIPPING_PROFILE, $profileId), $body);
        } else {
            if (trim((string) ($body['title'] ?? '')) === '') {
                throw new MarketplaceException(__('marketplace.basalam_shipping_title_required'), 422);
            }
            $body['vendor_id'] = $this->client->vendorId();
            $result = $this->client->post(BasalamEndpoints::SHIPPING_PROFILES, $body);
        }
        MarketplaceLogger::info($this->tid(), 'basalam', 'booth', 'Shipping profile '.($action ?: ($profileId ? 'update' : 'create')), ['profile_id' => $profileId ?: null]);

        return $result;
    }

    protected function assertProfile(int $profileId): void
    {
        if ($profileId < 1) {
            throw new MarketplaceException(__('marketplace.basalam_shipping_invalid_profile'), 422);
        }
    }

    /** @return array<mixed> */
    public function discounts(): array
    {
        return $this->client->get(sprintf(BasalamEndpoints::VENDOR_DISCOUNTS, $this->client->vendorId()));
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<mixed>
     */
    public function createDiscount(array $payload): array
    {
        return $this->client->post(sprintf(BasalamEndpoints::VENDOR_DISCOUNTS, $this->client->vendorId()), $payload);
    }

    /**
     * Chat widget bootstrap for the booth page (token is only handed to the authenticated panel).
     *
     * @return array{enabled: bool, token: ?string, script_url: string}
     */
    public function chatToken(): array
    {
        $auth = $this->client->auth();
        $token = $auth->isConnected() ? $auth->accessToken() : '';

        return [
            'enabled' => $token !== '',
            'token' => $token !== '' ? $token : null,
            'script_url' => self::CHAT_WIDGET_PATH,
        ];
    }

    /**
     * Soft chat-activity alert, throttled to once a day per store. The Dashboard has no per-user
     * notification inbox, so the alert is kept on the platform state and surfaced by the panel.
     *
     * @return array<string, mixed>
     */
    public function chatNotify(): array
    {
        if (! $this->client->auth()->isConnected()) {
            return ['ok' => false];
        }
        if (! (new BasalamSettings($this->settings()))->get($this->tid(), 'chat_notify_admins')) {
            return ['ok' => true, 'skipped' => true];
        }
        $key = 'marketplace:basalam:chat-notify:'.$this->tid();
        if (! Cache::add($key, 1, now()->addDay())) {
            return ['ok' => true, 'throttled' => true];
        }
        $this->settings()->putState($this->tid(), 'basalam', [
            'chat_alert' => [
                'title' => __('marketplace.basalam_chat_alert_title'),
                'body' => __('marketplace.basalam_chat_alert_body'),
                'at' => now()->toIso8601String(),
            ],
        ]);
        MarketplaceLogger::info($this->tid(), 'basalam', 'chat', __('marketplace.basalam_chat_alert_body'));

        return ['ok' => true, 'notified' => 1];
    }
}
