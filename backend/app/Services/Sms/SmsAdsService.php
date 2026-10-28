<?php

namespace App\Services\Sms;

use App\Support\Currency;
use App\Models\Category;
use App\Models\Order;
use App\Models\Product;
use App\Models\SmsAdCampaign;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * Store-local SMS / notification ad campaigns (WP Webino_Dashboard_Sms_Ads parity).
 */
class SmsAdsService
{
    public const BATCH_SIZE = 80;

    public function __construct(
        protected ModirPayamakClient $client,
        protected SmsAdsSegments $segments,
        protected SmsLocalFeatures $sms,
    ) {}

    public function handle(Tenant $tenant, Request $request, string $path): ?JsonResponse
    {
        $write = ! ($request->isMethod('get') || $request->isMethod('head'));

        if ($path === 'ads') {
            return $write ? $this->create($tenant, $request) : $this->index($tenant);
        }

        if ($path === 'ads/preview-segment' && $write) {
            return $this->previewSegment($tenant, $request);
        }

        if ($path === 'ads/quote' && $write) {
            return $this->quote($tenant, $request);
        }

        if (preg_match('#^ads/([a-zA-Z0-9_\-]+)$#', $path, $m) && ! $write) {
            return $this->show($tenant, $m[1]);
        }

        if (preg_match('#^ads/([a-zA-Z0-9_\-]+)/cancel$#', $path, $m) && $write) {
            return $this->cancel($tenant, $m[1]);
        }

        if (preg_match('#^ads/([a-zA-Z0-9_\-]+)/stats$#', $path, $m) && ! $write) {
            return $this->stats($tenant, $m[1]);
        }

        return null;
    }

    public function dispatchDue(int $limit = 20): int
    {
        $count = 0;
        $due = SmsAdCampaign::query()
            ->where('status', SmsAdCampaign::STATUS_SCHEDULED)
            ->where('scheduled_at', '<=', now())
            ->orderBy('scheduled_at')
            ->limit($limit)
            ->get();

        foreach ($due as $row) {
            $tenant = Tenant::query()->find($row->tenant_id);
            if (! $tenant) {
                $row->update(['status' => SmsAdCampaign::STATUS_FAILED, 'error' => 'tenant_missing']);

                continue;
            }
            $this->runSend($tenant, $row);
            $count++;
        }

        return $count;
    }

    protected function index(Tenant $tenant): JsonResponse
    {
        $items = SmsAdCampaign::query()
            ->where('tenant_id', $tenant->id)
            ->orderByDesc('id')
            ->limit(100)
            ->get()
            ->map(fn (SmsAdCampaign $row) => $this->publicRow($row))
            ->values()
            ->all();

        return $this->json(['ok' => true, 'items' => $items]);
    }

    protected function show(Tenant $tenant, string $id): JsonResponse
    {
        $row = $this->find($tenant, $id);
        if (! $row) {
            return $this->json(['ok' => false, 'message' => 'کمپین پیدا نشد.'], 404);
        }

        return $this->json(['ok' => true, 'campaign' => $this->publicRow($row)]);
    }

    protected function previewSegment(Tenant $tenant, Request $request): JsonResponse
    {
        $segment = (string) $request->input('segment', '');
        $data = $this->segments->resolve((int) $tenant->id, $segment, ['include_phones' => false]);

        return $this->json(['ok' => true, 'count' => $data['count'], 'sample' => $data['sample']]);
    }

