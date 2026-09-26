<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\MarketplaceJob;
use App\Models\MarketplaceLog;
use App\Models\MarketplaceOrderMap;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\Marketplace\Adapters\BasalamAdapter;
use App\Services\Marketplace\Basalam\BasalamAuth;
use App\Services\Marketplace\Basalam\BasalamBooth;
use App\Services\Marketplace\Basalam\BasalamCategories;
use App\Services\Marketplace\Basalam\BasalamClient;
use App\Services\Marketplace\Basalam\BasalamCommission;
use App\Services\Marketplace\Basalam\BasalamDiscounts;
use App\Services\Marketplace\Basalam\BasalamEndpoints;
use App\Services\Marketplace\Basalam\BasalamFinance;
use App\Services\Marketplace\Basalam\BasalamOrders;
use App\Services\Marketplace\Basalam\BasalamProducts;
use App\Services\Marketplace\Basalam\BasalamSettings;
use App\Services\Marketplace\Basalam\BasalamWebhooks;
use App\Services\Marketplace\MarketplaceAdapterRegistry;
use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplaceSettingsService;
use App\Services\Marketplace\MarketplaceSync;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Basalam panel API (port of the WP `webino-dashboard/v1/basalam/*` REST surface).
 */
class MarketplaceBasalamController extends Controller
{
    public function __construct(
        protected MarketplaceSettingsService $settings,
        protected BasalamSettings $basalam,
        protected MarketplaceSync $sync,
    ) {}

    protected function tid(Request $request): int
    {
        return (int) $request->user()->tenant_id;
    }

    protected function client(Request $request): BasalamClient
    {
        return BasalamClient::for($this->tid($request));
    }

    protected function products(Request $request): BasalamProducts
    {
        return BasalamProducts::for($this->tid($request));
    }

    protected function orders(Request $request): BasalamOrders
    {
        return BasalamOrders::for($this->tid($request));
    }

    protected function error(MarketplaceException $e): JsonResponse
    {
        $status = $e->status >= 400 && $e->status < 600 ? $e->status : 422;

        return response()->json(['message' => $e->getMessage()], $status === 401 ? 422 : $status);
    }

    /** Runs a callback, mapping marketplace errors to JSON responses. */
    protected function run(Closure $fn): JsonResponse
    {
        try {
            $result = $fn();
        } catch (MarketplaceException $e) {
            return $this->error($e);
        }

        return $result instanceof JsonResponse ? $result : response()->json(['data' => $result]);
    }

    protected function requireConnected(Request $request): void
    {
        if (! BasalamAuth::for($this->tid($request))->isConnected()) {
            throw new MarketplaceException(__('marketplace.basalam_not_connected'), 400);
        }
    }

    protected function product(Request $request, int $id): Product
    {
        return Product::query()->where('tenant_id', $this->tid($request))->findOrFail($id);
    }

    protected function order(Request $request, int $id): Order
    {
        return Order::query()->where('tenant_id', $this->tid($request))->findOrFail($id);
    }

    // ── Overview / settings ─────────────────────────────────────────────

    public function status(Request $request): JsonResponse
    {
        $tid = $this->tid($request);
        $auth = BasalamAuth::for($tid);
        if ($auth->token() !== '' && $auth->vendorId() < 1) {
            try {
                $auth->ensureVendorId();
            } catch (MarketplaceException) {
            }
        }
        $state = $this->settings->state($tid, 'basalam');

        return response()->json(['data' => [
            'connected' => $auth->isConnected(),
            'auth' => $auth->status(),
            'vendor_id' => $auth->vendorId() ?: null,
            'vendor_title' => $state['vendor_title'] ?? null,
            'jobs_pending' => MarketplaceJob::query()->where('tenant_id', $tid)->where('platform', 'basalam')->whereIn('status', ['pending', 'retrying'])->count(),
            'webhook_url' => BasalamWebhooks::url($tid),
            'webhook_id' => $state['webhook_id'] ?? null,
            'webhook_registered_at' => $state['webhook_registered_at'] ?? null,
            'chat_alert' => $state['chat_alert'] ?? null,
            'duplicate_report' => $this->products($request)->duplicateReport(),
            'checked_at' => now()->toIso8601String(),
        ]]);
    }

    public function coverage(): JsonResponse
    {
        $rows = [
            ['openapi.basalam.com', 'products/categories/webhooks/shipping/discounts'],
            ['core.basalam.com', 'variations/commission/products'],
            ['order-processing.basalam.com', 'orders'],
            ['uploadio.basalam.com', 'media'],
            ['categorydetection.basalam.com', 'category'],
            ['accounting.basalam.com', 'finance'],
            ['identity.basalam.com', 'bank-accounts'],
            ['erp (oauth proxy)', 'oauth'],
        ];

        return response()->json(['data' => [
            'source' => 'webino-basalam-engine',
            'endpoints' => array_map(fn ($r) => ['host' => $r[0], 'domain' => $r[1], 'status' => 'implemented'], $rows),
        ]]);
    }

