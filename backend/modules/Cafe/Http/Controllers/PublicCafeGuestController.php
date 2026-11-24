<?php

namespace Modules\Cafe\Http\Controllers;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductModifierOption;
use Illuminate\Http\Request;
use Modules\Cafe\Services\CafeGuestAuth;
use Modules\Cafe\Services\CafeOrdering;

/**
 * Everything a guest needs to come back: prove a phone number with an OTP, list the orders
 * made from this browser, and send the same basket again («سفارش دوباره»).
 *
 * Authorisation is the browser token (guest_token) that already owns the cart, plus — when
 * the cafe enables OTP — a verified phone. No session or password is issued.
 */
class PublicCafeGuestController extends Controller
{
    use ResolvesPublicTenant;

    public function state(Request $request, CafeGuestAuth $auth): \Illuminate\Http\JsonResponse
    {
        $token = $this->token($request);

        return response()->json(['data' => $auth->state($this->publicTenantId($request), $token)])
            ->header('Cache-Control', 'no-store');
    }

    public function sendOtp(Request $request, CafeGuestAuth $auth): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'guest_token' => ['required', 'string', 'min:8', 'max:64'],
            'phone' => ['required', 'string', 'max:32'],
        ]);

        $result = $auth->sendCode($this->publicTenant($request), $data['guest_token'], $data['phone']);
        $status = $result['ok'] ? 200 : ($result['code'] === 'invalid_phone' ? 422 : 429);

        return response()->json([
            'data' => ['ok' => $result['ok'], 'code' => $result['code']],
            'message' => $result['message'],
        ], $status);
    }

    public function verifyOtp(Request $request, CafeGuestAuth $auth): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'guest_token' => ['required', 'string', 'min:8', 'max:64'],
            'phone' => ['required', 'string', 'max:32'],
            'code' => ['required', 'string', 'max:8'],
        ]);

        $result = $auth->verifyCode($this->publicTenant($request), $data['guest_token'], $data['phone'], $data['code']);

        return response()->json([
            'data' => ['ok' => $result['ok'], 'code' => $result['code']]
                + ($result['ok'] ? $auth->state($this->publicTenantId($request), $data['guest_token']) : []),
            'message' => $result['message'],
        ], $result['ok'] ? 200 : 422);
    }

    /**
     * Orders this browser placed, newest first. With a verified phone we also include orders
     * paid from the same number on another device, which is what a returning guest expects.
     */
    public function orders(Request $request, CafeGuestAuth $auth, CafeOrdering $ordering): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $token = $this->token($request);
        if ($token === '') {
            return response()->json(['data' => []]);
        }
        $phone = $auth->verifiedPhone($tid, $token);

        $rows = Order::query()
            ->where('tenant_id', $tid)
            ->where('meta->source', 'guest_table')
            ->where(function ($q) use ($token, $phone) {
                $q->where('meta->guest_token', $token);
                if ($phone !== null) {
                    $q->orWhere('customer_phone', $phone);
                }
            })
            ->with('items')
            ->latest()
            ->limit(30)
            ->get();

        return response()->json([
            'data' => $rows->map(fn (Order $order) => $this->present($order, $ordering))->values(),
            'meta' => ['verified' => $phone !== null, 'phone' => $phone],
        ])->header('Cache-Control', 'no-store');
    }

    /** Put every sellable line of an old order back in the cart at today's prices. */
    public function reorder(Request $request, int $order, CafeGuestAuth $auth, CafeOrdering $ordering): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $token = $this->token($request);
        $row = Order::query()
            ->where('tenant_id', $tid)
            ->whereKey($order)
            ->where('meta->source', 'guest_table')
            ->first();

        if (! $row) {
            abort(404);
        }

        $ownedByToken = hash_equals((string) ($row->meta['guest_token'] ?? ''), $token);
        $ownedByPhone = $auth->verifiedPhone($tid, $token) !== null
            && $auth->verifiedPhone($tid, $token) === $row->customer_phone;
        abort_unless($token !== '' && ($ownedByToken || $ownedByPhone), 403);
        $ordering->assertAccepting($tid);

        $cart = Cart::query()->firstOrCreate(
            ['tenant_id' => $tid, 'guest_token' => $token],
            ['user_id' => null, 'table_number' => $request->query('table'), 'branch_slug' => $row->branch_slug],
        );

        $added = 0;
        $skipped = [];
        /** @var OrderItem $item */
        foreach ($row->items()->with('product.modifiers.options')->get() as $item) {
            $product = $item->product;
            if (! $this->sellable($product, $tid)) {
                $skipped[] = $item->product_name;
                continue;
            }

            $selections = is_array($item->meta) ? ($item->meta['selections'] ?? []) : [];
            $optionIds = collect(is_array($selections) ? $selections : [])
                ->filter(fn ($row) => ! empty($row['option_id']) && empty($row['addon']))
                ->map(fn ($row) => (int) $row['option_id'])
                ->filter(fn ($id) => ProductModifierOption::query()->whereKey($id)->exists())
                ->values()
                ->all();
            $priced = $ordering->priceLine($product, $optionIds, $item->product_variant_id);
            $unit = \App\Services\Shop\StoreCurrency::toStore($priced['unit_minor'], $product->currency, $tid);

            $line = CartItem::query()->firstOrNew([
                'cart_id' => $cart->id,
                'product_id' => $product->id,
                'line_key' => $priced['line_key'],
            ]);
            $line->quantity = ($line->exists ? $line->quantity : 0) + max(1, (int) $item->quantity);
            $addons = collect(is_array($selections) ? $selections : [])
                ->filter(fn ($row) => ! empty($row['addon']))
                ->map(fn ($row) => [
                    'option_id' => $row['option_id'] ?? null,
                    'modifier_id' => $row['modifier_id'] ?? null,
                    'name_fa' => (string) ($row['name_fa'] ?? ''),
                    'name_en' => (string) ($row['name_en'] ?? $row['name_fa'] ?? ''),
                    'price_minor' => 0,
                    'addon' => true,
                ])
                ->values()
                ->all();
            $line->meta = [
                'selections' => $priced['selections'],
                'addons' => $addons,
                'variant_id' => $priced['variant_id'],
                'unit_minor' => $unit,
            ];
            $line->save();
            $added++;
        }

        return response()->json([
            'data' => ['added' => $added, 'skipped' => $skipped],
        ], $added > 0 ? 200 : 422);
    }

    /** @return array<string, mixed> */
    private function present(Order $order, CafeOrdering $ordering): array
    {
        $meta = is_array($order->meta) ? $order->meta : [];

        return [
            'id' => $order->id,
            'number' => $order->number ?? $order->id,
            'status' => $order->status,
            'kitchen_status' => $meta['kitchen_status'] ?? 'new',
            'fulfillment' => $meta['fulfillment'] ?? 'dine_in',
            'table_number' => $order->table_number,
            'delivery_window' => $meta['delivery_window'] ?? $order->delivery_window ?? null,
            'customer_name' => $order->customer_name,
            'created_at' => $order->created_at?->toIso8601String(),
            'total_minor' => (int) $order->total_minor,
            'currency' => $order->currency,
            'items' => $order->items->map(fn ($item) => [
                'product_id' => $item->product_id,
                'name' => $item->product_name,
                'quantity' => (int) $item->quantity,
                'unit_price_minor' => (int) $item->unit_price_minor,
                'selections' => is_array($item->meta) ? ($item->meta['selections'] ?? []) : [],
            ])->values()->all(),
        ];
    }

    private function sellable(?Product $product, int $tid): bool
    {
        return $product !== null
            && (int) $product->tenant_id === $tid
            && $product->status === 'publish'
            && ! $product->is_hidden
            && $product->is_available !== false
            && ! $product->is_sold_out;
    }

    private function token(Request $request): string
    {
        $token = $request->query('guest_token') ?? $request->input('guest_token') ?? $request->header('X-Guest-Token');

        return is_string($token) ? substr($token, 0, 64) : '';
    }
}