    protected function quote(Tenant $tenant, Request $request): JsonResponse
    {
        $segment = (string) $request->input('segment', '');
        $channel = (string) $request->input('channel', 'sms');
        if (! in_array($channel, ['sms', 'notification'], true)) {
            $channel = 'sms';
        }
        $message = trim((string) $request->input('message', 'preview'));
        $preview = $this->segments->resolve((int) $tenant->id, $segment, ['include_phones' => false]);
        $count = (int) ($preview['count'] ?? 0);
        if ($count < 1) {
            return $this->json(['ok' => false, 'message' => 'در این بخش مخاطبی نیست.'], 400);
        }

        $dummy = array_fill(0, min($count, 5), '09120000000');
        $payload = [
            'sending_type' => 'webservice',
            'from_number' => '',
            'message' => $message !== '' ? $message : 'preview',
            'channel' => $channel,
            'recipient_count' => $count,
            'params' => ['recipients' => $dummy],
        ];
        $res = $this->client->post($tenant, 'send/calculate-price', $payload);
        if (! ($res['ok'] ?? false) || ! is_array($res['data'] ?? null)) {
            $msg = is_array($res['data'] ?? null)
                ? (string) ($res['data']['message'] ?? 'برآورد هزینه ناموفق بود.')
                : 'برآورد هزینه ناموفق بود.';

            return $this->json(['ok' => false, 'message' => $msg, 'unavailable' => true], 502);
        }
        $data = $res['data'];
        $unit = (float) ($data['price_per_unit'] ?? 0);
        $cost = (float) ($data['customer_cost'] ?? 0);
        if ($count > 5 && $unit > 0 && $channel !== 'notification') {
            $parts = (int) ($data['parts'] ?? 0);
            if ($parts > 0 && $parts < $count) {
                $cost = round($cost * ($count / $parts), 2);
            }
        }
        if ($channel === 'notification' && $unit > 0) {
            $cost = (float) ($data['customer_cost'] ?? ($unit * $count));
        }

        return $this->json([
            'ok' => true,
            'recipient_count' => $count,
            'sample' => $preview['sample'] ?? [],
            'customer_cost' => $cost,
            'cost_before_discount' => (float) ($data['cost_before_discount'] ?? $cost),
            'discount_percent' => (float) ($data['discount_percent'] ?? 0),
            'price_per_unit' => $unit,
            'price_list' => (float) ($data['price_list'] ?? 0),
            'volume_tiers' => $data['volume_tiers'] ?? [],
            'channel' => $channel,
            'balance' => $this->accountBalance($tenant),
        ]);
    }

    protected function create(Tenant $tenant, Request $request): JsonResponse
    {
        $name = mb_substr(trim((string) $request->input('name', '')), 0, 16);
        if ($name === '') {
            return $this->json(['ok' => false, 'message' => 'نام کمپین الزامی است.'], 400);
        }
        $segment = (string) $request->input('segment', '');
        if (! isset(SmsAdsSegments::segmentKeys()[$segment])) {
            return $this->json(['ok' => false, 'message' => 'گروه هدف نامعتبر است.'], 400);
        }
        $channel = (string) $request->input('channel', 'sms');
        if (! in_array($channel, ['sms', 'notification'], true)) {
            $channel = 'sms';
        }
        $message = trim((string) $request->input('message', ''));
        if ($message === '') {
            return $this->json(['ok' => false, 'message' => 'متن پیام الزامی است.'], 400);
        }

        $scheduledAt = $this->parseSchedule($request);
        $tomorrow = Carbon::now(SmsLocalFeatures::DEFAULT_TIMEZONE)->startOfDay()->addDay();
        if ($scheduledAt->lt($tomorrow)) {
            $scheduledAt = $tomorrow->copy()->addHour();
        }

        $preview = $this->segments->resolve((int) $tenant->id, $segment, [
            'include_phones' => true,
            'limit' => SmsAdsSegments::CAP,
        ]);
        $phones = isset($preview['phones']) && is_array($preview['phones']) ? $preview['phones'] : [];
        if ($phones === []) {
            return $this->json(['ok' => false, 'message' => 'در این بخش مخاطبی نیست.'], 400);
        }

        $publicId = 'smsad_'.Str::lower(Str::random(10));
        $utm = 'smsad_'.$publicId;
        $row = new SmsAdCampaign([
            'tenant_id' => $tenant->id,
            'public_id' => $publicId,
            'name' => $name,
            'segment' => $segment,
            'channel' => $channel,
            'message' => $message,
            'product_id' => (int) $request->input('product_id', 0),
            'category_id' => (int) $request->input('category_id', 0),
            'content_type' => (string) $request->input('content_type', 'product') ?: 'product',
            'coupon_code' => mb_substr(trim((string) $request->input('coupon_code', '')), 0, 64) ?: null,
            'scheduled_at' => $scheduledAt,
            'status' => SmsAdCampaign::STATUS_SCHEDULED,
            'recipient_count' => count($phones),
            'phones' => $phones,
            'sent' => 0,
            'failed' => 0,
            'cost' => (float) $request->input('quoted_cost', 0),
            'bulk_ids' => [],
            'utm_campaign' => $utm,
            'created_by' => $request->user()?->id,
            'error' => null,
        ]);
        $row->message = $this->stampMessage($tenant, $row->message, $row);
        $row->save();

        return $this->json(['ok' => true, 'campaign' => $this->publicRow($row)], 201);
    }