    public function settings(Request $request): JsonResponse
    {
        $tid = $this->tid($request);

        return response()->json(['data' => [
            'settings' => $this->basalam->engine($tid),
            'defaults' => BasalamSettings::engineDefaults(),
            'custom_update_fields' => BasalamSettings::CUSTOM_UPDATE_FIELDS,
            'gateway' => $this->basalam->gatewayPublic($tid),
            'connected' => BasalamAuth::for($tid)->isConnected(),
            'vendor_id' => BasalamAuth::for($tid)->vendorId() ?: null,
        ]]);
    }

    public function saveSettings(Request $request): JsonResponse
    {
        $tid = $this->tid($request);
        $data = $request->validate(['settings' => ['required', 'array']])['settings'];
        $before = $this->basalam->engine($tid);

        return $this->run(function () use ($request, $tid, $data, $before) {
            $saved = $this->basalam->saveEngine($tid, $data);
            $warnings = [];
            if (BasalamAuth::for($tid)->isConnected()) {
                if ($saved['auto_confirm_order'] !== $before['auto_confirm_order']) {
                    try {
                        $this->orders($request)->autoConfirm((bool) $saved['auto_confirm_order']);
                    } catch (MarketplaceException $e) {
                        $warnings[] = $e->getMessage();
                    }
                }
                if ($saved['sync_status_order'] && ! $before['sync_status_order']) {
                    try {
                        BasalamWebhooks::for($tid)->setup();
                    } catch (MarketplaceException $e) {
                        $warnings[] = $e->getMessage();
                    }
                }
            }

            return response()->json(['data' => ['settings' => $saved, 'warnings' => $warnings], 'message' => __('marketplace.saved')]);
        });
    }

