<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Product;
use App\Services\Orders\OrderDocumentRenderer;
use App\Services\Orders\OrderDocumentSettings;
use App\Support\OrderAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OrderDocumentController extends Controller
{
    public const LABEL_PRINTED_META = 'shipping_label_printed_at';

    public function print(Request $request, int $order): JsonResponse
    {
        $type = (string) $request->query('type', 'receipt');
        if (! in_array($type, OrderDocumentRenderer::ORDER_TYPES, true)) {
            return response()->json(['message' => __('order_documents.invalid_type')], 400);
        }
        $renderer = $this->renderer($request);
        if (! $renderer->enabled($type)) {
            return response()->json(['message' => __('order_documents.disabled')], 400);
        }

        $owned = Order::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->whereKey($order);
        app(OrderAccess::class)->scopeOwned($owned, $request->user());
        $row = $owned->firstOrFail();
        if ($type === 'receipt') {
            $row->update(['printed_at' => now()]);
        }
        $html = $renderer->render($row, $type);
        if ($type === 'label') {
            $this->markLabelPrinted($row);
        }

        return response()->json(['data' => ['order' => $row, 'type' => $type, 'html' => $html]]);
    }

    public function labels(Request $request): JsonResponse
    {
        $renderer = $this->renderer($request);
        if (! $renderer->enabled('label')) {
            return response()->json(['message' => __('order_documents.disabled')], 400);
        }

        $orders = app(OrderAccess::class)->scopeOwned(
            Order::query()
                ->where('tenant_id', $request->user()->tenant_id)
                ->whereIn('status', ['paid', 'processing', 'on_hold']),
            $request->user()
        )
            ->orderBy('created_at')
            ->limit(200)
            ->get()
            ->filter(fn (Order $o) => empty(($o->meta ?? [])[self::LABEL_PRINTED_META]))
            ->take(50)
            ->values();

        if ($orders->isEmpty()) {
            return response()->json(['data' => ['count' => 0, 'order_ids' => [], 'html' => '']]);
        }

        $html = $renderer->renderLabels($orders);
        $orders->each(fn (Order $o) => $this->markLabelPrinted($o));

        return response()->json(['data' => [
            'count' => $orders->count(),
            'order_ids' => $orders->pluck('id')->all(),
            'html' => $html,
        ]]);
    }

    public function productLabels(Request $request): JsonResponse
    {
        $renderer = $this->renderer($request);
        if (! $renderer->enabled('product_label')) {
            return response()->json(['message' => __('order_documents.disabled')], 400);
        }

        $raw = $request->query('ids', []);
        $ids = collect(is_array($raw) ? $raw : explode(',', (string) $raw))
            ->map(fn ($v) => (int) $v)
            ->filter(fn ($v) => $v > 0)
            ->unique()
            ->take(200)
            ->values();

        $products = Product::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->whereIn('id', $ids)
            ->with('variants')
            ->get()
            ->sortBy(fn (Product $p) => $ids->search($p->id))
            ->values();
        if ($products->isEmpty()) {
            return response()->json(['message' => __('order_documents.no_products')], 404);
        }

        return response()->json(['data' => ['count' => $products->count(), 'html' => $renderer->renderProductLabels($products)]]);
    }

    protected function renderer(Request $request): OrderDocumentRenderer
    {
        $locale = OrderDocumentSettings::locale((string) $request->query('locale', 'fa'));
        app()->setLocale($locale);

        return new OrderDocumentRenderer((int) $request->user()->tenant_id, $locale, $this->assetBase($request));
    }

    protected function assetBase(Request $request): string
    {
        foreach ([$request->header('Origin'), $request->header('Referer'), config('app.frontend_url')] as $candidate) {
            $parts = is_string($candidate) ? parse_url($candidate) : false;
            if (is_array($parts) && isset($parts['scheme'], $parts['host']) && in_array($parts['scheme'], ['http', 'https'], true)) {
                return $parts['scheme'].'://'.$parts['host'].(isset($parts['port']) ? ':'.$parts['port'] : '');
            }
        }

        return '';
    }

    protected function markLabelPrinted(Order $order): void
    {
        $meta = is_array($order->meta) ? $order->meta : [];
        $meta[self::LABEL_PRINTED_META] = now()->toIso8601String();
        $order->forceFill(['meta' => $meta])->save();
    }
}
