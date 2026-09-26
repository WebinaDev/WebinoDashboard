<?php

namespace App\Services\Marketplace\Basalam;

use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplaceLogger;
use App\Services\Marketplace\MarketplaceSettingsService;
use Illuminate\Support\Str;

/**
 * Basalam order webhook registration (port of WebhookService): one webhook carrying events 3/5/7
 * with a `token` request header; partial or stale registrations are removed.
 */
class BasalamWebhooks
{
    public function __construct(
        protected int $tenantId,
        protected BasalamClient $client,
    ) {}

    public static function for(int $tenantId): self
    {
        return new self($tenantId, BasalamClient::for($tenantId));
    }

    protected function settings(): MarketplaceSettingsService
    {
        return app(MarketplaceSettingsService::class);
    }

    public static function url(int $tenantId): string
    {
        return BasalamAuth::siteUrl($tenantId).'/api/v1/public/marketplace/basalam/webhook';
    }

    /** Header token Basalam echoes back; generated on first use. */
    public function headerToken(): string
    {
        $token = (string) ($this->settings()->credentials($this->tenantId, 'basalam')['webhook_token'] ?? '');
        if ($token === '') {
            $token = Str::random(40);
            $this->settings()->patchCredentials($this->tenantId, 'basalam', ['webhook_token' => $token]);
        }

        return $token;
    }

    public function canRegister(): bool
    {
        $host = strtolower((string) parse_url(self::url($this->tenantId), PHP_URL_HOST));

        return $host !== '' && ! in_array($host, ['localhost', '127.0.0.1'], true) && ! str_ends_with($host, '.local') && ! str_ends_with($host, '.test');
    }

    /** @return list<array<string, mixed>> */
    public function list(): array
    {
        $res = $this->client->get(BasalamEndpoints::WEBHOOKS);
        $data = $res['data'] ?? $res;

        return is_array($data) && array_is_list($data) ? array_values(array_filter($data, 'is_array')) : [];
    }

    /**
     * Create or update the webhook for events 3/5/7; delete partial matches.
     *
     * @return array{ok: bool, webhook_id: ?int, action: string}
     */
    public function setup(): array
    {
        if (! $this->canRegister()) {
            MarketplaceLogger::warning($this->tenantId, 'basalam', 'webhook', 'Webhook not registered for a local host');

            return ['ok' => false, 'webhook_id' => null, 'action' => 'skipped_local'];
        }

        $target = BasalamEndpoints::WEBHOOK_EVENT_IDS;
        $correct = null;
        $stale = [];
        foreach ($this->list() as $hook) {
            $ids = array_values(array_filter(array_map(fn ($e) => is_array($e) ? (int) ($e['id'] ?? 0) : (int) $e, (array) ($hook['events'] ?? $hook['event_ids'] ?? []))));
            $overlap = array_intersect($ids, $target);
            if ($overlap === []) {
                continue;
            }
            if (count(array_unique($overlap)) === count($target) && $correct === null) {
                $correct = (int) ($hook['id'] ?? 0);
            } else {
                $stale[] = (int) ($hook['id'] ?? 0);
            }
        }
        foreach (array_unique(array_filter($stale)) as $id) {
            $this->delete($id);
        }

        $body = [
            'event_ids' => $target,
            'request_headers' => json_encode(['token' => $this->headerToken()]),
            'request_method' => 'POST',
            'url' => self::url($this->tenantId),
            'is_active' => true,
        ];

        if ($correct) {
            $this->client->patch(BasalamEndpoints::WEBHOOKS.'/'.$correct, $body);
            $id = $correct;
            $action = 'updated';
        } else {
            $res = $this->client->post(BasalamEndpoints::WEBHOOKS, $body + ['register_me' => true]);
            $id = (int) ($res['id'] ?? data_get($res, 'data.id') ?? 0) ?: null;
            $action = 'created';
        }

        $this->settings()->putState($this->tenantId, 'basalam', [
            'webhook_id' => $id,
            'webhook_registered_at' => now()->toIso8601String(),
        ]);
        MarketplaceLogger::info($this->tenantId, 'basalam', 'webhook', 'Webhook '.$action, ['webhook_id' => $id]);

        return ['ok' => true, 'webhook_id' => $id, 'action' => $action];
    }

    /** New header token then re-register. */
    public function rotate(): array
    {
        $this->settings()->patchCredentials($this->tenantId, 'basalam', ['webhook_token' => Str::random(40)]);

        return $this->setup();
    }

    public function delete(int $webhookId): bool
    {
        if ($webhookId < 1) {
            return false;
        }
        try {
            $this->client->delete(BasalamEndpoints::WEBHOOKS.'/'.$webhookId);
        } catch (MarketplaceException $e) {
            if ($e->status !== 404) {
                MarketplaceLogger::warning($this->tenantId, 'basalam', 'webhook', 'Webhook delete failed: '.$e->getMessage());

                return false;
            }
        }
        $state = $this->settings()->state($this->tenantId, 'basalam');
        if ((int) ($state['webhook_id'] ?? 0) === $webhookId) {
            $this->settings()->putState($this->tenantId, 'basalam', ['webhook_id' => null]);
        }

        return true;
    }

    public function verifyToken(?string $given): bool
    {
        $expected = (string) ($this->settings()->credentials($this->tenantId, 'basalam')['webhook_token'] ?? '');

        return $expected !== '' && is_string($given) && $given !== '' && hash_equals($expected, trim($given));
    }
}
