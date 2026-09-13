<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BotCampaign;
use App\Models\BotImportedContact;
use App\Models\BotSession;
use App\Models\BotSetting;
use App\Services\Bots\BotClientFactory;
use App\Services\Bots\BroadcastService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

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
                'webhook_secret' => $row->webhook_secret,
                'webhook_url' => url('/api/v1/public/bots/'.$provider.'/webhook'),
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
        $secret = $request->query('secret') ?? $request->header('X-Bot-Secret');
        $payload = $request->all();

        $message = $payload['message'] ?? $payload['edited_message'] ?? null;
        $chatId = data_get($message, 'chat.id') ?? data_get($payload, 'chat.id');
        if (! $chatId) {
            return response()->json(['ok' => true, 'ignored' => true]);
        }

        $setting = BotSetting::query()
            ->where('provider', $provider)
            ->where('enabled', true)
            ->when($secret, fn ($q) => $q->where('webhook_secret', $secret))
            ->first();

        if (! $setting) {
            // Fallback: match by secret alone if provided
            if ($secret) {
                $setting = BotSetting::query()
                    ->where('provider', $provider)
                    ->where('webhook_secret', $secret)
                    ->first();
            }
        }

        if (! $setting) {
            return response()->json(['ok' => false, 'message' => 'Unknown bot'], 404);
        }

        BotSession::query()->updateOrCreate(
            [
                'tenant_id' => $setting->tenant_id,
                'provider' => $provider,
                'chat_id' => (string) $chatId,
            ],
            [
                'last_seen_at' => now(),
                'meta' => [
                    'from' => data_get($message, 'from'),
                    'text' => data_get($message, 'text'),
                ],
            ]
        );

        BotClientFactory::log(
            $setting->tenant_id,
            $provider,
            (string) $chatId,
            'text',
            (string) data_get($message, 'text', ''),
            'received',
            'in'
        );

        return response()->json(['ok' => true]);
    }

    protected function assertProvider(string $provider): void
    {
        abort_unless(in_array($provider, ['bale', 'telegram'], true), 404);
    }
}
