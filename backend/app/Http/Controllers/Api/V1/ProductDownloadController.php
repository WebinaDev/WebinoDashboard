<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductDownload;
use App\Services\Shop\ProductDownloadService;
use App\Services\Shop\ShopSettings;
use Illuminate\Http\Request;

class ProductDownloadController extends Controller
{
    public function __construct(private readonly ProductDownloadService $downloads) {}

    public function index(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        $this->authorizeProduct($request, $product);
        $rows = ProductDownload::query()
            ->where('product_id', $product->id)
            ->orderBy('sort_order')
            ->get();

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        $this->authorizeProduct($request, $product);
        $data = $request->validate([
            'file' => ['required', 'file', 'max:51200'],
            'name' => ['nullable', 'string', 'max:120'],
            'download_limit' => ['nullable', 'integer', 'min:1'],
        ]);

        $row = $this->downloads->storeUpload(
            (int) $request->user()->tenant_id,
            $product,
            $data['file'],
            (string) ($data['name'] ?? '')
        );
        if (isset($data['download_limit'])) {
            $row->update(['download_limit' => $data['download_limit']]);
        }
        if ($product->type !== 'downloadable') {
            $product->update(['type' => 'downloadable']);
        }

        return response()->json(['data' => $row], 201);
    }

    public function destroy(Request $request, Product $product, ProductDownload $download): \Illuminate\Http\JsonResponse
    {
        $this->authorizeProduct($request, $product);
        if ((int) $download->product_id !== (int) $product->id) {
            return response()->json(['message' => 'Not found'], 404);
        }
        $download->delete();

        return response()->json(['data' => ['ok' => true]]);
    }

    public function serve(Request $request, OrderItem $orderItem, ProductDownload $download)
    {
        return $this->downloads->serve($request, $orderItem, $download);
    }

    public function settings(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => ShopSettings::getDownloads((int) $request->user()->tenant_id)]);
    }

    private function authorizeProduct(Request $request, Product $product): void
    {
        abort_unless((int) $product->tenant_id === (int) $request->user()->tenant_id, 404);
    }
}