    protected function cancel(Tenant $tenant, string $id): JsonResponse
    {
        $row = $this->find($tenant, $id);
        if (! $row) {
            return $this->json(['ok' => false, 'message' => 'کمپین پیدا نشد.'], 404);
        }
        if (in_array($row->status, [SmsAdCampaign::STATUS_SENT, SmsAdCampaign::STATUS_SENDING, SmsAdCampaign::STATUS_CANCELLED], true)) {
            return $this->json(['ok' => false, 'message' => 'این کمپین قابل لغو نیست.'], 400);
        }
        $row->update(['status' => SmsAdCampaign::STATUS_CANCELLED]);

        return $this->json(['ok' => true]);
    }

    protected function stats(Tenant $tenant, string $id): JsonResponse
    {
        $row = $this->find($tenant, $id);
        if (! $row) {
            return $this->json(['ok' => false, 'message' => 'کمپین پیدا نشد.'], 404);
        }

        $utm = (string) $row->utm_campaign;
        $revenue = 0.0;
        $ordersN = 0;
        $samples = [];
        if ($utm !== '') {
            $orders = Order::query()
                ->where('tenant_id', $tenant->id)
                ->where('utm_campaign', $utm)
                ->whereIn('status', ['paid', 'processing', 'shipped', 'completed'])
                ->orderByDesc('id')
                ->limit(100)
                ->get(['id', 'number', 'total_minor', 'currency', 'created_at']);
            foreach ($orders as $o) {
                $ordersN++;
                // SMS costs from ModirPayamak are toman; convert from the order currency.
                $totalToman = (int) round(Currency::toToman((int) ($o->total_minor ?? 0), (string) ($o->currency ?: 'IRT')));
                $revenue += $totalToman;
                if (count($samples) < 10) {
                    $samples[] = [
                        'id' => $o->id,
                        'number' => (string) ($o->number ?? $o->id),
                        'total' => $totalToman,
                        'date' => $o->created_at?->toIso8601String() ?? '',
                    ];
                }
            }
        }

        $cost = max(0.0, (float) $row->cost);
        $sent = max(0, (int) $row->sent);
        $roas = $cost > 0 ? round($revenue / $cost, 2) : null;
        $conversion = $sent > 0 ? round(($ordersN / $sent) * 100, 2) : 0.0;

        $bulkStats = [];
        $bulkIds = is_array($row->bulk_ids) ? $row->bulk_ids : [];
        foreach (array_slice($bulkIds, 0, 3) as $bid) {
            $res = $this->client->get($tenant, 'reports/bulk-stats', ['bulk_id' => (string) $bid]);
            if (! empty($res['ok'])) {
                $bulkStats[] = $res['data'] ?? $res;
            }
        }

        return $this->json([
            'ok' => true,
            'campaign' => $this->publicRow($row),
            'sent' => $sent,
            'failed' => (int) $row->failed,
            'delivered' => $sent,
            'cost' => $cost,
            'revenue' => $revenue,
            'orders' => $ordersN,
            'roas' => $roas,
            'conversion_pct' => $conversion,
            'order_samples' => $samples,
            'bulk_stats' => $bulkStats,
        ]);
    }

    public function runSend(Tenant $tenant, SmsAdCampaign $row): SmsAdCampaign
    {
        if ($row->status === SmsAdCampaign::STATUS_CANCELLED) {
            return $row;
        }
        if ($row->status === SmsAdCampaign::STATUS_SENT) {
            return $row;
        }

        $claimed = SmsAdCampaign::query()
            ->whereKey($row->id)
            ->where('status', SmsAdCampaign::STATUS_SCHEDULED)
            ->update(['status' => SmsAdCampaign::STATUS_SENDING]);
        if ($claimed === 0 && $row->status !== SmsAdCampaign::STATUS_SENDING) {
            return $row->fresh() ?? $row;
        }
        $row->refresh();

        $phones = is_array($row->phones) ? $row->phones : [];
        if ($phones === []) {
            $resolved = $this->segments->resolve((int) $tenant->id, (string) $row->segment, ['include_phones' => true]);
            $phones = $resolved['phones'] ?? [];
        }

        $sent = 0;
        $failed = 0;
        $bulkIds = is_array($row->bulk_ids) ? $row->bulk_ids : [];
        $message = (string) $row->message;
        $chunks = array_chunk($phones, self::BATCH_SIZE);

        foreach ($chunks as $chunk) {
            $payload = [
                'sending_type' => 'webservice',
                'from_number' => '',
                'message' => $message,
                'channel' => $row->channel === 'notification' ? 'notification' : 'sms',
                'params' => ['recipients' => array_values($chunk)],
            ];
            $res = $this->client->post($tenant, 'send', $payload);
            $ok = ($res['ok'] ?? false) && is_array($res['data'] ?? null) && empty($res['data']['unavailable']);
            if ($ok) {
                $sent += count($chunk);
                $bid = $res['data']['bulk_id'] ?? $res['data']['messages_outbox_id'] ?? null;
                if ($bid) {
                    $bulkIds[] = (string) $bid;
                }
            } else {
                $failed += count($chunk);
                $row->error = is_array($res['data'] ?? null)
                    ? (string) ($res['data']['message'] ?? 'send_failed')
                    : 'send_failed';
            }
        }

        $row->update([
            'status' => $failed > 0 && $sent === 0 ? SmsAdCampaign::STATUS_FAILED : SmsAdCampaign::STATUS_SENT,
            'sent' => $sent,
            'failed' => $failed,
            'bulk_ids' => $bulkIds,
            'phones' => null, // drop PII after send
            'error' => $row->error,
        ]);

        return $row->fresh() ?? $row;
    }

