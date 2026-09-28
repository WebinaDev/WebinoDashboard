<?php

namespace App\Services\Sms;

use App\Models\Order;
use App\Models\Product;
use App\Models\SmsDraft;
use App\Models\SmsNewsletterSubscriber;
use App\Models\SmsScheduledSend;
use App\Models\SmsSecretaryLog;
use App\Models\Tenant;
use App\Services\Orders\OrderStatusNotifier;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * SMS features the ERP compat layer does not provide: drafts, newsletter,
 * locally held scheduled sends, secretary processing and order notifications.
 */
class SmsLocalFeatures
{
    public const DEFAULT_TIMEZONE = 'Asia/Tehran';

    /** @var list<string> */
    protected const LIST_KEYS = ['entries', 'messages', 'data', 'items', 'list', 'outbox', 'inbox', 'numbers', 'rows', 'recipients'];

    public function __construct(
        protected ModirPayamakClient $client,
        protected OrderStatusNotifier $orders,
    ) {}

    public function handle(Tenant $tenant, Request $request, string $path): ?JsonResponse
    {
        $write = ! ($request->isMethod('get') || $request->isMethod('head'));

        if ($path === 'drafts' || str_starts_with($path, 'drafts/')) {
            return $this->drafts($tenant, $request, $path, $write);
        }

        if ($path === 'newsletter' || str_starts_with($path, 'newsletter/')) {
            return $this->newsletter($tenant, $request, $path, $write);
        }

        if ($path === 'send/cancel-scheduled') {
            return $this->cancelScheduled($tenant, $request);
        }

        if ($path === 'send/scheduled' && ! $write) {
            return $this->json(['ok' => true, 'data' => $this->pendingOutboxRows($tenant)]);
        }

        if (in_array($path, ['send', 'send/peer-to-peer'], true) && $write) {
            $at = $this->parseSendTime($request->input('send_time'), (string) $request->input('timezone', ''));
            if ($at !== null && $at->isFuture()) {
                return $this->schedule($tenant, $request, $path, $at);
            }

            return null;
        }

        if ($path === 'reports/outbox' && ! $write) {
            return $this->outboxWithScheduled($tenant, $request);
        }

        if ($path === 'secretaries/process') {
            return $this->json($this->processSecretaries($tenant));
        }

        if ($path === 'orders/notify' || $path === 'orders/test-notify') {
            return $this->orderNotify($tenant, $request, $path === 'orders/test-notify');
        }

        return null;
    }

    protected function drafts(Tenant $tenant, Request $request, string $path, bool $write): JsonResponse
    {
        if (! $write) {
            if (preg_match('#^drafts/(\d+)$#', $path, $m)) {
                $draft = SmsDraft::query()->where('tenant_id', $tenant->id)->find((int) $m[1]);

                return $draft
                    ? $this->json(['ok' => true, 'data' => $this->draftRow($draft)])
                    : $this->json(['ok' => false, 'message' => 'not_found'], 404);
            }

            $perPage = max(1, min(100, (int) $request->query('per_page', 20)));
            $page = SmsDraft::query()
                ->where('tenant_id', $tenant->id)
                ->orderByDesc('id')
                ->paginate($perPage, ['*'], 'page', max(1, (int) $request->query('page', 1)));

            return $this->json([
                'ok' => true,
                'data' => collect($page->items())->map(fn (SmsDraft $d) => $this->draftRow($d))->all(),
                'meta' => [
                    'page' => $page->currentPage(),
                    'per_page' => $page->perPage(),
                    'total' => $page->total(),
                    'last_page' => $page->lastPage(),
                ],
            ]);
        }

        if ($path === 'drafts/delete') {
            $deleted = SmsDraft::query()
                ->where('tenant_id', $tenant->id)
                ->whereKey((int) $request->input('id'))
                ->delete();

            return $deleted > 0
                ? $this->json(['ok' => true])
                : $this->json(['ok' => false, 'message' => 'not_found'], 404);
        }

        if (! in_array($path, ['drafts', 'drafts/update'], true) && ! preg_match('#^drafts/\d+$#', $path)) {
            return $this->json(['ok' => false, 'message' => 'not_found'], 404);
        }

        $body = trim((string) ($request->input('message') ?? $request->input('text') ?? $request->input('body') ?? ''));
        if ($body === '') {
            return $this->json(['ok' => false, 'message' => 'message is required', 'errors' => ['message' => ['required']]], 422);
        }

        $attrs = [
            'title' => mb_substr(trim((string) ($request->input('title') ?? $request->input('name') ?? '')), 0, 191) ?: null,
            'body' => $body,
            'recipients' => $this->recipientList($request->input('recipients')) ?: null,
        ];

        $id = preg_match('#^drafts/(\d+)$#', $path, $m) ? (int) $m[1] : (int) $request->input('id', 0);
        if ($id > 0) {
            $draft = SmsDraft::query()->where('tenant_id', $tenant->id)->find($id);
            if (! $draft) {
                return $this->json(['ok' => false, 'message' => 'not_found'], 404);
            }
            $draft->update($attrs);
        } else {
            $draft = SmsDraft::query()->create(['tenant_id' => $tenant->id] + $attrs);
        }

        return $this->json(['ok' => true, 'data' => $this->draftRow($draft)]);
    }

