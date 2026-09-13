<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderNote;
use App\Models\OrderReturn;
use App\Models\Product;
use App\Models\User;
use App\Services\Orders\OrderWriter;
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
            ->with(['items.product', 'user:id,name,email', 'creator:id,name']);

        if ($request->boolean('mine')) {
            $q->where('created_by', $request->user()->id);
        }
        if ($request->filled('status')) {
            $q->where('status', $request->query('status'));
        }
        if ($search = $request->query('search')) {
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

        $statsQ = clone $q;
        $stats = [
            'order_count' => (clone $statsQ)->count(),
            'revenue' => (int) (clone $statsQ)->whereIn('status', ['paid', 'processing', 'shipped', 'completed'])->sum('total_minor'),
            'pending' => (clone $statsQ)->where('status', 'pending_payment')->count(),
            'processing' => (clone $statsQ)->where('status', 'processing')->count(),
            'completed' => (clone $statsQ)->where('status', 'completed')->count(),
        ];
        $stats['aov'] = $stats['order_count'] > 0 ? (int) round($stats['revenue'] / max(1, $stats['completed'] + $stats['processing'])) : 0;

        $statusCounts = Order::query()
            ->where('tenant_id', $tid)
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

        return response()->json([
            'data' => $paginator->items(),
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
        return response()->json([
            'data' => [
                'statuses' => Order::STATUSES,
                'payment_tenders' => ['cash', 'card_to_card', 'pos_terminal', 'online', 'wallet', 'other'],
                'sales_channels' => ['in_store', 'phone', 'bale', 'eitaa', 'rubika', 'telegram', 'instagram', 'other', 'online'],
            ],
        ]);
    }

    public function show(Request $request, int $order): \Illuminate\Http\JsonResponse
    {
        $row = $this->find($request, $order);

        return response()->json([
            'data' => $row->load(['items.product', 'items.variant', 'user:id,name,email', 'creator:id,name', 'notes.user:id,name', 'returns']),
        ]);
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
            'customer_phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'customer_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'customer_note' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'payment_tender' => ['sometimes', 'nullable', 'string', 'max:64'],
            'printed_at' => ['sometimes', 'nullable', 'date'],
        ]);
        $row->update($data);

        return response()->json(['data' => $row->fresh()->load(['items.product', 'user'])]);
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
            'action' => ['required', 'string', 'in:change_status,trash'],
            'status' => ['required_if:action,change_status', 'string', Rule::in(Order::STATUSES)],
        ]);

        $q = Order::query()->where('tenant_id', $tid)->whereIn('id', $data['ids']);
        if ($data['action'] === 'trash') {
            $q->delete();
        } else {
            $q->update(['status' => $data['status']]);
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

        return response()->json(['data' => $ret], 201);
    }

    public function returnsAction(Request $request, int $returnId): \Illuminate\Http\JsonResponse
    {
        $ret = OrderReturn::query()->where('tenant_id', $request->user()->tenant_id)->whereKey($returnId)->firstOrFail();
        $data = $request->validate([
            'action' => ['required', 'string', 'in:approve,reject,receive,refund'],
            'admin_note' => ['nullable', 'string'],
            'refund_minor' => ['nullable', 'integer', 'min:0'],
        ]);
        $map = [
            'approve' => 'approved',
            'reject' => 'rejected',
            'receive' => 'received',
            'refund' => 'refunded',
        ];
        $ret->update([
            'status' => $map[$data['action']],
            'admin_note' => $data['admin_note'] ?? $ret->admin_note,
            'refund_minor' => $data['refund_minor'] ?? $ret->refund_minor,
        ]);
        if ($data['action'] === 'refund') {
            $order = $ret->order;
            $order?->update(['status' => 'refunded']);
        }

        return response()->json(['data' => $ret->fresh()]);
    }

    public function printReceipt(Request $request, int $order): \Illuminate\Http\JsonResponse
    {
        $row = $this->find($request, $order);
        $row->update(['printed_at' => now()]);
        $row->load(['items', 'user']);

        return response()->json([
            'data' => [
                'order' => $row,
                'html' => $this->receiptHtml($row),
            ],
        ]);
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
        return response()->json([
            'data' => [
                ['id' => 'zarinpal', 'label' => 'Zarinpal'],
                ['id' => 'digipay', 'label' => 'Digipay'],
                ['id' => 'card_to_card', 'label' => 'Card to card'],
                ['id' => 'wallet', 'label' => 'Wallet'],
            ],
        ]);
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
        ]);
    }

    protected function receiptHtml(Order $order): string
    {
        $lines = '';
        foreach ($order->items as $item) {
            $name = e($item->product_name ?? 'Item');
            $lines .= "<tr><td>{$name}</td><td>{$item->quantity}</td><td>{$item->unit_price_minor}</td></tr>";
        }
        $num = e($order->number ?? (string) $order->id);
        $total = $order->total_minor;

        return "<html><body dir='rtl'><h2>رسید {$num}</h2><table border='1' cellpadding='6'><thead><tr><th>کالا</th><th>تعداد</th><th>قیمت</th></tr></thead><tbody>{$lines}</tbody></table><p>جمع: {$total}</p></body></html>";
    }
}
