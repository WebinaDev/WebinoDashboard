<?php

namespace App\Services\Shop;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductDownload;
use App\Models\ProductDownloadLog;
use App\Services\Reports\OrderReports;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Symfony\Component\HttpFoundation\StreamedResponse;

final class ProductDownloadService
{
    public function issueToken(OrderItem $item, ProductDownload $download): string
    {
        return URL::temporarySignedRoute(
            'downloads.serve',
            now()->addMinutes(30),
            [
                'orderItem' => $item->id,
                'download' => $download->id,
            ]
        );
    }

    public function serve(Request $request, OrderItem $orderItem, ProductDownload $download): StreamedResponse|\Illuminate\Http\Response
    {
        if (! $request->hasValidSignature()) {
            abort(403, 'Invalid download link');
        }

        $order = Order::query()->findOrFail($orderItem->order_id);
        $settings = ShopSettings::getDownloads((int) $order->tenant_id);

        if ($download->product_id !== $orderItem->product_id) {
            abort(403, 'Download mismatch');
        }

        if (! empty($settings['require_login']) || $orderItem->requires_login) {
            $user = $request->user('sanctum') ?? auth('sanctum')->user();
            if (! $user || (int) $user->id !== (int) $order->user_id) {
                abort(401, 'Login required');
            }
        }

        if (! in_array($order->status, OrderReports::salesStatuses(), true)) {
            abort(403, 'Order not paid');
        }

        $limit = $download->download_limit;
        if ($limit !== null && (int) $orderItem->download_count >= (int) $limit) {
            abort(403, 'Download limit reached');
        }

        // Never follow external redirects.
        $path = (string) $download->storage_path;
        if (preg_match('#^(https?:)?//#i', $path) || str_contains($path, '..')) {
            abort(403, 'External redirect denied');
        }

        if (! Storage::disk('local')->exists($path)) {
            abort(404, 'File missing');
        }

        if (! empty($settings['count_downloads'])) {
            $orderItem->increment('download_count');
            ProductDownloadLog::query()->create([
                'tenant_id' => (int) $order->tenant_id,
                'product_id' => (int) $download->product_id,
                'order_item_id' => (int) $orderItem->id,
                'user_id' => ($request->user('sanctum') ?? auth('sanctum')->user())?->id ?? $order->user_id,
                'downloaded_at' => now(),
            ]);
        }

        $prefix = trim((string) ($settings['x_accel_prefix'] ?? ''));
        if ($prefix !== '' && ($settings['delivery_method'] ?? 'force') === 'force') {
            return response('', 200, [
                'X-Accel-Redirect' => rtrim($prefix, '/').'/'.ltrim($path, '/'),
                'Content-Type' => 'application/octet-stream',
                'Content-Disposition' => 'attachment; filename="'.($download->original_name ?: $download->name).'"',
            ]);
        }

        return Storage::disk('local')->download($path, $download->original_name ?: $download->name);
    }

    /**
     * @return list<array{id: int, name: string, url: string}>
     */
    public function linksForOrder(Order $order): array
    {
        $out = [];
        $items = OrderItem::query()->where('order_id', $order->id)->get();
        foreach ($items as $item) {
            $downloads = ProductDownload::query()
                ->where('product_id', $item->product_id)
                ->orderBy('sort_order')
                ->get();
            foreach ($downloads as $dl) {
                $out[] = [
                    'id' => $dl->id,
                    'order_item_id' => $item->id,
                    'name' => $dl->name,
                    'url' => $this->issueToken($item, $dl),
                    'download_count' => (int) $item->download_count,
                ];
            }
        }

        return $out;
    }

    public function storeUpload(int $tenantId, Product $product, \Illuminate\Http\UploadedFile $file, string $name = ''): ProductDownload
    {
        $path = $file->store("downloads/{$tenantId}/{$product->id}", 'local');

        return ProductDownload::query()->create([
            'tenant_id' => $tenantId,
            'product_id' => $product->id,
            'name' => $name !== '' ? $name : ($file->getClientOriginalName() ?: 'file'),
            'storage_path' => $path,
            'original_name' => $file->getClientOriginalName(),
            'download_limit' => null,
            'sort_order' => (int) ProductDownload::query()->where('product_id', $product->id)->max('sort_order') + 1,
        ]);
    }
}