    /** @return array<string, mixed> */
    protected function draftRow(SmsDraft $draft): array
    {
        return [
            'id' => $draft->id,
            'title' => $draft->title,
            'message' => $draft->body,
            'body' => $draft->body,
            'recipients' => $draft->recipients ?? [],
            'created_at' => $draft->created_at?->toIso8601String(),
            'updated_at' => $draft->updated_at?->toIso8601String(),
        ];
    }

    protected function newsletter(Tenant $tenant, Request $request, string $path, bool $write): JsonResponse
    {
        if ($path === 'newsletter/subscribers' && ! $write) {
            $productId = max(0, (int) $request->query('product_id', 0));
            $query = SmsNewsletterSubscriber::query()
                ->where('tenant_id', $tenant->id)
                ->when($productId > 0, fn ($q) => $q->where('product_id', $productId))
                ->orderByDesc('id');
            $page = $query->paginate(500, ['*'], 'page', max(1, (int) $request->query('page', 1)));

            return $this->json([
                'ok' => true,
                'subscribers' => collect($page->items())->map(fn (SmsNewsletterSubscriber $s) => [
                    'id' => $s->id,
                    'phone' => $s->phone,
                    'product_id' => $s->product_id,
                    'created_at' => $s->created_at?->toIso8601String(),
                ])->all(),
                'total' => $page->total(),
                'page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
            ]);
        }

        if (! $write) {
            return $this->json(['ok' => false, 'message' => 'not_found'], 404);
        }

        if (in_array($path, ['newsletter/subscribe', 'newsletter/subscribers'], true)) {
            $phone = $this->normalizePhone((string) $request->input('phone', ''));
            if ($phone === null) {
                return $this->json(['ok' => false, 'message' => 'invalid phone', 'errors' => ['phone' => ['invalid']]], 422);
            }
            $sub = SmsNewsletterSubscriber::query()->firstOrCreate([
                'tenant_id' => $tenant->id,
                'phone' => $phone,
                'product_id' => max(0, (int) $request->input('product_id', 0)),
            ]);

            return $this->json(['ok' => true, 'subscriber' => [
                'id' => $sub->id,
                'phone' => $sub->phone,
                'product_id' => $sub->product_id,
            ]]);
        }

        if ($path === 'newsletter/unsubscribe') {
            $query = SmsNewsletterSubscriber::query()->where('tenant_id', $tenant->id);
            if ($request->filled('id')) {
                $query->whereKey((int) $request->input('id'));
            } else {
                $phone = $this->normalizePhone((string) $request->input('phone', ''));
                if ($phone === null) {
                    return $this->json(['ok' => false, 'message' => 'id or phone is required'], 422);
                }
                $query->where('phone', $phone);
                if ($request->filled('product_id')) {
                    $query->where('product_id', (int) $request->input('product_id'));
                }
            }
            $deleted = $query->delete();

            return $this->json(['ok' => $deleted > 0, 'removed' => $deleted]);
        }

        if ($path === 'newsletter/send') {
            return $this->json($this->sendNewsletter($tenant, $request));
        }

        return $this->json(['ok' => false, 'message' => 'not_found'], 404);
    }

