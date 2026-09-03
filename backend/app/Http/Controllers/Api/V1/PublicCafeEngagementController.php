<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\GuestPhoneRegistration;
use App\Models\Product;
use App\Models\ProductFeedback;
use App\Models\ProductLike;
use App\Services\Modules\ModuleSettingsService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class PublicCafeEngagementController extends Controller
{
    use ResolvesPublicTenant;

    public function like(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        abort_if($product->tenant_id !== $tid || $product->is_hidden, 404);

        $data = $request->validate([
            'fingerprint' => ['required', 'string', 'max:64'],
        ]);

        ProductLike::query()->firstOrCreate([
            'product_id' => $product->id,
            'fingerprint' => $data['fingerprint'],
        ], [
            'tenant_id' => $tid,
        ]);

        $count = ProductLike::query()->where('product_id', $product->id)->count();

        return response()->json(['data' => ['likes_count' => $count]]);
    }

    public function feedback(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        abort_if($product->tenant_id !== $tid || $product->is_hidden, 404);

        $data = $request->validate([
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'comment' => ['nullable', 'string', 'max:2000'],
            'guest_phone' => ['nullable', 'string', 'max:32'],
            'fingerprint' => ['nullable', 'string', 'max:64'],
        ]);

        ProductFeedback::query()->create([
            'tenant_id' => $tid,
            'product_id' => $product->id,
            'rating' => $data['rating'],
            'comment' => $data['comment'] ?? null,
            'guest_phone' => $data['guest_phone'] ?? null,
            'fingerprint' => $data['fingerprint'] ?? null,
        ]);

        return response()->json(['data' => ['ok' => true]], 201);
    }

    public function registerPhone(Request $request, ModuleSettingsService $settings): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $engagement = $settings->get($tid, 'cafe', 'engagement', ModuleSettingsService::cafeEngagementDefaults());

        abort_if(empty($engagement['phone_gate_enabled']), 403);

        $data = $request->validate([
            'phone' => ['required', 'string', 'max:32'],
            'fingerprint' => ['required', 'string', 'max:64'],
        ]);

        GuestPhoneRegistration::query()->updateOrCreate(
            ['tenant_id' => $tid, 'fingerprint' => $data['fingerprint']],
            ['phone' => $data['phone']],
        );

        return response()->json(['data' => ['ok' => true]]);
    }

    public function checkPhoneGate(Request $request, ModuleSettingsService $settings): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $engagement = $settings->get($tid, 'cafe', 'engagement', ModuleSettingsService::cafeEngagementDefaults());

        if (empty($engagement['phone_gate_enabled'])) {
            return response()->json(['data' => ['required' => false, 'registered' => true]]);
        }

        $fingerprint = $request->query('fingerprint');
        $registered = false;
        if (is_string($fingerprint) && $fingerprint !== '') {
            $registered = GuestPhoneRegistration::query()
                ->where('tenant_id', $tid)
                ->where('fingerprint', $fingerprint)
                ->exists();
        }

        return response()->json(['data' => ['required' => true, 'registered' => $registered]]);
    }
}