    public function gatewaySettings(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->basalam->gatewayPublic($this->tid($request))]);
    }

    public function saveGatewaySettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'gateway_secret' => ['nullable', 'string', 'max:500'],
            'gateway_sandbox' => ['nullable', 'boolean'],
            'gateway_sandbox_token' => ['nullable', 'string', 'max:500'],
            'pay_api_base' => ['nullable', 'string', 'max:255'],
            'clear_secrets' => ['nullable', 'array'],
            'clear_secrets.*' => ['string', 'in:gateway_secret,gateway_sandbox_token'],
        ]);

        return response()->json(['data' => $this->basalam->saveGateway($this->tid($request), $data), 'message' => __('marketplace.saved')]);
    }

    // ── OAuth ───────────────────────────────────────────────────────────

    public function oauthStart(Request $request): JsonResponse
    {
        $data = $request->validate(['return_url' => ['nullable', 'string', 'max:2000']]);

        return $this->run(fn () => BasalamAuth::for($this->tid($request))->start((string) ($data['return_url'] ?? '')));
    }

    public function oauthComplete(Request $request): JsonResponse
    {
        $data = $request->validate([
            'callback_url' => ['nullable', 'string', 'max:8000'],
            'query' => ['nullable', 'array'],
        ]);
        $auth = BasalamAuth::for($this->tid($request));

        return $this->run(function () use ($auth, $data) {
            if (! empty($data['callback_url'])) {
                $auth->completeFromCallbackUrl((string) $data['callback_url']);
            } else {
                $auth->completeHandoff((array) ($data['query'] ?? []), false);
            }

            return response()->json(['data' => $auth->status(), 'message' => __('marketplace.basalam_connected')]);
        });
    }

    public function oauthManual(Request $request): JsonResponse
    {
        $data = $request->validate([
            'access_token' => ['required', 'string', 'max:8000'],
            'refresh_token' => ['nullable', 'string', 'max:8000'],
            'vendor_id' => ['nullable', 'integer', 'min:1'],
            'expires_in' => ['nullable', 'integer', 'min:0'],
        ]);
        $auth = BasalamAuth::for($this->tid($request));

        return $this->run(function () use ($auth, $data) {
            $auth->saveManual($data['access_token'], (string) ($data['refresh_token'] ?? ''), isset($data['vendor_id']) ? (int) $data['vendor_id'] : null, isset($data['expires_in']) ? (int) $data['expires_in'] : null);

            return response()->json(['data' => $auth->status(), 'message' => __('marketplace.basalam_connected')]);
        });
    }

    public function oauthRefresh(Request $request): JsonResponse
    {
        $auth = BasalamAuth::for($this->tid($request));

        return $this->run(function () use ($auth) {
            $auth->refresh();

            return response()->json(['data' => $auth->status(), 'message' => __('marketplace.basalam_token_refreshed')]);
        });
    }

    public function oauthDisconnect(Request $request): JsonResponse
    {
        $tid = $this->tid($request);
        $state = $this->settings->state($tid, 'basalam');
        if (! empty($state['webhook_id'])) {
            try {
                BasalamWebhooks::for($tid)->delete((int) $state['webhook_id']);
            } catch (MarketplaceException) {
            }
        }
        BasalamAuth::for($tid)->disconnect();

        return response()->json(['data' => BasalamAuth::for($tid)->status(), 'message' => __('marketplace.basalam_disconnected')]);
    }

    // ── Booth ───────────────────────────────────────────────────────────

    public function vendor(Request $request): JsonResponse
    {
        if (! BasalamAuth::for($this->tid($request))->isConnected()) {
            return response()->json(['data' => ['vendor' => null]]);
        }

        return $this->run(fn () => ['vendor' => BasalamBooth::for($this->tid($request))->vendor($request->boolean('refresh'))]);
    }

    public function saveVendor(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'summary' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'status' => ['sometimes'],
            'city' => ['sometimes'],
            'province' => ['sometimes'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        return $this->run(function () use ($request, $data) {
            $this->requireConnected($request);

            return BasalamBooth::for($this->tid($request))->updateVendor($data);
        });
    }

    public function shipping(Request $request): JsonResponse
    {
        return $this->run(function () use ($request) {
            $this->requireConnected($request);

            return BasalamBooth::for($this->tid($request))->shipping();
        });
    }

    public function shippingAction(Request $request): JsonResponse
    {
        return $this->run(function () use ($request) {
            $this->requireConnected($request);

            return ['result' => BasalamBooth::for($this->tid($request))->shippingAction($request->all())];
        });
    }

    public function discounts(Request $request): JsonResponse
    {
        return $this->run(function () use ($request) {
            $this->requireConnected($request);
            $tid = $this->tid($request);

            return ['discounts' => BasalamBooth::for($tid)->discounts(), 'tasks' => BasalamDiscounts::for($tid)->stats()];
        });
    }

    public function createDiscount(Request $request): JsonResponse
    {
        return $this->run(function () use ($request) {
            $this->requireConnected($request);

            return ['result' => BasalamBooth::for($this->tid($request))->createDiscount($request->all())];
        });
    }

    public function discountTasks(Request $request): JsonResponse
    {
        $data = $request->validate(['action' => ['required', 'in:process,clear_failed']]);
        $d = BasalamDiscounts::for($this->tid($request));

        return $this->run(fn () => $data['action'] === 'process' ? $d->process(true) + ['stats' => $d->stats()] : ['cleared' => $d->clearFailed(), 'stats' => $d->stats()]);
    }

    public function chatToken(Request $request): JsonResponse
    {
        return $this->run(fn () => BasalamBooth::for($this->tid($request))->chatToken());
    }

    public function chatNotify(Request $request): JsonResponse
    {
        return $this->run(fn () => BasalamBooth::for($this->tid($request))->chatNotify());
    }

    public function dismissChatAlert(Request $request): JsonResponse
    {
        $this->settings->putState($this->tid($request), 'basalam', ['chat_alert' => null]);

        return response()->json(['data' => ['ok' => true]]);
    }

    // ── Webhooks ────────────────────────────────────────────────────────

    public function webhooks(Request $request): JsonResponse
    {
        $tid = $this->tid($request);
        $state = $this->settings->state($tid, 'basalam');
        $base = ['webhook_id' => $state['webhook_id'] ?? null, 'webhook_url' => BasalamWebhooks::url($tid), 'can_register' => BasalamWebhooks::for($tid)->canRegister()];
        if (! BasalamAuth::for($tid)->isConnected()) {
            return response()->json(['data' => $base + ['webhooks' => []]]);
        }

        return $this->run(fn () => $base + ['webhooks' => BasalamWebhooks::for($tid)->list()]);
    }

    public function webhookSetup(Request $request): JsonResponse
    {
        return $this->run(function () use ($request) {
            $this->requireConnected($request);
            $tid = $this->tid($request);

            return BasalamWebhooks::for($tid)->setup() + ['webhook_url' => BasalamWebhooks::url($tid)];
        });
    }

    public function webhookRotate(Request $request): JsonResponse
    {
        return $this->run(function () use ($request) {
            $this->requireConnected($request);

            return BasalamWebhooks::for($this->tid($request))->rotate();
        });
    }

    public function webhookDelete(Request $request): JsonResponse
    {
        $data = $request->validate(['webhook_id' => ['required', 'integer', 'min:1']]);

        return $this->run(function () use ($request, $data) {
            $this->requireConnected($request);

            return ['ok' => BasalamWebhooks::for($this->tid($request))->delete((int) $data['webhook_id'])];
        });
    }

    // ── Jobs / logs / health ────────────────────────────────────────────

    public function jobs(Request $request): JsonResponse
    {
        $tid = $this->tid($request);
        MarketplaceJob::query()->where('tenant_id', $tid)->where('platform', 'basalam')->where('status', 'completed')
            ->where('updated_at', '<', now()->subDays(7))->delete();
        $q = MarketplaceJob::query()->where('tenant_id', $tid)->where('platform', 'basalam');
        if ($status = $request->query('status')) {
            $q->where('status', (string) $status);
        }

        return response()->json(['data' => ['jobs' => $q->orderByDesc('id')->limit(100)->get()]]);
    }

    public function cancelJobs(Request $request): JsonResponse
    {
        $count = MarketplaceJob::query()->where('tenant_id', $this->tid($request))->where('platform', 'basalam')
            ->whereIn('status', ['pending', 'retrying', 'running'])
            ->update(['status' => 'failed', 'last_error' => 'user_cancelled', 'finished_at' => now()]);

        return response()->json(['data' => ['ok' => true, 'cancelled' => $count]]);
    }

    public function logs(Request $request): JsonResponse
    {
        $q = MarketplaceLog::query()->where('tenant_id', $this->tid($request))->where('platform', 'basalam');
        if ($level = $request->query('level')) {
            $q->where('level', (string) $level);
        }
        if ($channel = $request->query('channel')) {
            $q->where('channel', (string) $channel);
        }

        return response()->json(['data' => [
            'hint' => __('marketplace.basalam_logs_hint'),
            'logs' => $q->orderByDesc('id')->limit(min(500, max(1, (int) $request->query('limit', 200))))->get(),
        ]]);
    }

    public function health(Request $request): JsonResponse
    {
        return $this->run(function () use ($request) {
            /** @var BasalamAdapter $adapter */
            $adapter = MarketplaceAdapterRegistry::make('basalam', $this->tid($request));
            $health = $adapter->health();

            return $health + ['alerts' => BasalamAdapter::alertsFor($health)];
        });
    }

    public function resetCircuit(Request $request): JsonResponse
    {
        $this->client($request)->breaker()->reset();

        return response()->json(['data' => $this->client($request)->breaker()->snapshot()]);
    }

    // ── Products ────────────────────────────────────────────────────────

    public function productsList(Request $request): JsonResponse
    {
        $data = $request->validate([
            'filter' => ['nullable', 'in:all,connected,unconnected'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'search' => ['nullable', 'string', 'max:200'],
        ]);
        $page = (int) ($data['page'] ?? 1);
        $per = (int) ($data['per_page'] ?? 20);
        $result = $this->products($request)->list((string) ($data['filter'] ?? 'all'), $page, $per, (string) ($data['search'] ?? ''));

        return response()->json(['data' => $result + ['page' => $page, 'per_page' => $per, 'filter' => $data['filter'] ?? 'all']]);
    }

    public function productsCreateAll(Request $request): JsonResponse
    {
        $includeOut = $request->boolean('include_out_of_stock');
        $products = $this->products($request);
        $count = $products->countCreatable($includeOut);
        if ($count <= 0) {
            return response()->json(['data' => ['ok' => true, 'creatable_count' => 0, 'queued' => false], 'message' => __('marketplace.basalam_no_creatable')]);
        }
        $running = MarketplaceJob::query()->where('tenant_id', $this->tid($request))->where('platform', 'basalam')
            ->where('job_type', BasalamProducts::JOB_CREATE_ALL)->whereIn('status', ['pending', 'retrying', 'running'])->exists();
        if ($running) {
            return response()->json(['message' => __('marketplace.basalam_bulk_running'), 'data' => ['creatable_count' => $count]], 409);
        }
        $products->queue(BasalamProducts::JOB_CREATE_ALL, ['include_out_of_stock' => $includeOut], 0, BasalamProducts::JOB_CREATE_ALL.':start');

        return response()->json(['data' => ['ok' => true, 'queued' => true, 'job_type' => BasalamProducts::JOB_CREATE_ALL, 'creatable_count' => $count], 'message' => __('marketplace.basalam_queued')]);
    }

    public function productsUpdateAll(Request $request): JsonResponse
    {
        $products = $this->products($request);
        if (! $products->isUpdateSelectionValid()) {
            return response()->json(['message' => __('marketplace.basalam_custom_fields_required')], 422);
        }
        $type = $request->input('mode') === 'quick' ? BasalamProducts::JOB_BULK_UPDATE : BasalamProducts::JOB_UPDATE_ALL;
        $products->queue($type, [], 0, $type.':start');

        return response()->json(['data' => ['ok' => true, 'job_type' => $type], 'message' => __('marketplace.basalam_queued')]);
    }

    public function productsConnectAll(Request $request): JsonResponse
    {
        $this->products($request)->queue(BasalamProducts::JOB_AUTO_CONNECT, [], 0, BasalamProducts::JOB_AUTO_CONNECT.':start');

        return response()->json(['data' => ['ok' => true, 'job_type' => BasalamProducts::JOB_AUTO_CONNECT], 'message' => __('marketplace.basalam_queued')]);
    }

    public function productsSyncNow(Request $request): JsonResponse
    {
        $this->products($request)->queue(BasalamProducts::JOB_AUTO_CONNECT, ['then_update' => true], 0, BasalamProducts::JOB_AUTO_CONNECT.':sync-now');

        return response()->json(['data' => [
            'ok' => true,
            'job_type' => 'sync_basalam_sync_now',
            'jobs' => [BasalamProducts::JOB_AUTO_CONNECT, BasalamProducts::JOB_UPDATE_ALL],
        ], 'message' => __('marketplace.basalam_queued')]);
    }

    public function duplicates(Request $request): JsonResponse
    {
        $products = $this->products($request);

        return response()->json(['data' => ['duplicates' => $products->duplicateConnections(), 'report' => $products->duplicateReport()]]);
    }

    public function repairDuplicates(Request $request): JsonResponse
    {
        $products = $this->products($request);
        $result = $products->repairDuplicateConnections();
        $products->forgetDuplicateReport();

        return response()->json(['data' => $result, 'message' => __('marketplace.saved')]);
    }

    protected function productId(Request $request): int
    {
        return (int) $request->validate(['product_id' => ['required', 'integer', 'min:1']])['product_id'];
    }

    public function productCreate(Request $request): JsonResponse
    {
        $product = $this->product($request, $this->productId($request));
        $payload = ['product_id' => $product->id];
        if (is_array($request->input('category_ids'))) {
            $payload['category_ids'] = array_values(array_map('intval', $request->input('category_ids')));
        }
        if ($request->boolean('now')) {
            return $this->run(fn () => $this->products($request)->create($product, $payload['category_ids'] ?? null));
        }
        $this->products($request)->queue(BasalamProducts::JOB_CREATE_SINGLE, $payload);

        return response()->json(['data' => ['ok' => true, 'job_type' => BasalamProducts::JOB_CREATE_SINGLE], 'message' => __('marketplace.basalam_queued')]);
    }

    public function productUpdate(Request $request): JsonResponse
    {
        $product = $this->product($request, $this->productId($request));
        if ($request->boolean('now')) {
            return $this->run(fn () => $this->products($request)->update($product, null, $request->input('mode') ?: null));
        }
        $this->products($request)->queue(BasalamProducts::JOB_UPDATE_SINGLE, ['product_id' => $product->id]);

        return response()->json(['data' => ['ok' => true, 'job_type' => BasalamProducts::JOB_UPDATE_SINGLE], 'message' => __('marketplace.basalam_queued')]);
    }

    public function productArchive(Request $request): JsonResponse
    {
        $product = $this->product($request, $this->productId($request));

        return $this->run(fn () => $this->products($request)->archive($product));
    }

    public function productRestore(Request $request): JsonResponse
    {
        $product = $this->product($request, $this->productId($request));

        return $this->run(fn () => $this->products($request)->restore($product));
    }

    public function productDisconnect(Request $request): JsonResponse
    {
        $product = $this->product($request, $this->productId($request));

        return response()->json(['data' => ['ok' => true, 'disconnected' => $this->products($request)->disconnect($product)], 'message' => __('marketplace.basalam_disconnected_product')]);
    }

    public function productConnect(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_id' => ['required', 'integer', 'min:1'],
            'variant_id' => ['nullable', 'integer', 'min:1'],
            'basalam_product_id' => ['required', 'integer', 'min:1'],
        ]);
        $product = $this->product($request, (int) $data['product_id']);
        $variant = ! empty($data['variant_id']) ? ProductVariant::query()->where('product_id', $product->id)->findOrFail((int) $data['variant_id']) : null;

        return $this->run(function () use ($request, $product, $variant, $data) {
            if (! $this->products($request)->connect($product, $variant, (string) $data['basalam_product_id'])) {
                throw new MarketplaceException(__('marketplace.basalam_connect_invalid'), 422);
            }

            return response()->json(['data' => ['ok' => true], 'message' => __('marketplace.basalam_connected_product')]);
        });
    }

    public function productInfo(Request $request, int $product): JsonResponse
    {
        $model = $this->product($request, $product);
        $products = $this->products($request);
        $maps = $products->maps($model)->map(fn ($m) => [
            'id' => $m->id,
            'variant_id' => $m->product_variant_id,
            'remote_product_id' => $m->remote_product_id,
            'remote_url' => $m->remote_product_id ? 'https://basalam.com/p/'.$m->remote_product_id : null,
            'status' => (int) (($m->meta ?? [])['status'] ?? BasalamProducts::STATUS_ACTIVE),
            'remote_price' => $m->remote_price,
            'remote_stock' => $m->remote_stock,
            'last_sync_at' => $m->last_sync_at?->toIso8601String(),
            'last_error' => $m->last_error,
        ])->values();
        $preview = null;
        try {
            $preview = ['price' => $products->price($model), 'stock' => $products->stock($model), 'name' => $products->name($model), 'category_ids' => $products->categoryIds($model)];
        } catch (MarketplaceException $e) {
            $preview = ['error' => $e->getMessage()];
        }

        return response()->json(['data' => [
            'maps' => $maps,
            'meta' => BasalamProducts::productMeta($model),
            'is_variable' => $products->isVariable($model),
            'preview' => $preview,
        ]]);
    }

    /** Per-product Basalam fields stored in `meta.marketplace.basalam`. */
    public function saveProductMeta(Request $request, int $product): JsonResponse
    {
        $model = $this->product($request, $product);
        $data = $request->validate([
            'unit_type' => ['nullable', 'integer', 'min:1'],
            'unit_quantity' => ['nullable', 'integer', 'min:1'],
            'is_wholesale' => ['nullable', 'boolean'],
            'price_change' => ['nullable', 'string', 'max:20'],
            'variant_price_change' => ['nullable', 'array'],
            'variant_price_change.*' => ['nullable', 'string', 'max:20'],
            'is_mobile' => ['nullable', 'boolean'],
            'mobile' => ['nullable', 'array'],
            'mobile.*' => ['nullable', 'string', 'max:100'],
            'is_gold' => ['nullable', 'boolean'],
            'gold' => ['nullable', 'array'],
            'gold.*' => ['nullable', 'string', 'max:100'],
            'video_url' => ['nullable', 'string', 'max:2000'],
            'category_ids' => ['nullable', 'array', 'max:3'],
            'category_ids.*' => ['integer', 'min:1'],
            'preparation_days' => ['nullable', 'integer', 'min:0', 'max:60'],
        ]);
        foreach (['price_change'] as $key) {
            if (isset($data[$key]) && $data[$key] !== '') {
                $data[$key] = BasalamSettings::normalizePriceChange($data[$key]);
            }
        }
        if (isset($data['variant_price_change'])) {
            $data['variant_price_change'] = array_map(fn ($v) => $v === null || $v === '' ? null : BasalamSettings::normalizePriceChange($v), $data['variant_price_change']);
            $data['variant_price_change'] = array_filter($data['variant_price_change'], fn ($v) => $v !== null);
        }
        $clean = array_filter($data, fn ($v) => $v !== null && $v !== '' && $v !== []);
        $meta = (array) ($model->meta ?? []);
        $meta['marketplace'] = (array) ($meta['marketplace'] ?? []);
        $meta['marketplace']['basalam'] = $clean;
        $model->meta = $meta;
        $model->save();

        return response()->json(['data' => ['meta' => $clean], 'message' => __('marketplace.saved')]);
    }

    public function remoteSearch(Request $request): JsonResponse
    {
        return $this->run(fn () => $this->products($request)->remoteProducts((string) $request->query('q', ''), $request->query('cursor')));
    }

    // ── Commission ──────────────────────────────────────────────────────

    public function commission(Request $request): JsonResponse
    {
        return response()->json(['data' => ['ok' => true] + BasalamCommission::for($this->tid($request))->summary()]);
    }

    public function commissionImport(Request $request): JsonResponse
    {
        $data = $request->validate([
            'action' => ['nullable', 'string', 'in:seed,csv'],
            'csv' => ['nullable', 'string', 'max:2000000'],
            'csv_base64' => ['nullable', 'string', 'max:3000000'],
            'file' => ['nullable', 'file', 'max:4096'],
            'enable_commission' => ['nullable', 'boolean'],
        ]);
        $enable = ! array_key_exists('enable_commission', $data) || $data['enable_commission'] === null || (bool) $data['enable_commission'];
        $commission = BasalamCommission::for($this->tid($request));
        $csv = (string) ($data['csv'] ?? '');
        if ($csv === '' && ! empty($data['csv_base64'])) {
            $csv = (string) (base64_decode((string) $data['csv_base64'], true) ?: '');
        }
        if ($csv === '' && $request->hasFile('file')) {
            $csv = (string) file_get_contents($request->file('file')->getRealPath());
        }

        return $this->run(function () use ($commission, $data, $csv, $enable) {
            if (($data['action'] ?? '') === 'seed' || trim($csv) === '') {
                $result = $commission->seedFromBundledTariff($enable);
                $source = 'mehr_1405_bundled';
            } else {
                $result = $commission->importCsv($csv, $enable);
                $source = 'csv';
            }

            return response()->json(['data' => ['ok' => true, 'source' => $source, 'matched' => (int) ($result['matched'] ?? 0), 'unmatched' => (int) ($result['unmatched'] ?? 0)] + $commission->summary(), 'message' => __('marketplace.basalam_commission_imported')]);
        });
    }

    // ── Categories ──────────────────────────────────────────────────────

    public function categories(Request $request): JsonResponse
    {
        return $this->run(fn () => ['categories' => BasalamCategories::for($this->tid($request))->tree($request->boolean('refresh'))]);
    }

    public function categoriesDetect(Request $request): JsonResponse
    {
        $data = $request->validate(['title' => ['required', 'string', 'max:255']]);

        return $this->run(fn () => ['ok' => true, 'prediction' => BasalamCategories::for($this->tid($request))->prediction($data['title'])]);
    }

    public function categoryAttributes(Request $request): JsonResponse
    {
        $data = $request->validate(['category_id' => ['required', 'integer', 'min:1']]);

        return $this->run(function () use ($request, $data) {
            $cats = BasalamCategories::for($this->tid($request));
            $id = (int) $data['category_id'];

            return ['attributes' => $cats->attributes($id), 'groups' => $cats->attributeGroups($id), 'max_preparation_days' => $cats->maxPreparationDays($id)];
        });
    }

    public function optionMaps(Request $request): JsonResponse
    {
        return response()->json(['data' => ['maps' => BasalamCategories::for($this->tid($request))->optionMaps()]]);
    }

    public function saveOptionMap(Request $request): JsonResponse
    {
        $cats = BasalamCategories::for($this->tid($request));

        return $this->run(function () use ($cats, $request) {
            $cats->saveOptionMap($request->all());

            return ['maps' => $cats->optionMaps()];
        });
    }

    public function deleteOptionMap(Request $request): JsonResponse
    {
        $data = $request->validate(['id' => ['required', 'integer', 'min:1']]);

        return response()->json(['data' => ['ok' => BasalamCategories::for($this->tid($request))->deleteOptionMap((int) $data['id'])]]);
    }

    public function mappings(Request $request): JsonResponse
    {
        return response()->json(['data' => ['mappings' => BasalamCategories::for($this->tid($request))->mappings()]]);
    }

    public function saveMapping(Request $request): JsonResponse
    {
        $cats = BasalamCategories::for($this->tid($request));

        return $this->run(function () use ($cats, $request) {
            $cats->saveMapping($request->all());

            return ['mappings' => $cats->mappings()];
        });
    }

    public function deleteMapping(Request $request): JsonResponse
    {
        $data = $request->validate(['id' => ['required', 'integer', 'min:1']]);

        return response()->json(['data' => ['ok' => BasalamCategories::for($this->tid($request))->deleteMapping((int) $data['id'])]]);
    }

    // ── Orders ──────────────────────────────────────────────────────────

    public function ordersList(Request $request): JsonResponse
    {
        $page = max(1, (int) $request->query('page', 1));
        $per = min(100, max(1, (int) $request->query('per_page', 20)));
        $q = MarketplaceOrderMap::query()->where('tenant_id', $this->tid($request))->where('platform', 'basalam')->whereNotNull('order_id');
        $total = (clone $q)->count();
        $rows = $q->with('order')->orderByDesc('id')->forPage($page, $per)->get();

        return response()->json(['data' => [
            'orders' => $rows->map(function (MarketplaceOrderMap $m) {
                $o = $m->order;
                $meta = (array) (($o?->meta ?? [])['basalam'] ?? []);

                return [
                    'id' => $m->order_id,
                    'number' => $o?->number,
                    'invoice_id' => (int) $m->remote_order_id,
                    'payment_id' => $meta['customer']['payment_id'] ?? null,
                    'remote_status' => $m->status,
                    'status' => $o?->status,
                    'total_minor' => $o?->total_minor,
                    'currency' => $o?->currency,
                    'date' => $o?->created_at?->toIso8601String(),
                    'customer' => $o?->customer_name,
                    'tracking' => (string) ($meta['tracking_code'] ?? ''),
                    'last_sync_at' => $m->last_sync_at?->toIso8601String(),
                ];
            })->all(),
            'total' => $total,
            'page' => $page,
            'per_page' => $per,
        ]]);
    }

    public function ordersPull(Request $request): JsonResponse
    {
        $days = BasalamOrders::clampDays($request->input('days', $request->input('day')), 90);
        $this->sync->enqueue($this->tid($request), 'basalam', BasalamOrders::JOB_FETCH, ['cursor' => null, 'day' => $days], 4, 0, 'basalam:pull:'.$days.':'.now()->format('YmdHi'));

        return response()->json(['data' => ['ok' => true, 'job_type' => BasalamOrders::JOB_FETCH, 'day' => $days], 'message' => __('marketplace.basalam_queued')]);
    }

    public function orderInfo(Request $request, int $order): JsonResponse
    {
        $model = $this->order($request, $order);
        $map = MarketplaceOrderMap::query()->where('tenant_id', $this->tid($request))->where('platform', 'basalam')->where('order_id', $model->id)->first();
        if (! $map) {
            return response()->json(['message' => __('marketplace.basalam_order_not_basalam')], 404);
        }
        $meta = (array) (($model->meta ?? [])['basalam'] ?? []);

        return response()->json(['data' => [
            'invoice_id' => (int) $map->remote_order_id,
            'remote_status' => $map->status,
            'status_key' => $meta['status_key'] ?? null,
            'tracking_code' => $meta['tracking_code'] ?? null,
            'shipping_method_id' => $meta['shipping_method_id'] ?? null,
            'items' => $meta['items'] ?? [],
            'customer' => $meta['customer'] ?? null,
            'cancel_reasons' => BasalamEndpoints::CANCEL_REASONS,
            'shipping_methods' => BasalamEndpoints::SHIPPING_METHODS,
            'last_sync_at' => $map->last_sync_at?->toIso8601String(),
        ]]);
    }

    public function orderConfirm(Request $request, int $order): JsonResponse
    {
        $model = $this->order($request, $order);

        return $this->run(fn () => response()->json(['data' => $this->orders($request)->confirm($model), 'message' => __('marketplace.basalam_order_confirmed')]));
    }

    public function orderCancel(Request $request, int $order): JsonResponse
    {
        $data = $request->validate(['description' => ['nullable', 'string', 'max:1000'], 'reason_id' => ['nullable', 'integer', 'min:1']]);
        $model = $this->order($request, $order);

        return $this->run(fn () => response()->json(['data' => $this->orders($request)->cancel($model, (string) ($data['description'] ?? ''), (int) ($data['reason_id'] ?? 3481)), 'message' => __('marketplace.basalam_order_cancelled')]));
    }

    public function orderCancelRequest(Request $request, int $order): JsonResponse
    {
        $data = $request->validate(['description' => ['nullable', 'string', 'max:1000']]);
        $model = $this->order($request, $order);

        return $this->run(fn () => response()->json(['data' => $this->orders($request)->cancelRequest($model, (string) ($data['description'] ?? '')), 'message' => __('marketplace.basalam_order_cancel_requested')]));
    }

    public function orderDelay(Request $request, int $order): JsonResponse
    {
        $data = $request->validate(['postpone_days' => ['nullable', 'integer', 'min:1', 'max:60'], 'days' => ['nullable', 'integer', 'min:1', 'max:60'], 'description' => ['nullable', 'string', 'max:1000']]);
        $model = $this->order($request, $order);
        $days = (int) ($data['postpone_days'] ?? $data['days'] ?? 0);

        return $this->run(fn () => response()->json(['data' => $this->orders($request)->delay($model, $days, (string) ($data['description'] ?? '')), 'message' => __('marketplace.basalam_order_delayed')]));
    }

    public function orderTracking(Request $request, int $order): JsonResponse
    {
        $data = $request->validate([
            'tracking_code' => ['required', 'string', 'max:100'],
            'phone' => ['required', 'string', 'max:20'],
            'shipping_method' => ['nullable', 'integer', 'min:1'],
        ]);
        $model = $this->order($request, $order);

        return $this->run(fn () => response()->json(['data' => $this->orders($request)->tracking($model, $data['tracking_code'], $data['phone'], (int) ($data['shipping_method'] ?? 3197)), 'message' => __('marketplace.basalam_order_tracking_saved')]));
    }

    public function orderResync(Request $request, int $order): JsonResponse
    {
        $model = $this->order($request, $order);

        return $this->run(fn () => $this->orders($request)->importInvoice($this->orders($request)->invoiceOf($model)));
    }

    // ── Finance ─────────────────────────────────────────────────────────

    public function financeBalance(Request $request): JsonResponse
    {
        return $this->run(function () use ($request) {
            $this->requireConnected($request);

            return ['ok' => true] + BasalamFinance::for($this->tid($request))->overview(max(1, (int) $request->query('page', 1)), 10);
        });
    }

    public function financeBanks(Request $request): JsonResponse
    {
        return $this->run(function () use ($request) {
            $this->requireConnected($request);
            $banks = BasalamFinance::for($this->tid($request))->banks();

            return ['ok' => ! empty($banks['success']), 'banks' => $banks];
        });
    }

    public function financeSettlement(Request $request): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['required', 'integer', 'min:1'],
            'method' => ['required', 'integer', 'min:1'],
            'bank_account_id' => ['nullable', 'integer', 'min:1'],
            'investment_option_id' => ['nullable', 'integer', 'min:1'],
        ]);

        return $this->run(function () use ($request, $data) {
            $this->requireConnected($request);
            $result = BasalamFinance::for($this->tid($request))->createSettlement(
                (int) $data['amount'],
                (int) $data['method'],
                isset($data['investment_option_id']) ? (int) $data['investment_option_id'] : null,
                isset($data['bank_account_id']) ? (int) $data['bank_account_id'] : null,
            );

            return response()->json(['data' => ['ok' => true, 'result' => $result], 'message' => __('marketplace.basalam_settlement_requested')]);
        });
    }

    public function tickets(): JsonResponse
    {
        return response()->json(['data' => ['tickets' => [], 'disabled' => true, 'hint' => __('marketplace.basalam_tickets_disabled')]]);
    }
}