    /** @return array<string, mixed> */
    protected function sendNewsletter(Tenant $tenant, Request $request): array
    {
        $message = trim((string) $request->input('message', ''));
        if ($message === '') {
            return ['ok' => false, 'sent' => 0, 'total' => 0, 'reason' => 'empty_message'];
        }

        $productId = max(0, (int) $request->input('product_id', 0));
        $phones = SmsNewsletterSubscriber::query()
            ->where('tenant_id', $tenant->id)
            ->when($productId > 0, fn ($q) => $q->where('product_id', $productId))
            ->pluck('phone')
            ->unique()
            ->values()
            ->all();

        if ($phones === []) {
            return ['ok' => false, 'sent' => 0, 'total' => 0, 'reason' => 'no_subscribers'];
        }

        $vars = is_array($request->input('vars')) ? $request->input('vars') : [];
        if ($productId > 0) {
            $product = Product::query()->where('tenant_id', $tenant->id)->find($productId);
            if ($product) {
                $vars += ['product_name' => (string) $product->name, 'product_id' => (string) $product->id];
            }
        }
        $vars += ['store_name' => (string) ($tenant->store_display_name ?: $tenant->name)];
        $body = $this->render($message, $vars);

        $sent = 0;
        $errors = [];
        foreach (array_chunk($phones, 100) as $chunk) {
            $res = $this->client->post($tenant, 'send', ['message' => $body, 'recipients' => $chunk]);
            if ($this->succeeded($res)) {
                $sent += count($chunk);
            } else {
                $errors[] = $this->errorMessage($res);
            }
        }

        return [
            'ok' => $sent > 0,
            'sent' => $sent,
            'total' => count($phones),
            'failed' => count($phones) - $sent,
            'errors' => array_values(array_unique($errors)),
        ];
    }

    protected function schedule(Tenant $tenant, Request $request, string $path, CarbonImmutable $at): JsonResponse
    {
        $payload = $request->except(['path', 'send_time', 'timezone', 'domain', 'license_key']);
        $recipients = $this->recipientList($payload['recipients'] ?? ($payload['phone'] ?? null));
        if ($path === 'send' && $recipients !== [] && ! isset($payload['recipients'])) {
            $payload['recipients'] = $recipients;
        }

        $row = SmsScheduledSend::query()->create([
            'tenant_id' => $tenant->id,
            'path' => $path,
            'payload' => $payload,
            'message' => isset($payload['message']) ? (string) $payload['message'] : null,
            'from_number' => isset($payload['from_number']) ? (string) $payload['from_number'] : null,
            'recipients' => $recipients,
            'send_at' => $at->utc(),
            'status' => SmsScheduledSend::STATUS_PENDING,
        ]);

        return $this->json([
            'ok' => true,
            'scheduled' => true,
            'id' => $row->id,
            'messages_outbox_id' => $row->outboxId(),
            'send_at' => $row->send_at?->toIso8601String(),
        ]);
    }

    protected function cancelScheduled(Tenant $tenant, Request $request): JsonResponse
    {
        $raw = (string) ($request->input('messages_outbox_id') ?? $request->input('outbox_id') ?? $request->input('id') ?? '');
        $id = str_starts_with($raw, SmsScheduledSend::ID_PREFIX) ? substr($raw, strlen(SmsScheduledSend::ID_PREFIX)) : $raw;

        $row = ctype_digit($id)
            ? SmsScheduledSend::query()->where('tenant_id', $tenant->id)->find((int) $id)
            : null;

        if (! $row) {
            return $this->json(['ok' => false, 'reason' => 'not_found', 'message' => 'not_found']);
        }

        if ($row->status !== SmsScheduledSend::STATUS_PENDING) {
            return $this->json(['ok' => false, 'reason' => 'not_pending', 'status' => $row->status]);
        }

        $updated = SmsScheduledSend::query()
            ->whereKey($row->id)
            ->where('status', SmsScheduledSend::STATUS_PENDING)
            ->update(['status' => SmsScheduledSend::STATUS_CANCELLED, 'processed_at' => now()]);

        return $updated > 0
            ? $this->json(['ok' => true, 'messages_outbox_id' => $row->outboxId(), 'status' => SmsScheduledSend::STATUS_CANCELLED])
            : $this->json(['ok' => false, 'reason' => 'not_pending']);
    }

