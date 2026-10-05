<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class PublicWishlistController extends Controller
{
    use ResolvesPublicTenant;

    public function show(Request $request, string $token): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $user = User::query()
            ->where('tenant_id', $tid)
            ->where('wishlist_public_enabled', true)
            ->where('wishlist_public_token', $token)
            ->firstOrFail();

        $ids = array_values(array_unique(array_filter(array_map('intval', $user->wishlist ?? []))));
        $products = $ids === []
            ? collect()
            : Product::query()->where('tenant_id', $tid)->whereIn('id', $ids)->storefront()->get(['id', 'slug', 'name', 'price_minor', 'sale_price_minor', 'cover_image_url', 'image_url']);

        return response()->json([
            'data' => [
                'owner_name' => $user->name,
                'items' => $products->map(fn (Product $p) => [
                    'id' => $p->id,
                    'slug' => $p->slug,
                    'name' => $p->name,
                    'price_minor' => $p->storefrontPriceMinor(),
                    'image_url' => $p->cover_image_url ?: $p->image_url,
                ])->values(),
            ],
        ]);
    }

    public function settings(Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        return response()->json([
            'data' => [
                'enabled' => (bool) $user->wishlist_public_enabled,
                'token' => $user->wishlist_public_token,
                'public_path' => $user->wishlist_public_token ? '/wishlist/'.$user->wishlist_public_token : null,
            ],
        ]);
    }

    public function updateSettings(Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);
        $data = $request->validate(['enabled' => ['required', 'boolean']]);
        if ($data['enabled'] && ! $user->wishlist_public_token) {
            $user->wishlist_public_token = Str::random(32);
        }
        $user->wishlist_public_enabled = (bool) $data['enabled'];
        $user->save();

        return response()->json([
            'data' => [
                'enabled' => (bool) $user->wishlist_public_enabled,
                'token' => $user->wishlist_public_token,
                'public_path' => $user->wishlist_public_token ? '/wishlist/'.$user->wishlist_public_token : null,
            ],
        ]);
    }
}
