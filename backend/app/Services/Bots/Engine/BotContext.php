<?php

namespace App\Services\Bots\Engine;

use App\Models\BotSession;
use App\Models\BotSetting;
use App\Models\User;
use App\Services\Bots\BotClient;

/** Per-update state passed through the bot flows. */
final class BotContext
{
    public function __construct(
        public BotSetting $setting,
        public BotSession $session,
        public ?BotClient $client,
        public string $chatId,
        public array $from = [],
    ) {}

    public function tenantId(): int
    {
        return (int) $this->setting->tenant_id;
    }

    public function provider(): string
    {
        return (string) $this->setting->provider;
    }

    /** @return array<string, mixed> */
    public function meta(): array
    {
        return is_array($this->setting->meta) ? $this->setting->meta : [];
    }

    public function addon(string $key): bool
    {
        return ! empty($this->meta()['addons'][$key]);
    }

    public function user(): ?User
    {
        if (! $this->session->user_id) {
            return null;
        }

        return User::query()->where('tenant_id', $this->tenantId())->find($this->session->user_id);
    }

    public function isAdmin(): bool
    {
        $ids = $this->meta()['admin_chat_ids'] ?? [];
        if (is_string($ids)) {
            $ids = preg_split('/[\s,]+/', $ids) ?: [];
        }

        return in_array($this->chatId, array_map('strval', (array) $ids), true);
    }

    public function state(): string
    {
        return (string) ($this->session->meta['state'] ?? '');
    }

    /** @return array<string, mixed> */
    public function draft(): array
    {
        $d = $this->session->meta['draft'] ?? [];

        return is_array($d) ? $d : [];
    }

    public function setState(string $state, ?array $draft = null): void
    {
        $meta = is_array($this->session->meta) ? $this->session->meta : [];
        $meta['state'] = $state;
        if ($draft !== null) {
            $meta['draft'] = $draft;
        }
        $this->session->meta = $meta;
        $this->session->save();
    }

    public function patchDraft(array $patch): void
    {
        $this->setState($this->state(), array_merge($this->draft(), $patch));
    }
}