    protected function outboxWithScheduled(Tenant $tenant, Request $request): JsonResponse
    {
        $result = $this->client->get($tenant, 'reports/outbox', $request->query());
        $data = is_array($result['data']) ? $result['data'] : [];
        $local = (int) $request->query('page', 1) <= 1 ? $this->pendingOutboxRows($tenant) : [];

        if ($local === []) {
            return $this->json($data, $result['status']);
        }

        if (! $this->succeeded($result)) {
            return $this->json([
                'ok' => true,
                'data' => $local,
                'crm_unavailable' => true,
                'message' => (string) ($data['message'] ?? ''),
            ]);
        }

        return $this->json($this->prependList($data, $local));
    }

    /** @return list<array<string, mixed>> */
    public function pendingOutboxRows(Tenant $tenant): array
    {
        return SmsScheduledSend::query()
            ->where('tenant_id', $tenant->id)
            ->where('status', SmsScheduledSend::STATUS_PENDING)
            ->orderBy('send_at')
            ->limit(200)
            ->get()
            ->map(function (SmsScheduledSend $row) {
                $payload = $row->payload ?? [];
                $code = (string) ($payload['code'] ?? $payload['pattern_code'] ?? '');

                return [
                    'messages_outbox_id' => $row->outboxId(),
                    'outbox_id' => $row->outboxId(),
                    'number' => $row->from_number,
                    'type' => (string) ($payload['sending_type'] ?? ($row->path === 'send/peer-to-peer' ? 'peer_to_peer' : 'webservice')),
                    'message' => $row->message ?? ($code !== '' ? 'pattern:'.$code : ''),
                    'recipients' => $row->recipients ?? [],
                    'time_send' => $row->send_at?->timestamp,
                    'state_id' => 1,
                    'status' => 'queued',
                    'local' => true,
                ];
            })
            ->all();
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  list<array<string, mixed>>  $rows
     * @return array<string, mixed>
     */
    protected function prependList(array $data, array $rows): array
    {
        foreach (self::LIST_KEYS as $key) {
            if (isset($data[$key]) && is_array($data[$key]) && array_is_list($data[$key])) {
                $data[$key] = array_merge($rows, $data[$key]);

                return $data;
            }
        }

        if (isset($data['data']) && is_array($data['data'])) {
            $data['data'] = $this->prependList($data['data'], $rows);

            return $data;
        }

        $numeric = array_values(array_filter($data, fn ($v, $k) => is_int($k) && is_array($v), ARRAY_FILTER_USE_BOTH));
        $data = array_filter($data, fn ($k) => ! is_int($k), ARRAY_FILTER_USE_KEY);
        $data['data'] = array_merge($rows, $numeric);

        return $data;
    }

    public function dispatchDue(int $limit = 100): int
    {
        $count = 0;
        $due = SmsScheduledSend::query()
            ->where('status', SmsScheduledSend::STATUS_PENDING)
            ->where('send_at', '<=', now())
            ->orderBy('send_at')
            ->limit($limit)
            ->get();

        foreach ($due as $row) {
            $claimed = SmsScheduledSend::query()
                ->whereKey($row->id)
                ->where('status', SmsScheduledSend::STATUS_PENDING)
                ->update(['status' => 'processing']);
            if ($claimed === 0) {
                continue;
            }

            $tenant = Tenant::query()->find($row->tenant_id);
            if (! $tenant) {
                $row->update(['status' => SmsScheduledSend::STATUS_FAILED, 'error' => 'tenant_missing', 'processed_at' => now()]);

                continue;
            }

            $res = $this->client->post($tenant, $row->path, $row->payload ?? []);
            $ok = $this->succeeded($res);
            $row->update([
                'status' => $ok ? SmsScheduledSend::STATUS_SENT : SmsScheduledSend::STATUS_FAILED,
                'result' => is_array($res['data']) ? $res['data'] : null,
                'error' => $ok ? null : $this->errorMessage($res),
                'processed_at' => now(),
            ]);
            $count++;
        }

        return $count;
    }

    /** @return array<string, mixed> */
    public function processSecretaries(Tenant $tenant): array
    {
        $empty = ['ok' => true, 'processed' => 0, 'matched' => 0, 'replied' => 0, 'results' => []];

        $rulesRes = $this->client->get($tenant, 'secretaries');
        if (! $this->succeeded($rulesRes)) {
            return $empty + ['reason' => 'rules_unavailable', 'message' => $this->errorMessage($rulesRes)];
        }
        $rulesData = is_array($rulesRes['data']) ? $rulesRes['data'] : [];
        $rules = $rulesData['secretaries'] ?? ($rulesData['data']['secretaries'] ?? []);
        $rules = array_values(array_filter(is_array($rules) ? $rules : [], function ($r) {
            if (! is_array($r)) {
                return false;
            }

            return ! array_key_exists('enabled', $r) || filter_var($r['enabled'], FILTER_VALIDATE_BOOLEAN);
        }));

        if ($rules === []) {
            return $empty + ['reason' => 'no_rules'];
        }

        $inboxRes = $this->client->get($tenant, 'reports/inbox', ['page' => 1, 'limit' => 100]);
        if (! $this->succeeded($inboxRes)) {
            return $empty + ['reason' => 'inbox_unavailable', 'message' => $this->errorMessage($inboxRes)];
        }
        $messages = $this->extractList(is_array($inboxRes['data']) ? $inboxRes['data'] : []);
        if ($messages === []) {
            return $empty + ['reason' => 'no_messages'];
        }

        $handled = SmsSecretaryLog::query()->where('tenant_id', $tenant->id)->pluck('inbox_id')->flip();
        $processed = 0;
        $matched = 0;
        $replied = 0;
        $results = [];

        foreach ($messages as $msg) {
            $text = (string) ($msg['message'] ?? $msg['text'] ?? $msg['body'] ?? '');
            $from = (string) ($msg['from'] ?? $msg['sender'] ?? '');
            $inboxId = (string) ($msg['messages_inbox_id'] ?? $msg['id'] ?? md5($from.'|'.$text.'|'.($msg['time'] ?? '')));
            if ($inboxId === '' || isset($handled[$inboxId])) {
                continue;
            }
            $processed++;

            $rule = collect($rules)->first(fn (array $r) => $this->ruleMatches($r, $text));
            if (! $rule) {
                continue;
            }
            $matched++;

            [$to, $reply] = $this->ruleAction($rule, $from, $text);
            $ok = false;
            $error = null;
            if ($to === '' || $reply === '') {
                $error = $to === '' ? 'no_target' : 'empty_reply';
            } else {
                $payload = ['message' => $reply, 'recipients' => [$to]];
                if (filled($rule['pattern_code'] ?? null)) {
                    $payload['pattern_code'] = (string) $rule['pattern_code'];
                    $payload['params'] = ['message' => $text, 'phone' => $from];
                }
                $res = $this->client->post($tenant, 'send', $payload);
                $ok = $this->succeeded($res);
                $error = $ok ? null : $this->errorMessage($res);
            }
            if ($ok) {
                $replied++;
            }

            SmsSecretaryLog::query()->create([
                'tenant_id' => $tenant->id,
                'inbox_id' => mb_substr($inboxId, 0, 64),
                'rule_id' => isset($rule['id']) ? (int) $rule['id'] : null,
                'phone' => $to !== '' ? mb_substr($to, 0, 32) : null,
                'ok' => $ok,
                'error' => $error,
            ]);
            $handled[$inboxId] = true;

            $results[] = [
                'inbox_id' => $inboxId,
                'rule_id' => $rule['id'] ?? null,
                'type' => $rule['type'] ?? 'auto_reply',
                'phone' => $to,
                'ok' => $ok,
                'error' => $error,
            ];
        }

        $out = ['ok' => true, 'processed' => $processed, 'matched' => $matched, 'replied' => $replied, 'results' => $results];
        if ($processed === 0) {
            $out['reason'] = 'no_new_messages';
        } elseif ($matched === 0) {
            $out['reason'] = 'no_match';
        }

        return $out;
    }

    /** @param  array<string, mixed>  $rule */
    protected function ruleMatches(array $rule, string $text): bool
    {
        $keywords = preg_split('/[,\n،]+/u', (string) ($rule['keywords'] ?? '*')) ?: [];
        foreach ($keywords as $keyword) {
            $keyword = trim($keyword);
            if ($keyword === '*') {
                return true;
            }
            if ($keyword !== '' && mb_stripos($text, $keyword) !== false) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $rule
     * @return array{0: string, 1: string}
     */
    protected function ruleAction(array $rule, string $from, string $text): array
    {
        $vars = ['message' => $text, 'phone' => $from, 'from' => $from];
        if (($rule['type'] ?? '') === 'inbox_forward') {
            $to = (string) ($this->normalizePhone((string) ($rule['forward_to'] ?? '')) ?? '');
            $body = trim((string) ($rule['reply_body'] ?? ''));

            return [$to, $body !== '' ? $this->render($body, $vars) : $from.': '.$text];
        }

        return [$from, $this->render(trim((string) ($rule['reply_body'] ?? '')), $vars)];
    }

    protected function orderNotify(Tenant $tenant, Request $request, bool $test): JsonResponse
    {
        $order = null;
        if ($request->filled('order_id')) {
            $order = Order::query()->where('tenant_id', $tenant->id)->find((int) $request->input('order_id'));
            if (! $order && ! is_array($request->input('order'))) {
                return $this->json(['ok' => false, 'results' => [], 'reason' => 'order_not_found'], 404);
            }
        }

        $input = $request->only(['event_key', 'order', 'force_customer', 'force_admin', 'role', 'phone']);
        $out = $this->orders->sendOrderSms($tenant, $order, $input, $test);
        if ($test) {
            $out['test'] = true;
        }

        return $this->json($out);
    }

    /**
     * @return list<array<string, mixed>>
     */
    protected function extractList(array $data): array
    {
        foreach (self::LIST_KEYS as $key) {
            if (isset($data[$key]) && is_array($data[$key])) {
                if (array_is_list($data[$key])) {
                    return array_values(array_filter($data[$key], 'is_array'));
                }

                return $this->extractList($data[$key]);
            }
        }

        return array_values(array_filter($data, fn ($v, $k) => is_int($k) && is_array($v), ARRAY_FILTER_USE_BOTH));
    }

    public function parseSendTime(mixed $value, string $timezone = ''): ?CarbonImmutable
    {
        if ($value === null || $value === '') {
            return null;
        }
        $tz = $timezone !== '' && in_array($timezone, timezone_identifiers_list(), true) ? $timezone : self::DEFAULT_TIMEZONE;

        try {
            $s = trim((string) $value);
            if (preg_match('/^\d{13}$/', $s)) {
                return CarbonImmutable::createFromTimestampMs((int) $s);
            }
            if (preg_match('/^\d{9,10}$/', $s)) {
                return CarbonImmutable::createFromTimestamp((int) $s);
            }
            if (preg_match('/(Z|[+-]\d{2}:?\d{2})$/i', $s)) {
                return CarbonImmutable::parse($s);
            }

            return CarbonImmutable::parse($s, $tz);
        } catch (\Throwable) {
            return null;
        }
    }

    /** @return list<string> */
    protected function recipientList(mixed $value): array
    {
        if (is_string($value)) {
            $value = preg_split('/[\s,;،]+/u', $value) ?: [];
        }
        if (! is_array($value)) {
            return [];
        }

        return array_values(array_unique(array_filter(array_map(fn ($v) => is_scalar($v) ? trim((string) $v) : '', $value))));
    }

    public function normalizePhone(string $phone): ?string
    {
        $phone = strtr($phone, [
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        ]);
        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if (str_starts_with($digits, '0098')) {
            $digits = '0'.substr($digits, 4);
        } elseif (str_starts_with($digits, '98') && strlen($digits) === 12) {
            $digits = '0'.substr($digits, 2);
        } elseif (str_starts_with($digits, '9') && strlen($digits) === 10) {
            $digits = '0'.$digits;
        }

        return strlen($digits) >= 10 && strlen($digits) <= 15 ? $digits : null;
    }

    /** @param  array<string, mixed>  $vars */
    protected function render(string $body, array $vars): string
    {
        $map = [];
        foreach ($vars as $k => $v) {
            if (is_scalar($v) || $v === null) {
                $map['{'.$k.'}'] = (string) $v;
            }
        }

        return strtr($body, $map);
    }

    /** @param  array{ok: bool, data: mixed}  $res */
    protected function succeeded(array $res): bool
    {
        return $res['ok'] && is_array($res['data']) && ($res['data']['ok'] ?? true) !== false && empty($res['data']['unavailable']);
    }

    /** @param  array{ok: bool, data: mixed}  $res */
    protected function errorMessage(array $res): string
    {
        return is_array($res['data']) ? (string) ($res['data']['message'] ?? 'send_failed') : 'send_failed';
    }

    /** @param  array<string, mixed>  $payload */
    protected function json(array $payload, int $status = 200): JsonResponse
    {
        return response()->json($payload, $status);
    }
}
