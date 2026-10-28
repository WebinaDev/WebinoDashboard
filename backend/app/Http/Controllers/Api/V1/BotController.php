<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BotCampaign;
use App\Models\BotImportedContact;
use App\Models\BotMessageLog;
use App\Models\BotSession;
use App\Models\BotSetting;
use App\Services\Bots\BotClientFactory;
use App\Services\Bots\BroadcastService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class BotController extends Controller
{
    public function __construct(protected BroadcastService $broadcasts) {}

    public function settings(Request $request, string $provider): \Illuminate\Http\JsonResponse
    {
        $this->assertProvider($provider);
        $tid = $request->user()->tenant_id;
        $row = BotSetting::query()->firstOrCreate(
            ['tenant_id' => $tid, 'provider' => $provider],
            ['enabled' => false, 'webhook_secret' => Str::random(32)]
        );

        return response()->json([
            'data' => [
                'provider' => $provider,
                'enabled' => $row->enabled,
                'token' => $row->token ? '••••••••' : '',
                'has_token' => filled($row->token),
                'has_webhook_secret' => filled($row->webhook_secret),
                // Clients must send X-Bot-Secret; query ?secret= is no longer accepted.
                'webhook_url' => url('/api/v1/public/bots/'.$provider.'/webhook'),
                'webhook_secret_header' => 'X-Bot-Secret',
                'meta' => $row->meta ?? [],
            ],
        ]);
    }

    public function updateSettings(Request $request, string $provider): \Illuminate\Http\JsonResponse
    {
        $this->assertProvider($provider);
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'enabled' => ['nullable', 'boolean'],
            'token' => ['nullable', 'string', 'max:512'],
            'webhook_secret' => ['nullable', 'string', 'max:128'],
            'meta' => ['nullable', 'array'],
        ]);

        $row = BotSetting::query()->firstOrCreate(
            ['tenant_id' => $tid, 'provider' => $provider],
            ['webhook_secret' => Str::random(32)]
        );

        $patch = [];
        if (array_key_exists('enabled', $data)) {
            $patch['enabled'] = (bool) $data['enabled'];
        }
        if (! empty($data['token']) && ! str_contains($data['token'], '•')) {
            $patch['token'] = $data['token'];
        }
        if (array_key_exists('webhook_secret', $data) && filled($data['webhook_secret'])) {
            $patch['webhook_secret'] = $data['webhook_secret'];
        }
        if (array_key_exists('meta', $data)) {
            $patch['meta'] = $data['meta'];
        }
        $row->update($patch);
        if (isset($patch['token'])) {
            // Cache bot username for the site widget / deep links (best-effort).
            $me = BotClientFactory::make($provider, (string) $patch['token'])->call('getMe', []);
            $username = (string) data_get($me, 'body.result.username', '');
            if ($username !== '') {
                $row->update(['meta' => array_merge($row->meta ?? [], ['bot_username' => $username])]);
            }
        }

        return $this->settings($request, $provider);
    }

    public function sessions(Request $request, string $provider): \Illuminate\Http\JsonResponse
    {
        $this->assertProvider($provider);
        $tid = $request->user()->tenant_id;
        $q = BotSession::query()->where('tenant_id', $tid)->where('provider', $provider)->orderByDesc('last_seen_at');
        if ($search = $request->query('search')) {
            $like = '%'.$search.'%';
            $q->where(function ($w) use ($like) {
                $w->where('chat_id', 'like', $like);
            });
        }
        $perPage = min(100, max(1, (int) $request->query('per_page', 50)));
        $paginator = $q->paginate($perPage);

        return response()->json([
            'data' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function logs(Request $request, string $provider): \Illuminate\Http\JsonResponse
    {
        $this->assertProvider($provider);
        $q = BotMessageLog::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->where('provider', $provider)
            ->orderByDesc('id');
        if (in_array($direction = (string) $request->query('direction', ''), ['in', 'out'], true)) {
            $q->where('direction', $direction);
        }
        if ($status = (string) $request->query('status', '')) {
            $q->where('status', $status);
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $like = '%'.$search.'%';
            $q->where(function ($w) use ($like) {
                $w->where('chat_id', 'like', $like)->orWhere('payload', 'like', $like);
            });
        }
        $perPage = min(100, max(1, (int) $request->query('per_page', 20)));
        $paginator = $q->paginate($perPage, ['id', 'chat_id', 'direction', 'type', 'payload', 'status', 'created_at']);

        return response()->json([
            'data' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function send(Request $request, string $provider): \Illuminate\Http\JsonResponse
    {
        $this->assertProvider($provider);
        $data = $request->validate([
            'chat_id' => ['required', 'string', 'max:128'],
            'type' => ['nullable', 'string', 'in:text,photo,video,voice,document'],
            'text' => ['nullable', 'string'],
            'media' => ['nullable', 'string'],
        ]);
        $client = BotClientFactory::forTenant($request->user()->tenant_id, $provider);
        if (! $client) {
            return response()->json(['message' => 'Bot not configured'], 422);
        }
        $type = $data['type'] ?? 'text';
        $res = $client->sendMessage($data['chat_id'], $type, (string) ($data['text'] ?? ''), $data['media'] ?? null);
        BotClientFactory::log(
            $request->user()->tenant_id,
            $provider,
            $data['chat_id'],
            $type,
            (string) ($data['text'] ?? ''),
            ($res['ok'] ?? false) ? 'sent' : 'failed'
        );

        return response()->json(['data' => $res], ($res['ok'] ?? false) ? 200 : 422);
    }

    public function broadcast(Request $request, string $provider): \Illuminate\Http\JsonResponse
    {
        $this->assertProvider($provider);
        $job = $this->broadcasts->currentJob($request->user()->tenant_id, $provider);

        return response()->json([
            'data' => [
                'job' => $job,
                'advanced_media' => true,
                'campaigns_feature' => true,
            ],
        ]);
    }

    public function broadcastStart(Request $request, string $provider): \Illuminate\Http\JsonResponse
    {
        $this->assertProvider($provider);
        $data = $request->validate([
            'type' => ['nullable', 'string', 'in:text,photo,video,voice,document'],
            'text' => ['nullable', 'string'],
            'media' => ['nullable', 'string'],
            'segment' => ['nullable', 'string', 'in:all,buyers,never_bought,recent,vip,inactive_30'],
            'campaign_id' => ['nullable', 'integer'],
        ]);
        $job = $this->broadcasts->start($request->user()->tenant_id, $provider, $data);

        return response()->json(['data' => ['ok' => true, 'job' => $job]]);
    }

    public function broadcastCancel(Request $request, string $provider): \Illuminate\Http\JsonResponse
    {
        $this->assertProvider($provider);
        $job = $this->broadcasts->cancel($request->user()->tenant_id, $provider);

        return response()->json(['data' => ['ok' => true, 'job' => $job]]);
    }

    public function campaigns(Request $request, string $provider): \Illuminate\Http\JsonResponse
    {
        $this->assertProvider($provider);
        $items = BotCampaign::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->where('provider', $provider)
            ->orderByDesc('id')
            ->limit(100)
            ->get()
            ->map(fn (BotCampaign $c) => [
                'id' => $c->id,
                'name' => $c->name,
                'status' => $c->status,
                'scheduled_at' => $c->scheduled_at?->timestamp,
                'sent' => $c->sent,
                'failed' => $c->failed,
                'audience' => $c->audience,
                'type' => $c->type,
            ]);

        return response()->json([
            'data' => [
                'enabled' => true,
                'items' => $items,
            ],
        ]);
    }

    public function campaignsStore(Request $request, string $provider): \Illuminate\Http\JsonResponse
    {
        $this->assertProvider($provider);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'scheduled_at' => ['required'],
            'type' => ['nullable', 'string', 'in:text,photo,video,voice,document'],
            'text' => ['nullable', 'string'],
            'media' => ['nullable', 'string'],
            'audience' => ['nullable', 'string', 'in:all,imported'],
            'user_ids' => ['nullable', 'array'],
            'launch_now' => ['nullable', 'boolean'],
        ]);

        $scheduled = is_numeric($data['scheduled_at'])
            ? \Carbon\Carbon::createFromTimestamp((int) $data['scheduled_at'])
            : \Carbon\Carbon::parse($data['scheduled_at']);

        $campaign = BotCampaign::query()->create([
            'tenant_id' => $request->user()->tenant_id,
            'provider' => $provider,
            'name' => $data['name'],
            'status' => 'scheduled',
            'scheduled_at' => $scheduled,
            'type' => $data['type'] ?? 'text',
            'text' => $data['text'] ?? '',
            'media' => $data['media'] ?? null,
            'audience' => $data['audience'] ?? 'all',
            'user_ids' => $data['user_ids'] ?? null,
        ]);

        if ($request->boolean('launch_now') || $scheduled->isPast()) {
            $job = $this->broadcasts->start($request->user()->tenant_id, $provider, [
                'type' => $campaign->type,
                'text' => $campaign->text,
                'media' => $campaign->media,
                'segment' => 'all',
                'campaign_id' => $campaign->id,
            ]);
            $campaign->update(['status' => 'running']);

            return response()->json(['data' => ['ok' => true, 'campaign_id' => $campaign->id, 'job' => $job]], 201);
        }

        return response()->json(['data' => ['ok' => true, 'campaign_id' => $campaign->id]], 201);
    }

    public function importUsers(Request $request, string $provider): \Illuminate\Http\JsonResponse
    {
        $this->assertProvider($provider);
        $data = $request->validate([
            'csv' => ['nullable', 'string'],
            'rows' => ['nullable', 'array'],
            'rows.*.chat_id' => ['nullable', 'string'],
            'rows.*.phone' => ['nullable', 'string'],
            'rows.*.name' => ['nullable', 'string'],
        ]);

        $tid = $request->user()->tenant_id;
        $imported = 0;

        $rows = $data['rows'] ?? [];
        if (! empty($data['csv'])) {
            foreach (preg_split("/\r\n|\n|\r/", $data['csv']) as $line) {
                $line = trim($line);
                if ($line === '' || str_starts_with(strtolower($line), 'chat_id')) {
                    continue;
                }
                $parts = str_getcsv($line);
                $rows[] = [
                    'chat_id' => $parts[0] ?? null,
                    'phone' => $parts[1] ?? null,
                    'name' => $parts[2] ?? null,
                ];
            }
        }

        foreach ($rows as $row) {
            if (empty($row['chat_id']) && empty($row['phone'])) {
                continue;
            }
            BotImportedContact::query()->create([
                'tenant_id' => $tid,
                'provider' => $provider,
                'chat_id' => $row['chat_id'] ?? null,
                'phone' => $row['phone'] ?? null,
                'name' => $row['name'] ?? null,
            ]);
            if (! empty($row['chat_id'])) {
                BotSession::query()->updateOrCreate(
                    ['tenant_id' => $tid, 'provider' => $provider, 'chat_id' => (string) $row['chat_id']],
                    ['last_seen_at' => now()]
                );
            }
            $imported++;
        }

        return response()->json(['data' => ['ok' => true, 'imported' => $imported]]);
    }

    public function webhook(Request $request, string $provider): \Illuminate\Http\JsonResponse
    {
        $this->assertProvider($provider);
        // Prefer header only — query ?secret= leaks into access logs and Referer.
        $secret = trim((string) ($request->header('X-Bot-Secret') ?? ''));
        $payload = $request->all();

        $callback = is_array($payload['callback_query'] ?? null) ? $payload['callback_query'] : null;
        $message = $payload['message'] ?? $payload['edited_message'] ?? ($callback['message'] ?? null);
        $chatId = data_get($message, 'chat.id') ?? data_get($payload, 'chat.id') ?? data_get($payload, 'pre_checkout_query.from.id');
        if ($secret === '' || ! $chatId) {
            return response()->json(['ok' => false, 'message' => 'Unknown bot'], 404);
        }

        $setting = BotSetting::query()
            ->where('provider', $provider)
            ->where('enabled', true)
            ->where('webhook_secret', $secret)
            ->first();

        if (! $setting) {
            return response()->json(['ok' => false, 'message' => 'Unknown bot'], 404);
        }

        $inbound = $callback ? 'callback:'.(string) ($callback['data'] ?? '') : (string) data_get($message, 'text', data_get($message, 'caption', ''));
        BotClientFactory::log(
            $setting->tenant_id,
            $provider,
            (string) $chatId,
            $callback ? 'callback' : (isset($message['contact']) ? 'contact' : (isset($message['photo']) ? 'photo' : 'text')),
            mb_substr($inbound, 0, 2000),
            'received',
            'in'
        );

        try {
            app(\App\Services\Bots\Engine\BotEngine::class)->handle($setting, $payload);
        } catch (\Throwable $e) {
            // Always 200 so the platform does not redeliver the same update forever.
            report($e);
        }

        return response()->json(['ok' => true]);
    }

    // ---------- Channel publisher ----------

    public function channelPosts(Request $request, string $provider): \Illuminate\Http\JsonResponse
    {
        $this->assertProvider($provider);
        $rows = \App\Models\BotChannelPost::query()->where('tenant_id', $request->user()->tenant_id)->where('provider', $provider)
            ->where('status', '!=', 'deleted')->orderByDesc('id')->paginate(min(100, max(1, (int) $request->query('per_page', 20))));

        return response()->json(['data' => $rows->items(), 'meta' => ['total' => $rows->total(), 'current_page' => $rows->currentPage(), 'last_page' => $rows->lastPage()]]);
    }

    public function channelPostStore(Request $request, string $provider): \Illuminate\Http\JsonResponse
    {
        $this->assertProvider($provider);
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'product_id' => ['nullable', 'integer'],
            'text' => ['nullable', 'string', 'max:4000'],
            'media_url' => ['nullable', 'url', 'max:1024'],
            'button_text' => ['nullable', 'string', 'max:64'],
            'button_url' => ['nullable', 'url', 'max:1024'],
            'scheduled_at' => ['nullable', 'date'],
            'publish_now' => ['nullable', 'boolean'],
        ]);
        $setting = BotSetting::query()->where('tenant_id', $tid)->where('provider', $provider)->firstOrFail();
        if (\App\Services\Bots\Engine\ChannelPublisher::channelId($setting) === '') {
            return response()->json(['message' => 'شناسهٔ کانال در تنظیمات ربات ثبت نشده است.'], 422);
        }
        if (! empty($data['product_id'])) {
            $product = \App\Models\Product::query()->where('tenant_id', $tid)->findOrFail((int) $data['product_id']);
            $post = \App\Services\Bots\Engine\ChannelPublisher::draftFromProduct($setting, $product, 'manual', isset($data['scheduled_at']) ? \Illuminate\Support\Carbon::parse($data['scheduled_at']) : null);
            $post->update(array_filter(['text' => $data['text'] ?? null, 'media_url' => $data['media_url'] ?? null, 'button_text' => $data['button_text'] ?? null, 'button_url' => $data['button_url'] ?? null]));
        } else {
            if (blank($data['text'] ?? null) && blank($data['media_url'] ?? null)) {
                return response()->json(['message' => 'متن یا تصویر پست الزامی است.', 'errors' => ['text' => ['متن یا تصویر پست الزامی است.']]], 422);
            }
            $post = \App\Models\BotChannelPost::query()->create([
                'tenant_id' => $tid, 'provider' => $provider, 'channel_id' => \App\Services\Bots\Engine\ChannelPublisher::channelId($setting),
                'text' => $data['text'] ?? null, 'media_url' => $data['media_url'] ?? null,
                'button_text' => $data['button_text'] ?? null, 'button_url' => $data['button_url'] ?? null,
                'status' => 'scheduled', 'scheduled_at' => isset($data['scheduled_at']) ? \Illuminate\Support\Carbon::parse($data['scheduled_at']) : now(),
            ]);
        }
        if (! empty($data['publish_now']) || ($post->scheduled_at && $post->scheduled_at->lte(now()) && empty($data['scheduled_at']))) {
            \App\Services\Bots\Engine\ChannelPublisher::publish($post);
        }

        return response()->json(['data' => $post->fresh()], 201);
    }

    public function channelPostUpdate(Request $request, string $provider, int $post): \Illuminate\Http\JsonResponse
    {
        $this->assertProvider($provider);
        $row = \App\Models\BotChannelPost::query()->where('tenant_id', $request->user()->tenant_id)->where('provider', $provider)->findOrFail($post);
        $data = $request->validate([
            'text' => ['nullable', 'string', 'max:4000'],
            'button_text' => ['nullable', 'string', 'max:64'],
            'button_url' => ['nullable', 'url', 'max:1024'],
            'scheduled_at' => ['nullable', 'date'],
        ]);
        $row->fill(array_intersect_key($data, array_flip(['text', 'button_text', 'button_url'])));
        if (isset($data['scheduled_at']) && $row->status !== 'published') {
            $row->scheduled_at = \Illuminate\Support\Carbon::parse($data['scheduled_at']);
            $row->status = 'scheduled';
        }
        $row->save();
        $synced = $row->status === 'published' ? \App\Services\Bots\Engine\ChannelPublisher::edit($row) : null;

        return response()->json(['data' => $row->fresh(), 'synced' => $synced]);
    }

    public function channelPostPublish(Request $request, string $provider, int $post): \Illuminate\Http\JsonResponse
    {
        $this->assertProvider($provider);
        $row = \App\Models\BotChannelPost::query()->where('tenant_id', $request->user()->tenant_id)->where('provider', $provider)->findOrFail($post);
        $ok = $row->status === 'published' ? true : \App\Services\Bots\Engine\ChannelPublisher::publish($row);

        return response()->json(['data' => $row->fresh()], $ok ? 200 : 422);
    }

    public function channelPostDestroy(Request $request, string $provider, int $post): \Illuminate\Http\JsonResponse
    {
        $this->assertProvider($provider);
        $row = \App\Models\BotChannelPost::query()->where('tenant_id', $request->user()->tenant_id)->where('provider', $provider)->findOrFail($post);
        $ok = \App\Services\Bots\Engine\ChannelPublisher::remove($row);

        return response()->json(['data' => $row->fresh()], $ok ? 200 : 422);
    }

    // ---------- Retry queue ----------

    public function outbox(Request $request, string $provider): \Illuminate\Http\JsonResponse
    {
        $this->assertProvider($provider);
        $q = \App\Models\BotOutboundMessage::query()->where('tenant_id', $request->user()->tenant_id)->where('provider', $provider);
        if (in_array($status = (string) $request->query('status', ''), ['pending', 'sent', 'dead'], true)) {
            $q->where('status', $status);
        }
        $rows = $q->orderByDesc('id')->paginate(50, ['id', 'chat_id', 'method', 'status', 'attempts', 'last_error', 'next_attempt_at', 'created_at']);

        return response()->json(['data' => $rows->items(), 'meta' => ['total' => $rows->total()]]);
    }

    public function outboxRetry(Request $request, string $provider, int $message): \Illuminate\Http\JsonResponse
    {
        $this->assertProvider($provider);
        $row = \App\Models\BotOutboundMessage::query()->where('tenant_id', $request->user()->tenant_id)->where('provider', $provider)->findOrFail($message);
        $row->update(['status' => 'pending', 'attempts' => 0, 'next_attempt_at' => now()]);
        \App\Services\Bots\Engine\BotMessenger::retryDue(10);

        return response()->json(['data' => $row->fresh()]);
    }

    // ---------- Site widget (public) ----------

    public function widget(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->attributes->get('public_tenant_id');
        $out = [];
        foreach (BotSetting::query()->where('tenant_id', $tid)->where('enabled', true)->get() as $s) {
            $meta = $s->meta ?? [];
            if (empty($meta['addons']['site_widget'])) {
                continue;
            }
            $username = ltrim((string) (($meta['widget']['username'] ?? '') ?: ($meta['bot_username'] ?? '')), '@');
            if ($username === '') {
                continue;
            }
            $out[] = [
                'provider' => $s->provider,
                'url' => ($s->provider === 'bale' ? 'https://ble.ir/' : 'https://t.me/').$username,
                'greeting' => (string) ($meta['widget']['greeting'] ?? ''),
                'position' => in_array($meta['widget']['position'] ?? '', ['bottom-left', 'bottom-right'], true) ? $meta['widget']['position'] : 'bottom-left',
            ];
        }

        return response()->json(['data' => $out]);
    }

    protected function assertProvider(string $provider): void
    {
        abort_unless(in_array($provider, ['bale', 'telegram'], true), 404);
    }
}