    protected function find(Tenant $tenant, string $id): ?SmsAdCampaign
    {
        return SmsAdCampaign::query()
            ->where('tenant_id', $tenant->id)
            ->where('public_id', $id)
            ->first();
    }

    /** @return array<string, mixed> */
    public function publicRow(SmsAdCampaign $row): array
    {
        return [
            'id' => $row->public_id,
            'name' => $row->name,
            'segment' => $row->segment,
            'channel' => $row->channel,
            'message' => $row->message,
            'product_id' => (int) $row->product_id,
            'category_id' => (int) $row->category_id,
            'content_type' => $row->content_type,
            'coupon_code' => $row->coupon_code,
            'scheduled_at' => $row->scheduled_at?->getTimestamp() ?? 0,
            'status' => $row->status,
            'recipient_count' => (int) $row->recipient_count,
            'sent' => (int) $row->sent,
            'failed' => (int) $row->failed,
            'cost' => (float) $row->cost,
            'utm_campaign' => $row->utm_campaign,
            'created_at' => $row->created_at?->getTimestamp() ?? 0,
            'error' => $row->error,
        ];
    }

    protected function stampMessage(Tenant $tenant, string $message, SmsAdCampaign $row): string
    {
        $root = $tenant->domain ? 'https://'.ltrim((string) $tenant->domain, '/') : rtrim((string) config('app.frontend_url', config('app.url')), '/');
        $url = $root.'/';
        if ($row->product_id) {
            $p = Product::query()->where('tenant_id', $tenant->id)->find($row->product_id);
            if ($p && $p->slug) {
                $url = $root.'/product/'.rawurlencode((string) $p->slug);
            }
        } elseif ($row->category_id) {
            $c = Category::query()->where('tenant_id', $tenant->id)->find($row->category_id);
            if ($c && $c->slug) {
                $url = $root.'/shop?category='.rawurlencode((string) $c->slug);
            }
        }
        $sep = str_contains($url, '?') ? '&' : '?';
        $url .= $sep.'utm_source=sms&utm_medium=sms_ad&utm_campaign='.rawurlencode((string) $row->utm_campaign);

        $msg = $message;
        if (! str_contains($msg, $url) && ! str_contains($msg, '{link}')) {
            $msg .= "\n".$url;
        } else {
            $msg = str_replace('{link}', $url, $msg);
        }
        $code = (string) ($row->coupon_code ?? '');
        if ($code !== '') {
            $msg = str_replace('{coupon}', $code, $msg);
            if (! str_contains($msg, $code)) {
                $msg .= "\n".$code;
            }
        }

        return $msg;
    }

    protected function parseSchedule(Request $request): Carbon
    {
        $tz = SmsLocalFeatures::DEFAULT_TIMEZONE;
        if ($request->filled('scheduled_at') && is_numeric($request->input('scheduled_at'))) {
            return Carbon::createFromTimestamp((int) $request->input('scheduled_at'), $tz);
        }
        $raw = (string) $request->input('schedule', '');
        if ($raw !== '') {
            try {
                return Carbon::parse($raw, $tz);
            } catch (\Throwable) {
                // fall through
            }
        }

        return Carbon::now($tz)->startOfDay()->addDay()->addHour();
    }

    protected function accountBalance(Tenant $tenant): float
    {
        $acc = $this->client->get($tenant, 'account');
        if (! ($acc['ok'] ?? false) || ! is_array($acc['data'] ?? null)) {
            return 0.0;
        }
        $data = $acc['data'];
        $account = is_array($data['account'] ?? null) ? $data['account'] : $data;

        return (float) ($account['balance'] ?? 0);
    }

    /** @param  array<string, mixed>  $payload */
    protected function json(array $payload, int $status = 200): JsonResponse
    {
        return response()->json($payload, $status);
    }
}
