<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderNote;
use App\Models\OrderReturn;
use App\Models\Product;
use App\Models\User;
use App\Services\Geo\IranGeoService;
use App\Services\Marketplace\MarketplacePlatforms;
use App\Services\Notifications\NotificationDispatcher;
use App\Services\Orders\OrderWriter;
use App\Services\Shipping\TapinShipmentService;
use App\Services\Wallet\WalletService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OrderController extends Controller
{
    public function __construct(protected OrderWriter $writer) {}

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $q = Order::query()
            ->where('tenant_id', $tid)
            ->with(['items.product', 'user:id,name,email,role', 'creator:id,name']);
        $this->applyOrderIndexFilters($q, $request);

        $paidStatuses = \App\Services\Reports\OrderReports::salesStatuses();
        $statsQ = clone $q;
        $paidCount = (clone $statsQ)->whereIn('status', $paidStatuses)->count();
        $paidRevenue = (int) (clone $statsQ)->whereIn('status', $paidStatuses)->sum('total_minor');
        $stats = [
            'order_count' => (clone $statsQ)->count(),
            'revenue' => $paidRevenue,
            'pending' => (clone $statsQ)->where('status', 'pending_payment')->count(),
            'processing' => (clone $statsQ)->where('status', 'processing')->count(),
            'completed' => (clone $statsQ)->where('status', 'completed')->count(),
            'aov' => $paidCount > 0 ? (int) round($paidRevenue / $paidCount) : 0,
        ];

        $countsQ = Order::query()->where('tenant_id', $tid);
        $this->applyOrderIndexFilters($countsQ, $request, excludeStatus: true);
        $statusCounts = (clone $countsQ)
            ->selectRaw('status, count(*) as c')
            ->groupBy('status')
            ->pluck('c', 'status');

        $sort = $request->query('sort', 'id');
        $dir = $request->query('dir', 'desc') === 'asc' ? 'asc' : 'desc';
        if (in_array($sort, ['id', 'created_at', 'total_minor', 'status', 'number'], true)) {
            $q->orderBy($sort, $dir);
        } else {
            $q->orderByDesc('id');
        }

        $perPage = min(100, max(1, (int) $request->query('per_page', 20)));
        $paginator = $q->paginate($perPage);
        $items = array_map(fn (Order $order) => $this->enrichOrderListRow($order), $paginator->items());

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'stats' => $stats,
                'status_counts' => $statusCounts,
            ],
        ]);
    }

    public function statuses(): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => Order::STATUSES]);
    }

    public function filterOptions(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $shippingMethods = Order::query()
            ->where('tenant_id', $tid)
            ->whereNotNull('meta')
            ->limit(500)
            ->get(['meta'])
            ->map(function (Order $o) {
                $meta = is_array($o->meta) ? $o->meta : [];

                return $meta['shipping_title'] ?? $meta['shipping_method_id'] ?? null;
            })
            ->filter()
            ->unique()
            ->values()
            ->all();

        $provinces = [];
        try {
            foreach (app(IranGeoService::class)->states() as $code => $name) {
                $provinces[] = ['code' => (string) $code, 'name' => (string) $name];
            }
        } catch (\Throwable) {
            $provinces = [];
        }

        $utmColumn = fn (string $col) => Order::query()
            ->where('tenant_id', $tid)
            ->whereNotNull($col)
            ->where($col, '!=', '')
            ->distinct()
            ->orderBy($col)
            ->limit(100)
            ->pluck($col)
            ->values()
            ->all();

        return response()->json([
            'data' => [
                'statuses' => Order::STATUSES,
                'payment_tenders' => ['cash', 'card_to_card', 'pos_terminal', 'online', 'wallet', 'other'],
                'sales_channels' => array_merge(
                    ['in_store', 'phone', 'bale', 'eitaa', 'rubika', 'telegram', 'instagram', 'other', 'online'],
                    MarketplacePlatforms::slugs()
                ),
                'marketplaces' => MarketplacePlatforms::slugs(),
                'shipping_methods' => $shippingMethods,
                'provinces' => $provinces,
                'customer_roles' => ['customer', 'partner', 'staff', 'admin'],
                'email_types' => ['status', 'invoice', 'shipping', 'reminder'],
                'utm_sources' => $utmColumn('utm_source'),
                'utm_mediums' => $utmColumn('utm_medium'),
                'utm_campaigns' => $utmColumn('utm_campaign'),
                'gateways' => $this->paymentGatewayOptions(),
            ],
        ]);
    }

    public function show(Request $request, int $order): \Illuminate\Http\JsonResponse
    {
        $row = $this->find($request, $order);
        $row->load(['items.product', 'items.variant', 'user:id,name,email,phone,wallet_balance_minor', 'creator:id,name', 'notes.user:id,name', 'returns']);
        $payload = $row->toArray();
        $payload['tracking_code'] = $row->trackingCode();
        $payload['tracking_url'] = $row->trackingUrl();
        $payload['next_statuses'] = \App\Services\Orders\OrderStatusTransitions::nextStatuses((string) $row->status);
        $payload['status_label'] = \App\Services\Orders\OrderShippingStatuses::label((string) $row->status);
        $payload['status_history'] = is_array($row->meta['status_history'] ?? null) ? $row->meta['status_history'] : [];
        if ($row->user_id) {
            $payload['customer_recent_orders'] = Order::query()
                ->where('tenant_id', $row->tenant_id)
                ->where('user_id', $row->user_id)
                ->where('id', '!=', $row->id)
                ->orderByDesc('id')
                ->limit(5)
                ->get(['id', 'number', 'status', 'total_minor', 'created_at']);
        }

        return response()->json(['data' => $payload]);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $this->validateOrderPayload($request, $tid, false);
        $order = $this->writer->create($tid, $data, $request->user());

        return response()->json(['data' => $order], 201);
    }

    public function update(Request $request, int $order): \Illuminate\Http\JsonResponse
    {
        $row = $this->find($request, $order);
        $data = $request->validate([
            'status' => ['sometimes', 'string', Rule::in(Order::STATUSES)],
            'shipping_address' => ['sometimes', 'nullable'],
            'billing_address' => ['sometimes', 'nullable'],
            'customer_phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'customer_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'customer_note' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'payment_tender' => ['sometimes', 'nullable', 'string', 'max:64'],
            'printed_at' => ['sometimes', 'nullable', 'date'],
            'tracking_code' => ['sometimes', 'nullable', 'string', 'max:128'],
            'tracking_url' => ['sometimes', 'nullable', 'string', 'max:2048'],
        ]);
        $locked = in_array($row->status, ['completed', 'refunded', 'cancelled', 'failed', 'webino-deleted'], true);
        if ($locked) {
            $allowed = array_intersect_key($data, array_flip(['status', 'printed_at', 'tracking_code', 'tracking_url']));
            if (count($allowed) !== count($data)) {
                return response()->json(['message' => 'Order is locked', 'errors' => ['status' => ['Order is locked']]], 422);
            }
            $data = $allowed;
        }
        if (isset($data['status']) && $data['status'] !== $row->status) {
            if (! \App\Services\Orders\OrderStatusTransitions::canTransition((string) $row->status, (string) $data['status'])) {
                return response()->json([
                    'message' => 'Invalid status transition',
                    'errors' => ['status' => ['Transition not allowed']],
                ], 422);
            }
        }
        $meta = is_array($row->meta) ? $row->meta : [];
        if (array_key_exists('tracking_code', $data)) {
            $meta['tracking_code'] = $data['tracking_code'];
            unset($data['tracking_code']);
        }
        if (array_key_exists('tracking_url', $data)) {
            $meta['tracking_url'] = $data['tracking_url'];
            unset($data['tracking_url']);
        }
        if ($meta !== (is_array($row->meta) ? $row->meta : [])) {
            $data['meta'] = $meta;
        }
        $statusChanged = isset($data['status']) && $data['status'] !== $row->status;
        $row->update($data);
        if ($statusChanged) {
            app(TapinShipmentService::class)->maybeAutoRegister($row->fresh());
        }

        $fresh = $row->fresh()->load(['items.product', 'user']);
        $payload = $fresh->toArray();
        $payload['tracking_code'] = $fresh->trackingCode();
        $payload['tracking_url'] = $fresh->trackingUrl();
        $payload['next_statuses'] = \App\Services\Orders\OrderStatusTransitions::nextStatuses((string) $fresh->status);
        $payload['status_label'] = \App\Services\Orders\OrderShippingStatuses::label((string) $fresh->status);

        return response()->json(['data' => $payload]);
    }

    public function rewrite(Request $request, int $order): \Illuminate\Http\JsonResponse
    {
        $row = $this->find($request, $order);
        $data = $this->validateOrderPayload($request, $row->tenant_id, true);
        $updated = $this->writer->rewrite($row, $data);

        return response()->json(['data' => $updated]);
    }

    public function destroy(Request $request, int $order): \Illuminate\Http\JsonResponse
    {
        $row = $this->find($request, $order);
        $row->delete();

        return response()->json([], 204);
    }

    public function bulk(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer'],
            'action' => ['required', 'string', 'in:change_status,trash,delete,send_email,send_sms'],
            'status' => ['required_if:action,change_status', 'string', Rule::in(Order::STATUSES)],
            'email_type' => ['required_if:action,send_email', 'string', 'in:status,invoice,shipping,reminder'],
        ]);

        $q = Order::query()->where('tenant_id', $tid)->whereIn('id', $data['ids']);
        if ($data['action'] === 'trash' || $data['action'] === 'delete') {
            $q->delete();
        } elseif ($data['action'] === 'change_status') {
            foreach ($q->get() as $order) {
                $order->update(['status' => $data['status']]);
            }
        } elseif ($data['action'] === 'send_email') {
            foreach ($q->get() as $order) {
                try {
                    app(\App\Services\Orders\OrderStatusNotifier::class)->notify(
                        $order,
                        (string) $order->status,
                        (string) $order->status,
                        ['email_type' => $data['email_type'] ?? 'status', 'force' => true, 'email_only' => true]
                    );
                } catch (\Throwable) {
                }
            }
        } elseif ($data['action'] === 'send_sms') {
            foreach ($q->get() as $order) {
                try {
                    app(\App\Services\Orders\OrderStatusNotifier::class)->notify(
                        $order,
                        (string) $order->status,
                        (string) $order->status,
                        ['force' => true, 'sms_only' => true]
                    );
                } catch (\Throwable) {
                }
            }
        }

        return response()->json(['data' => ['ok' => true]]);
    }

    public function notesIndex(Request $request, int $order): \Illuminate\Http\JsonResponse
    {
        $row = $this->find($request, $order);

        return response()->json(['data' => $row->notes()->with('user:id,name')->get()]);
    }

    public function notesStore(Request $request, int $order): \Illuminate\Http\JsonResponse
    {
        $row = $this->find($request, $order);
        $data = $request->validate([
            'body' => ['required', 'string', 'max:5000'],
            'is_customer' => ['nullable', 'boolean'],
        ]);
        $note = OrderNote::query()->create([
            'tenant_id' => $row->tenant_id,
            'order_id' => $row->id,
            'user_id' => $request->user()->id,
            'body' => $data['body'],
            'is_customer' => $data['is_customer'] ?? false,
        ]);

        return response()->json(['data' => $note->load('user:id,name')], 201);
    }

    public function notesDestroy(Request $request, int $note): \Illuminate\Http\JsonResponse
    {
        $row = OrderNote::query()->where('tenant_id', $request->user()->tenant_id)->whereKey($note)->firstOrFail();
        $row->delete();

        return response()->json([], 204);
    }

    public function returnsIndex(Request $request, int $order): \Illuminate\Http\JsonResponse
    {
        $row = $this->find($request, $order);

        return response()->json(['data' => $row->returns()->get()]);
    }

    public function returnsStore(Request $request, int $order): \Illuminate\Http\JsonResponse
    {
        $row = $this->find($request, $order);
        $data = $request->validate([
            'reason' => ['nullable', 'string'],
            'items' => ['nullable', 'array'],
            'refund_minor' => ['nullable', 'integer', 'min:0'],
        ]);
        $ret = OrderReturn::query()->create([
            'tenant_id' => $row->tenant_id,
            'order_id' => $row->id,
            'user_id' => $request->user()->id,
            'status' => 'requested',
            'reason' => $data['reason'] ?? null,
            'items' => $data['items'] ?? null,
            'refund_minor' => $data['refund_minor'] ?? null,
        ]);
        $this->notifyReturn($row, $ret, 'return_requested');

        return response()->json(['data' => $ret], 201);
    }

    private function notifyReturn(Order $order, OrderReturn $ret, string $event): void
    {
        try {
            app(NotificationDispatcher::class)->dispatch($event, (int) $order->tenant_id, [
                'vars' => [
                    'order_number' => (string) ($order->number ?? $order->id),
                    'customer_name' => (string) ($order->customer_name ?? ''),
                    'status' => (string) $ret->status,
                    'return_reason' => (string) ($ret->reason ?? ''),
                ],
                'customer_user_id' => $order->user_id ? (int) $order->user_id : null,
                'customer_email' => (string) ($order->customer_email ?? ''),
                'customer_phone' => (string) ($order->customer_phone ?? ''),
                'customer_link' => '/dashboard/account/orders/'.$order->id,
                'admin_link' => '/dashboard/orders/'.$order->id,
            ]);
        } catch (\Throwable) {
        }
    }

    public function returnsAction(Request $request, int $returnId): \Illuminate\Http\JsonResponse
    {
        $ret = OrderReturn::query()->where('tenant_id', $request->user()->tenant_id)->whereKey($returnId)->firstOrFail();
        $data = $request->validate([
            'action' => ['required', 'string', 'in:approve,reject,receive,refund,exchange'],
            'admin_note' => ['nullable', 'string'],
            'refund_minor' => ['nullable', 'integer', 'min:0'],
        ]);
        $current = (string) $ret->status;
        $allowed = match ($data['action']) {
            'approve' => ['requested'],
            'reject' => ['requested', 'approved'],
            'receive' => ['approved'],
            'refund', 'exchange' => ['parcel_received', 'received'],
            default => [],
        };
        if (! in_array($current, $allowed, true)) {
            return response()->json([
                'message' => 'Invalid return transition',
                'errors' => ['action' => ["Cannot {$data['action']} from status {$current}"]],
            ], 422);
        }
        $map = [
            'approve' => 'approved',
            'reject' => 'rejected',
            'receive' => 'parcel_received',
            'refund' => 'refunded',
            'exchange' => 'exchanged',
        ];
        $ret->update([
            'status' => $map[$data['action']],
            'admin_note' => $data['admin_note'] ?? $ret->admin_note,
            'refund_minor' => $data['refund_minor'] ?? $ret->refund_minor,
        ]);
        if (in_array($data['action'], ['approve', 'reject'], true)) {
            $returnOrder = $ret->order()->first();
            if ($returnOrder) {
                $this->notifyReturn($returnOrder, $ret, $data['action'] === 'approve' ? 'return_approved' : 'return_rejected');
            }
        }
        if ($data['action'] === 'refund') {
            $order = $ret->order()->first();
            $order?->update(['status' => 'refunded']);
            $refundMinor = (int) ($ret->refund_minor ?? 0);
            if ($order && $refundMinor > 0) {
                $tender = (string) ($order->payment_tender ?? '');
                $provider = (string) ($order->payment_provider ?? '');
                $walletPaid = $tender === 'wallet' || $provider === 'wallet';
                if ($walletPaid && $order->user_id) {
                    $customer = User::query()->whereKey($order->user_id)->first();
                    if ($customer) {
                        app(WalletService::class)->adjust(
                            $customer,
                            (int) $order->tenant_id,
                            'credit',
                            $refundMinor,
                            'order_refund',
                            'Refund for order return #'.$ret->id,
                            'order_return',
                            (int) $ret->id
                        );
                    }
                } else {
                    $note = trim((string) ($ret->admin_note ?? ''));
                    if (! str_contains($note, 'needs_manual_refund')) {
                        $ret->update([
                            'admin_note' => $note === '' ? 'needs_manual_refund' : $note."\nneeds_manual_refund",
                        ]);
                    }
                }
            }
        }

        return response()->json(['data' => $ret->fresh()]);
    }

    public function posSearch(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $q = trim((string) $request->query('q', ''));
        $query = Product::query()
            ->where('tenant_id', $tid)
            ->where('status', 'publish')
            ->with('variants');
        if ($q !== '') {
            $like = '%'.$q.'%';
            $query->where(function ($w) use ($like, $q) {
                $w->where('name', 'like', $like)
                    ->orWhere('sku', 'like', $like)
                    ->orWhere('slug', 'like', $like);
                if (ctype_digit($q)) {
                    $w->orWhere('id', (int) $q);
                }
            });
        }

        return response()->json(['data' => $query->orderBy('name')->limit(30)->get()]);
    }

    public function posCustomers(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $q = trim((string) $request->query('q', ''));
        $users = User::query()
            ->where('tenant_id', $tid)
            ->when($q !== '', function ($w) use ($q) {
                $like = '%'.$q.'%';
                $w->where(function ($x) use ($like) {
                    $x->where('name', 'like', $like)
                        ->orWhere('email', 'like', $like);
                });
            })
            ->orderBy('name')
            ->limit(20)
            ->get(['id', 'name', 'email', 'wallet_balance_minor', 'bank_sheba']);

        return response()->json(['data' => $users]);
    }

    public function paymentGateways(): \Illuminate\Http\JsonResponse
    {
        $exclude = ['basalam_pay'];
        $data = array_values(array_filter(
            $this->paymentGatewayOptions(),
            fn (array $gw) => ! in_array($gw['id'] ?? '', $exclude, true)
        ));

        return response()->json(['data' => $data]);
    }

    protected function applyOrderIndexFilters(Builder $q, Request $request, bool $excludeStatus = false): void
    {
        if ($request->boolean('mine')) {
            $q->where('created_by', $request->user()->id);
        }
        if (! $excludeStatus && $request->filled('status')) {
            $q->where('status', $request->query('status'));
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $like = '%'.$search.'%';
            $q->where(function ($w) use ($like) {
                $w->where('number', 'like', $like)
                    ->orWhere('customer_name', 'like', $like)
                    ->orWhere('customer_phone', 'like', $like)
                    ->orWhere('customer_email', 'like', $like);
            });
        }
        if ($request->filled('payment_tender')) {
            $q->where('payment_tender', $request->query('payment_tender'));
        }
        if ($request->filled('sales_channel')) {
            $q->where('sales_channel', $request->query('sales_channel'));
        }
        if ($request->filled('date_from')) {
            $q->whereDate('created_at', '>=', $request->query('date_from'));
        }
        if ($request->filled('date_to')) {
            $q->whereDate('created_at', '<=', $request->query('date_to'));
        }
        if ($request->filled('min_total')) {
            $q->where('total_minor', '>=', (int) $request->query('min_total'));
        }
        if ($request->filled('max_total')) {
            $q->where('total_minor', '<=', (int) $request->query('max_total'));
        }
        if ($request->boolean('is_pos')) {
            $q->where('is_pos', true);
        }
        if ($request->filled('user_id')) {
            $q->where('user_id', (int) $request->query('user_id'));
        }
        if ($request->filled('customer_role')) {
            $role = (string) $request->query('customer_role');
            $q->whereHas('user', fn (Builder $u) => $u->where('role', $role));
        }
        if ($request->filled('province')) {
            $province = (string) $request->query('province');
            $q->where(function (Builder $w) use ($province) {
                $w->where('shipping_address->state', $province)
                    ->orWhere('shipping_address->province', $province)
                    ->orWhere('shipping_address->province_code', $province);
            });
        }
        if ($request->filled('shipping_method')) {
            $method = (string) $request->query('shipping_method');
            $q->where(function (Builder $w) use ($method) {
                $w->where('meta->shipping_method_id', $method)
                    ->orWhere('meta->shipping_title', $method);
            });
        }
        if ($request->filled('utm')) {
            $utm = (string) $request->query('utm');
            $like = '%'.$utm.'%';
            $q->where(function (Builder $w) use ($like) {
                $w->where('utm_source', 'like', $like)
                    ->orWhere('utm_medium', 'like', $like)
                    ->orWhere('utm_campaign', 'like', $like);
            });
        }
    }

    /** @return array<string, mixed> */
    protected function enrichOrderListRow(Order $order): array
    {
        $payload = $order->toArray();
        $addr = $this->parseShippingAddress($order);
        $meta = is_array($order->meta) ? $order->meta : [];

        $stateRaw = $addr['state'] ?? $addr['province'] ?? $addr['province_code'] ?? '';
        $province = app(IranGeoService::class)->stateName((string) $stateRaw);
        if ($province === null && is_string($stateRaw) && trim($stateRaw) !== '') {
            $province = trim($stateRaw);
        }

        $destParts = array_filter([
            is_scalar($addr['city'] ?? null) ? trim((string) $addr['city']) : '',
            is_scalar($addr['address'] ?? null) ? trim((string) $addr['address']) : '',
            is_scalar($addr['address_1'] ?? null) ? trim((string) $addr['address_1']) : '',
        ]);
        $shippingDestination = trim(implode(' · ', $destParts));

        $mapUrl = is_scalar($addr['map_url'] ?? null) ? trim((string) $addr['map_url']) : '';
        if ($mapUrl === '' && isset($addr['lat'], $addr['lng']) && is_numeric($addr['lat']) && is_numeric($addr['lng'])) {
            $mapUrl = 'https://www.google.com/maps?q='.rawurlencode((string) $addr['lat'].','.(string) $addr['lng']);
        }

        $utmParts = array_filter([
            $order->utm_source,
            $order->utm_medium,
            $order->utm_campaign,
        ], fn ($v) => is_string($v) && trim($v) !== '');

        $channel = (string) ($order->sales_channel ?? '');
        $marketplace = in_array($channel, MarketplacePlatforms::slugs(), true) ? $channel : null;

        $payload['province'] = $province;
        $payload['shipping_destination'] = $shippingDestination !== '' ? $shippingDestination : null;
        $payload['shipping_title'] = $meta['shipping_title'] ?? $meta['shipping_method_id'] ?? null;
        $payload['map_url'] = $mapUrl !== '' ? $mapUrl : null;
        $payload['gateway_title'] = $this->gatewayTitle($order->payment_provider ?? $order->payment_tender);
        $payload['utm'] = $utmParts !== [] ? implode(' / ', $utmParts) : null;
        $payload['marketplace'] = $marketplace;

        return $payload;
    }

    /** @return array<string, mixed> */
    protected function parseShippingAddress(Order $order): array
    {
        $raw = $order->getRawOriginal('shipping_address') ?? $order->shipping_address;
        $data = is_array($raw) ? $raw : (is_string($raw) ? json_decode($raw, true) : null);
        if (! is_array($data)) {
            return [];
        }

        return $data;
    }

    protected function gatewayTitle(?string $provider): ?string
    {
        if ($provider === null || trim($provider) === '') {
            return null;
        }
        $id = strtolower(trim($provider));
        foreach ($this->paymentGatewayOptions() as $gw) {
            if (($gw['id'] ?? '') === $id) {
                return (string) ($gw['label'] ?? $provider);
            }
        }

        return $provider;
    }

    /** @return list<array{id: string, label: string}> */
    protected function paymentGatewayOptions(): array
    {
        return [
            ['id' => 'zarinpal', 'label' => 'Zarinpal'],
            ['id' => 'digipay', 'label' => 'Digipay'],
            ['id' => 'snapppay', 'label' => 'SnappPay'],
            ['id' => 'torobpay', 'label' => 'TorobPay'],
            ['id' => 'card_to_card', 'label' => 'Card to card'],
            ['id' => 'wallet', 'label' => 'Wallet'],
            ['id' => 'cod', 'label' => 'Cash on delivery'],
            ['id' => 'bale_pay', 'label' => 'Bale Pay'],
            ['id' => 'basalam_pay', 'label' => 'Basalam Pay'],
        ];
    }

    protected function find(Request $request, int $order): Order
    {
        return Order::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->whereKey($order)
            ->firstOrFail();
    }

    /** @return array<string, mixed> */
    protected function validateOrderPayload(Request $request, int $tid, bool $partial): array
    {
        return $request->validate([
            'items' => [$partial ? 'sometimes' : 'required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer'],
            'items.*.product_variant_id' => ['nullable', 'integer'],
            'items.*.quantity' => ['nullable', 'integer', 'min:1'],
            'items.*.unit_price_minor' => ['nullable', 'integer', 'min:0'],
            'items.*.purchase_type' => ['nullable', 'string'],
            'items.*.product_name' => ['nullable', 'string'],
            'items.*.sku' => ['nullable', 'string'],
            'user_id' => ['nullable', 'integer', Rule::exists('users', 'id')->where('tenant_id', $tid)],
            'customer_name' => ['nullable', 'string', 'max:255'],
            'customer_phone' => ['nullable', 'string', 'max:32'],
            'customer_email' => ['nullable', 'email', 'max:255'],
            'customer_note' => ['nullable', 'string'],
            'shipping_address' => ['nullable'],
            'billing_address' => ['nullable', 'array'],
            'discount_minor' => ['nullable', 'integer', 'min:0'],
            'shipping_minor' => ['nullable', 'integer', 'min:0'],
            'amount_paid_minor' => ['nullable', 'integer', 'min:0'],
            'coupon_code' => ['nullable', 'string', 'max:64'],
            'channel' => ['nullable', 'string', 'in:site,bale,telegram'],
            'status' => ['nullable', 'string', Rule::in(Order::STATUSES)],
            'sales_channel' => ['nullable', 'string'],
            'payment_tender' => ['nullable', 'string'],
            'payment_provider' => ['nullable', 'string'],
            'is_pos' => ['nullable', 'boolean'],
            'is_pay_link' => ['nullable', 'boolean'],
            'buyer_tax' => ['nullable', 'array'],
            'currency' => ['nullable', 'string', 'max:8'],
            'meta' => ['nullable', 'array'],
            'gateways' => ['nullable', 'array'],
            'purchase_type' => ['nullable', 'string', 'in:cash,retail,credit,installment,wholesale'],
            'allow_both_types' => ['nullable', 'boolean'],
        ]);
    }
}
