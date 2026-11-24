<?php

namespace Modules\Cafe\Http\Controllers;

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
        abort_if($product->tenant_id !== $tid || $product->is_hidden || $product->status !== 'publish', 404);

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

    /**
     * Record that a table/menu QR sticker was scanned.
     *
     * Called by the public catalogue page when it sees `?table=` or `?qr=1`. Deliberately
     * fire-and-forget from the guest's point of view: a scan record is a statistic, and a
     * statistic must never be the reason a menu fails to open.
     *
     * The visitor key is a hash of (tenant, day, hashed fingerprint): distinct guests can be
     * counted without storing anything that follows one of them to the next day.
     */
    public function qrScan(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);

        $data = $request->validate([
            'table_code' => ['nullable', 'string', 'max:40'],
            'kind' => ['nullable', 'in:menu,table'],
            'fingerprint' => ['nullable', 'string', 'max:64'],
        ]);

        $tableCode = isset($data['table_code']) ? trim((string) $data['table_code']) : null;
        $tableId = null;
        $branchId = null;

        if ($tableCode !== null && $tableCode !== '') {
            $table = \Modules\Cafe\Entities\CafeTable::query()
                ->where('tenant_id', $tid)
                ->where('code', $tableCode)
                ->first();

            if ($table !== null) {
                $tableId = (int) $table->id;
                $branchId = $table->branch_id === null ? null : (int) $table->branch_id;
                $tableCode = $table->code;
            }
        }

        // One row per visitor per table per hour: a guest refreshing the page is not three
        // guests, and a sticker that is genuinely used still shows up.
        $visitor = isset($data['fingerprint']) && $data['fingerprint'] !== ''
            ? substr(hash('sha256', $tid.'|'.now()->toDateString().'|'.$data['fingerprint']), 0, 64)
            : null;

        $exists = $visitor === null ? false : \Illuminate\Support\Facades\DB::table('cafe_qr_scans')
            ->where('tenant_id', $tid)
            ->where('table_code', $tableCode)
            ->where('visitor_hash', $visitor)
            ->where('scanned_at', '>=', now()->subHour())
            ->exists();

        if (! $exists) {
            \Illuminate\Support\Facades\DB::table('cafe_qr_scans')->insert([
                'tenant_id' => $tid,
                'branch_id' => $branchId,
                'table_code' => $tableCode,
                'table_id' => $tableId,
                'kind' => $data['kind'] ?? ($tableCode !== null ? 'table' : 'menu'),
                'visitor_hash' => $visitor,
                'scanned_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return response()->json(['data' => ['recorded' => ! $exists]]);
    }

    public function feedback(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        abort_if($product->tenant_id !== $tid || $product->is_hidden || $product->status !== 'publish', 404);

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
