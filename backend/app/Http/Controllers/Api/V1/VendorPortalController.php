<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\VendorStore;
use App\Models\VendorWithdrawal;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class VendorPortalController extends Controller
{
    public function myStore(Request $request): \Illuminate\Http\JsonResponse
    {
        $store = $this->storeFor($request);

        return response()->json(['data' => $store]);
    }

    public function upsertStore(Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => ['required', 'string', 'max:190'],
            'bio' => ['nullable', 'string', 'max:5000'],
            'logo_url' => ['nullable', 'string', 'max:500'],
        ]);
        $slug = Str::slug($data['name']);
        if ($slug === '') {
            $slug = 'store-'.$user->id;
        }
        $store = VendorStore::query()->updateOrCreate(
            ['tenant_id' => $user->tenant_id, 'user_id' => $user->id],
            [
                'name' => $data['name'],
                'slug' => $slug,
                'bio' => $data['bio'] ?? null,
                'logo_url' => $data['logo_url'] ?? null,
                'status' => 'pending',
            ]
        );
        if ($user->role === 'customer') {
            $user->update(['role' => 'seller']);
        }

        return response()->json(['data' => $store]);
    }

    public function products(Request $request): \Illuminate\Http\JsonResponse
    {
        $store = $this->requireStore($request);
        $items = Product::query()
            ->where('tenant_id', $store->tenant_id)
            ->where('vendor_store_id', $store->id)
            ->orderByDesc('id')
            ->limit(100)
            ->get(['id', 'name', 'slug', 'status', 'price_minor', 'stock']);

        return response()->json(['data' => ['items' => $items]]);
    }

    public function attachProduct(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        $store = $this->requireStore($request);
        abort_if((int) $product->tenant_id !== (int) $store->tenant_id, 404);
        $product->update(['vendor_store_id' => $store->id]);

        return response()->json(['data' => ['ok' => true]]);
    }

    public function orders(Request $request): \Illuminate\Http\JsonResponse
    {
        $store = $this->requireStore($request);
        $productIds = Product::query()->where('vendor_store_id', $store->id)->pluck('id');
        $orderIds = OrderItem::query()->whereIn('product_id', $productIds)->distinct()->pluck('order_id');
        $orders = Order::query()->whereIn('id', $orderIds)->orderByDesc('id')->limit(50)->get(['id', 'status', 'total_minor', 'created_at']);

        return response()->json(['data' => ['items' => $orders]]);
    }

    public function withdraw(Request $request): \Illuminate\Http\JsonResponse
    {
        $store = $this->requireStore($request);
        $data = $request->validate([
            'amount_minor' => ['required', 'integer', 'min:10000'],
            'bank_sheba' => ['required', 'string', 'max:34'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);
        $row = VendorWithdrawal::query()->create([
            'tenant_id' => $store->tenant_id,
            'vendor_store_id' => $store->id,
            'amount_minor' => (int) $data['amount_minor'],
            'currency' => 'IRT',
            'status' => 'pending',
            'bank_sheba' => $data['bank_sheba'],
            'note' => $data['note'] ?? null,
        ]);

        return response()->json(['data' => $row], 201);
    }

    public function adminWithdrawals(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $items = VendorWithdrawal::query()->where('tenant_id', $tid)->orderByDesc('id')->limit(100)->with('store')->get();

        return response()->json(['data' => ['items' => $items]]);
    }

    public function adminPatchWithdrawal(Request $request, VendorWithdrawal $withdrawal): \Illuminate\Http\JsonResponse
    {
        abort_if((int) $withdrawal->tenant_id !== (int) $request->user()->tenant_id, 404);
        $data = $request->validate(['status' => ['required', 'string', 'in:pending,approved,rejected,paid']]);
        $withdrawal->update(['status' => $data['status']]);

        return response()->json(['data' => $withdrawal->fresh()]);
    }

    protected function storeFor(Request $request): ?VendorStore
    {
        $user = $request->user();

        return VendorStore::query()->where('tenant_id', $user->tenant_id)->where('user_id', $user->id)->first();
    }

    protected function requireStore(Request $request): VendorStore
    {
        $store = $this->storeFor($request);
        abort_if($store === null, 422, 'vendor_store_missing');

        return $store;
    }
}
