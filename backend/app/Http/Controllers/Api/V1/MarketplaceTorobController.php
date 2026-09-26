<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\Marketplace\Adapters\TorobAdapter;
use App\Services\Marketplace\MarketplaceAdapterRegistry;
use App\Services\Marketplace\TorobWebhookQueue;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MarketplaceTorobController extends Controller
{
    public const TRACKING_FIELDS = [
        'tracking_code', 'carrier', 'shipping_date', 'tracking_url',
        'processing_stage', 'estimated_shipping_date', 'payment_deadline', 'review_stage',
        'cancel_reason', 'payment_note', 'refund_status', 'status_explanation', 'custom_explanation',
    ];

    public function __construct(protected TorobWebhookQueue $queue) {}

    protected function tid(Request $request): int
    {
        return (int) $request->user()->tenant_id;
    }

    protected function adapter(Request $request): TorobAdapter
    {
        /** @var TorobAdapter $a */
        $a = MarketplaceAdapterRegistry::make('torob', $this->tid($request));

        return $a;
    }

    public function queue(Request $request): JsonResponse
    {
        $tid = $this->tid($request);

        return response()->json([
            'active' => $this->queue->isActive($tid),
            'pending_count' => $this->queue->pendingCount($tid),
            'pending' => $this->queue->pending($tid, 100),
            'has_token' => filled($this->adapter($request)->credentialsPublic()['webhook_token'] ?? ''),
        ]);
    }

    public function flush(Request $request): JsonResponse
    {
        return response()->json($this->queue->flush($this->tid($request), true));
    }

    public function resetToken(Request $request): JsonResponse
    {
        $this->adapter($request)->resetWebhookToken();

        return response()->json(['ok' => true]);
    }

    public function preview(Request $request): JsonResponse
    {
        $adapter = $this->adapter($request);
        $catalog = $adapter->catalog();
        $expand = $adapter->expand();
        $format = $request->query('format') === 'legacy' ? 'legacy' : 'v3';
        $result = $catalog->page(1, min(20, max(1, (int) $request->query('limit', 5))), $expand, $format === 'v3' ? 'date_updated_desc' : 'id_desc');
        $rows = array_map(
            fn ($e) => $format === 'v3' ? $adapter->productPayloadV3($e[0], $e[1], $expand) : $adapter->productPayload($e[0], $e[1], $expand),
            $result['entries'],
        );

        return response()->json(['format' => $format, 'total' => $result['total'], 'products' => $rows]);
    }

    public function orderInfo(Request $request, int $order): JsonResponse
    {
        $o = Order::query()->where('tenant_id', $this->tid($request))->findOrFail($order);
        $status = TorobAdapter::torobStatus($o);

        return response()->json([
            'torob_clid' => ($o->meta ?? [])['torob_clid'] ?? null,
            'torob_status' => $status,
            'fields' => array_merge(array_fill_keys(self::TRACKING_FIELDS, ''), array_intersect_key((array) (($o->meta ?? [])['torob'] ?? []), array_flip(self::TRACKING_FIELDS))),
            'explanation' => TorobAdapter::explanation($o, $status),
        ]);
    }

    public function saveOrderInfo(Request $request, int $order): JsonResponse
    {
        $o = Order::query()->where('tenant_id', $this->tid($request))->findOrFail($order);
        $rules = array_fill_keys(self::TRACKING_FIELDS, ['nullable', 'string', 'max:1000']);
        $rules['tracking_url'] = ['nullable', 'url', 'max:1000'];
        $data = $request->validate($rules);
        $meta = $o->meta ?? [];
        $meta['torob'] = array_filter(array_map(fn ($v) => trim((string) $v), array_intersect_key($data, $rules)), fn ($v) => $v !== '');
        $o->meta = $meta;
        $o->save();

        return $this->orderInfo($request, $order);
    }
}
