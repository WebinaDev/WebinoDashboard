<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\MarketplaceOrderMap;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\Marketplace\Adapters\DigikalaAdapter;
use App\Services\Marketplace\Digikala\DigikalaWebhooks;
use App\Services\Marketplace\MarketplaceAdapterRegistry;
use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplaceSettingsService;
use App\Services\Marketplace\MarketplaceSync;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MarketplaceDigikalaController extends Controller
{
    public function __construct(
        protected MarketplaceSettingsService $settings,
        protected MarketplaceSync $sync,
    ) {}

    protected function tid(Request $request): int
    {
        return (int) $request->user()->tenant_id;
    }

    protected function adapter(Request $request): DigikalaAdapter
    {
        /** @var DigikalaAdapter */
        return MarketplaceAdapterRegistry::make('digikala', $this->tid($request));
    }

    protected function error(MarketplaceException $e): JsonResponse
    {
        $status = $e->status >= 400 && $e->status < 600 ? $e->status : 422;

        return response()->json(['message' => $e->getMessage()], $status === 401 ? 422 : $status);
    }

    /** Auth state, public key, webhook URL and event toggles for the connection page. */
    public function overview(Request $request): JsonResponse
    {
        $tid = $this->tid($request);
        $adapter = $this->adapter($request);
        $c = $adapter->credentialsPublic();
        $state = $this->settings->state($tid, 'digikala');

        return response()->json(['data' => [
            'auth' => $adapter->auth()->status(),
            'public_key' => (string) ($c['public_key'] ?? ''),
            'has_private_key' => filled($c['private_key'] ?? null),
            'has_encrypted_code' => filled($c['encrypted_code'] ?? null),
            'webhook_url' => DigikalaWebhooks::webhookUrl($tid),
            'webhook_events' => DigikalaWebhooks::normalizeEvents($c['webhook_events'] ?? null),
            'webhook_matrix' => DigikalaWebhooks::matrixRows(),
            'webhook_subscribed_at' => $state['webhook_subscribed_at'] ?? null,
            'has_webhook_secret' => filled($c['webhook_secret'] ?? null),
        ]]);
    }

    public function generateKeys(Request $request): JsonResponse
    {
        try {
            $public = $this->adapter($request)->auth()->generateKeypair();
        } catch (MarketplaceException $e) {
            return $this->error($e);
        }

        return response()->json(['data' => ['public_key' => $public, 'has_private_key' => true], 'message' => __('marketplace.digikala_keys_generated')]);
    }

    public function issueToken(Request $request): JsonResponse
    {
        $data = $request->validate(['encrypted_code' => ['nullable', 'string', 'max:20000']]);
        try {
            $status = $this->adapter($request)->auth()->issueFromEncryptedCode($data['encrypted_code'] ?? null);
        } catch (MarketplaceException $e) {
            return $this->error($e);
        }

        return response()->json(['data' => ['auth' => $status], 'message' => __('marketplace.digikala_token_issued')]);
    }

    public function refreshToken(Request $request): JsonResponse
    {
        $auth = $this->adapter($request)->auth();
        try {
            $auth->refresh();
        } catch (MarketplaceException $e) {
            return $this->error($e);
        }

        return response()->json(['data' => ['auth' => $auth->status()]]);
    }

    public function disconnect(Request $request): JsonResponse
    {
        $auth = $this->adapter($request)->auth();
        $auth->disconnect();

        return response()->json(['data' => ['auth' => $auth->status()]]);
    }

    public function scopes(Request $request): JsonResponse
    {
        try {
            $res = $this->adapter($request)->scopes();
        } catch (MarketplaceException $e) {
            return $this->error($e);
        }

        return response()->json(['data' => $res['data'] ?? $res]);
    }

    public function saveWebhookEvents(Request $request): JsonResponse
    {
        $data = $request->validate([
            'events' => ['required', 'array'],
            'events.*' => ['boolean'],
            'subscribe' => ['sometimes', 'boolean'],
        ]);
        $tid = $this->tid($request);
        $events = DigikalaWebhooks::normalizeEvents($data['events']);
        $this->settings->patchCredentials($tid, 'digikala', ['webhook_events' => $events]);
        $result = null;
        if (! empty($data['subscribe'])) {
            try {
                $result = $this->adapter($request)->subscribeWebhooks();
            } catch (MarketplaceException $e) {
                return response()->json(['message' => $e->getMessage(), 'data' => ['webhook_events' => $events]], 422);
            }
        }

        return response()->json(['data' => ['webhook_events' => $events, 'subscription' => $result]]);
    }

    public function subscribe(Request $request): JsonResponse
    {
        try {
            $res = $this->adapter($request)->subscribeWebhooks();
        } catch (MarketplaceException $e) {
            return $this->error($e);
        }

        return response()->json(['data' => $res, 'message' => __('marketplace.digikala_webhook_subscribed')]);
    }

    public function health(Request $request): JsonResponse
    {
        $health = $this->adapter($request)->health();

        return response()->json(['data' => array_merge($health, ['alerts' => DigikalaAdapter::alertsFor($health)])]);
    }

    /** Queue a platform job (import, auto-link, reconcile). */
    public function queue(Request $request, string $action): JsonResponse
    {
        $data = $request->validate([
            'keyword' => ['nullable', 'string', 'max:200'],
            'type' => ['nullable', Rule::in(['all', 'products', 'orders', 'inventory'])],
        ]);
        $type = match ($action) {
            'import' => 'dk_product_import',
            'auto-link' => 'dk_auto_link',
            'reconcile' => 'dk_reconcile',
            default => abort(404),
        };
        $payload = match ($type) {
            'dk_product_import' => ['keyword' => (string) ($data['keyword'] ?? '')],
            'dk_reconcile' => ['type' => (string) ($data['type'] ?? 'all')],
            default => [],
        };
        $job = $this->sync->enqueue($this->tid($request), 'digikala', $type, $payload, 5);

        return response()->json(['data' => $job->fresh()]);
    }

    // ── Product editor ──────────────────────────────────────────────────

    protected function variantOf(Product $product, mixed $id): ?ProductVariant
    {
        return $id ? ProductVariant::query()->where('product_id', $product->id)->findOrFail((int) $id) : null;
    }

    public function dkpVariants(Request $request, Product $product): JsonResponse
    {
        abort_if($product->tenant_id !== $this->tid($request), 403);
        $dkp = (string) $request->query('dkp', '');
        try {
            $rows = $this->adapter($request)->variantsForDkp($dkp);
        } catch (MarketplaceException $e) {
            return $this->error($e);
        }

        return response()->json(['data' => ['dk_product_id' => DigikalaAdapter::parseProductId($dkp), 'variants' => $rows]]);
    }

    public function mapDkp(Request $request, Product $product): JsonResponse
    {
        abort_if($product->tenant_id !== $this->tid($request), 403);
        $data = $request->validate([
            'dkp' => ['required', 'string', 'max:64'],
            'variant_id' => ['nullable', 'string', 'max:64'],
            'product_variant_id' => ['nullable', 'integer'],
        ]);
        try {
            $res = $this->adapter($request)->resolveAndMap(
                $product,
                $this->variantOf($product, $data['product_variant_id'] ?? null),
                $data['dkp'],
                (string) ($data['variant_id'] ?? ''),
            );
        } catch (MarketplaceException $e) {
            return $this->error($e);
        }

        return response()->json(['data' => $res]);
    }

    public function labels(Request $request, Product $product): JsonResponse
    {
        abort_if($product->tenant_id !== $this->tid($request), 403);

        return response()->json(['data' => $this->adapter($request)->labelsForProduct($product)]);
    }

    // ── Orders ──────────────────────────────────────────────────────────

    protected function digikalaOrder(Request $request, Order $order): Order
    {
        abort_if($order->tenant_id !== $this->tid($request), 403);
        abort_unless($order->sales_channel === 'digikala', 404, __('marketplace.digikala_order_not_found'));

        return $order;
    }

    public function orderInfo(Request $request, Order $order): JsonResponse
    {
        $order = $this->digikalaOrder($request, $order);
        $dk = (array) (($order->meta ?? [])['digikala'] ?? []);
        $map = MarketplaceOrderMap::query()->where('order_id', $order->id)->where('platform', 'digikala')->first();
        $fulfillment = (string) ($dk['fulfillment'] ?? $map?->fulfillment ?? 'digikala');

        return response()->json(['data' => [
            'remote_order_id' => $map?->remote_order_id ?? ($dk['order_id'] ?? null),
            'fulfillment' => $fulfillment,
            'native_status' => $dk['native_status'] ?? $map?->status,
            'shipment_id' => $dk['shipment_id'] ?? null,
            'items' => array_values((array) ($dk['items'] ?? [])),
            'sbs_actions' => $fulfillment === 'seller' ? ['processing', 'processed', 'full_delivered_to_customer'] : [],
            'last_sync_at' => $map?->last_sync_at,
        ]]);
    }

    public function sbsStatus(Request $request, Order $order): JsonResponse
    {
        $order = $this->digikalaOrder($request, $order);
        $data = $request->validate([
            'action' => ['required', Rule::in(DigikalaAdapter::SBS_ACTIONS)],
            'verification_code' => ['nullable', 'string', 'regex:/^\d{0,12}$/'],
        ]);
        $dk = (array) (($order->meta ?? [])['digikala'] ?? []);
        if (($dk['fulfillment'] ?? '') !== 'seller') {
            return response()->json(['message' => __('marketplace.digikala_not_sbs')], 400);
        }
        $job = $this->sync->enqueue($order->tenant_id, 'digikala', 'dk_order_status', [
            'order_id' => $order->id,
            'action' => $data['action'],
            'verification_code' => (string) ($data['verification_code'] ?? ''),
        ], 2);

        return response()->json(['data' => $job->fresh(), 'message' => __('marketplace.digikala_status_queued')]);
    }

    public function cancel(Request $request, Order $order): JsonResponse
    {
        $order = $this->digikalaOrder($request, $order);
        $data = $request->validate([
            'cancellation_reason_id' => ['nullable', 'integer'],
            'item_id' => ['nullable', 'integer'],
            'count' => ['nullable', 'integer', 'min:0'],
        ]);
        $job = $this->sync->enqueue($order->tenant_id, 'digikala', 'dk_order_cancel', [
            'order_id' => $order->id,
            'cancellation_reason_id' => (int) ($data['cancellation_reason_id'] ?? -1),
            'item_id' => (int) ($data['item_id'] ?? 0),
            'count' => (int) ($data['count'] ?? 0),
        ], 2);

        return response()->json(['data' => $job->fresh(), 'message' => __('marketplace.digikala_cancel_queued')]);
    }
}
