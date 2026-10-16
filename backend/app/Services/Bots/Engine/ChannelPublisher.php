<?php

namespace App\Services\Bots\Engine;

use App\Models\BotChannelPost;
use App\Models\BotSetting;
use App\Models\Product;
use App\Services\Bots\BotClientFactory;
use App\Services\Marketplace\Basalam\BasalamAuth;
use Illuminate\Support\Str;

/** Channel publisher: manual / scheduled / auto product posts, edit & delete (WP bots-channel-publisher + ProductChannelSync). */
final class ChannelPublisher
{
    public const DEFAULT_TEMPLATE = "🆕 {name}\n💰 {price}\n\n{description}";

    public static function channelId(BotSetting $s): string
    {
        return trim((string) ($s->meta['channel']['channel_id'] ?? ''));
    }

    public static function productText(Product $p, BotSetting $s): string
    {
        $tpl = trim((string) ($s->meta['channel']['template'] ?? '')) ?: self::DEFAULT_TEMPLATE;
        $desc = Str::limit(trim(strip_tags((string) ($p->short_description ?: $p->description))), 600);

        return trim(strtr($tpl, [
            '{name}' => (string) $p->name,
            '{price}' => BotFlow::money($p->storefrontPriceMinor(), (string) ($p->currency ?: 'IRT')),
            '{description}' => $desc,
            '{sku}' => (string) ($p->sku ?? ''),
        ]));
    }

    public static function draftFromProduct(BotSetting $s, Product $p, string $source = 'manual', ?\DateTimeInterface $at = null): BotChannelPost
    {
        $url = $p->slug ? BasalamAuth::siteUrl((int) $s->tenant_id).'/product/'.$p->slug : null;

        return BotChannelPost::query()->create([
            'tenant_id' => $s->tenant_id,
            'provider' => $s->provider,
            'channel_id' => self::channelId($s),
            'product_id' => $p->id,
            'text' => self::productText($p, $s),
            'media_url' => $p->image_url && str_starts_with((string) $p->image_url, 'http') ? $p->image_url : null,
            'button_text' => $url ? '🛒 خرید' : null,
            'button_url' => $url,
            'status' => 'scheduled',
            'scheduled_at' => $at ?? now(),
            'source' => $source,
        ]);
    }

    private static function markup(BotChannelPost $post): ?array
    {
        return $post->button_url ? ['inline_keyboard' => [[['text' => $post->button_text ?: 'مشاهده', 'url' => $post->button_url]]]] : null;
    }

    public static function publish(BotChannelPost $post): bool
    {
        $client = BotClientFactory::forTenant((int) $post->tenant_id, (string) $post->provider);
        if (! $client || $post->channel_id === '') {
            $post->update(['status' => 'failed', 'last_error' => 'ربات یا شناسهٔ کانال تنظیم نشده است.']);

            return false;
        }
        $payload = ['chat_id' => $post->channel_id];
        if ($m = self::markup($post)) {
            $payload['reply_markup'] = $m;
        }
        $res = $post->media_url
            ? $client->call('sendPhoto', $payload + ['photo' => $post->media_url, 'caption' => Str::limit((string) $post->text, 1000)])
            : $client->call('sendMessage', $payload + ['text' => (string) $post->text]);
        BotClientFactory::log((int) $post->tenant_id, (string) $post->provider, (string) $post->channel_id, 'channel', (string) $post->text, ! empty($res['ok']) ? 'sent' : 'failed');
        if (empty($res['ok'])) {
            $post->update(['status' => 'failed', 'last_error' => mb_substr((string) json_encode($res['body'] ?? null, JSON_UNESCAPED_UNICODE), 0, 1000)]);

            return false;
        }
        $post->update([
            'status' => 'published',
            'published_at' => now(),
            'message_id' => (string) data_get($res, 'body.result.message_id', ''),
            'last_error' => null,
        ]);

        return true;
    }

    public static function edit(BotChannelPost $post): bool
    {
        if ($post->status !== 'published' || ! $post->message_id) {
            return false;
        }
        $client = BotClientFactory::forTenant((int) $post->tenant_id, (string) $post->provider);
        if (! $client) {
            return false;
        }
        $payload = ['chat_id' => $post->channel_id, 'message_id' => (int) $post->message_id];
        if ($m = self::markup($post)) {
            $payload['reply_markup'] = $m;
        }
        $res = $post->media_url
            ? $client->call('editMessageCaption', $payload + ['caption' => Str::limit((string) $post->text, 1000)])
            : $client->call('editMessageText', $payload + ['text' => (string) $post->text]);
        if (empty($res['ok'])) {
            $post->update(['last_error' => mb_substr((string) json_encode($res['body'] ?? null, JSON_UNESCAPED_UNICODE), 0, 1000)]);
        }

        return ! empty($res['ok']);
    }

    public static function remove(BotChannelPost $post): bool
    {
        if ($post->status === 'published' && $post->message_id) {
            $client = BotClientFactory::forTenant((int) $post->tenant_id, (string) $post->provider);
            $res = $client?->call('deleteMessage', ['chat_id' => $post->channel_id, 'message_id' => (int) $post->message_id]);
            if (empty($res['ok'])) {
                $post->update(['last_error' => 'حذف از کانال ممکن نشد.']);

                return false;
            }
        }
        $post->update(['status' => 'deleted']);

        return true;
    }

    public static function publishDue(int $limit = 20): int
    {
        $n = 0;
        BotChannelPost::query()->where('status', 'scheduled')->where('scheduled_at', '<=', now())->orderBy('scheduled_at')->limit($limit)->get()
            ->each(function ($p) use (&$n) {
                $n += self::publish($p) ? 1 : 0;
            });

        return $n;
    }

    /** Auto-post newly published products (meta.channel.auto_new_products) and sync price/text edits of published auto posts. */
    public static function onProductSaved(Product $p): void
    {
        $settings = BotSetting::query()->where('tenant_id', $p->tenant_id)->where('enabled', true)->get()
            ->filter(fn ($s) => ! empty($s->meta['addons']['channel_publish']) && self::channelId($s) !== '');
        if ($settings->isEmpty()) {
            return;
        }
        $isPublic = $p->status === 'publish' && ! $p->is_hidden;
        $becamePublic = $isPublic && ($p->wasRecentlyCreated || ($p->wasChanged('status') && $p->getOriginal('status') !== 'publish'));
        foreach ($settings as $s) {
            $existing = BotChannelPost::query()->where('tenant_id', $p->tenant_id)->where('provider', $s->provider)->where('product_id', $p->id)
                ->whereIn('status', ['scheduled', 'published'])->orderByDesc('id')->first();
            if ($becamePublic && ! empty($s->meta['channel']['auto_new_products']) && ! $existing) {
                $delay = max(0, (int) ($s->meta['channel']['auto_delay_minutes'] ?? 0));
                self::draftFromProduct($s, $p, 'auto', now()->addMinutes($delay));

                continue;
            }
            if ($existing && ! empty($s->meta['channel']['sync_edits']) && $p->wasChanged(['name', 'price_minor', 'sale_price_minor', 'short_description', 'description'])) {
                $existing->update(['text' => self::productText($p, $s)]);
                if ($existing->status === 'published') {
                    self::edit($existing);
                }
            }
        }
    }
}
