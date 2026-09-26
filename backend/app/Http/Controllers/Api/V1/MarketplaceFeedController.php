<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\Marketplace\Adapters\EmallsAdapter;
use App\Services\Marketplace\Adapters\SnapppaySearchAdapter;
use App\Services\Marketplace\Adapters\TorobAdapter;
use App\Services\Marketplace\Adapters\ZarehbinAdapter;
use App\Services\Marketplace\MarketplaceAdapterRegistry;
use App\Services\Marketplace\MarketplaceSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public crawler feeds and Torob APIs. Responses are raw JSON (not enveloped) so crawler contracts match WordPress.
 */
class MarketplaceFeedController extends Controller
{
    public function __construct(protected MarketplaceSettingsService $settings) {}

    protected function tid(Request $request): int
    {
        return (int) $request->attributes->get('public_tenant_id');
    }

    protected function raw(array $data, int $status = 200): JsonResponse
    {
        return response()->json($data, $status, [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    // ── Emalls ──────────────────────────────────────────────────────────

    public function emalls(Request $request): JsonResponse
    {
        $tid = $this->tid($request);
        if (! $this->settings->isEnabled($tid, 'emalls')) {
            return $this->raw(['code' => 'wnc_em_disabled', 'message' => __('marketplace.platform_disabled'), 'data' => ['status' => 403]], 403);
        }
        /** @var EmallsAdapter $adapter */
        $adapter = MarketplaceAdapterRegistry::make('emalls', $tid);
        $version = (string) ($adapter->credentialsPublic()['version'] ?? '1.3.0');
        $token = trim((string) $request->input('token', ''));
        $limit = min(max(1, (int) $request->input('limit', 50)), 100);
        $page = max(1, (int) $request->input('page', 1));

        $needSession = false;
        if (! $adapter->tokenCacheValid($token)) {
            $verify = $adapter->verifyToken($token);
            if ($verify === 'network') {
                return $this->raw(['Error' => __('marketplace.feed_auth_unreachable')], 500);
            }
            if ($verify !== true) {
                return $this->raw(array_merge(['Error' => 'Invalid token'], $adapter->metadata()), 401);
            }
            $needSession = true;
        }

        $expand = $adapter->expand();
        $page_ = $adapter->catalog()->page($page, $limit, $expand);
        $products = array_map(fn ($e) => $adapter->productPayload($e[0], $e[1], $expand), $page_['entries']);

        return $this->raw([
            'count' => $page_['total'],
            'max_pages' => $page_['max_pages'],
            'products' => $products,
            'Version' => $version,
            'NeedSession' => $needSession,
            'TokenSendByEmalls' => $token,
            'SignedBy' => 'webino',
            'metadata' => $adapter->metadata(),
        ]);
    }

    // ── Zarehbin ────────────────────────────────────────────────────────

    public function zarehbin(Request $request): JsonResponse
    {
        $tid = $this->tid($request);
        if (! $this->settings->isEnabled($tid, 'zarehbin')) {
            return $this->raw(['code' => 'wnc_zb_disabled', 'message' => __('marketplace.platform_disabled'), 'data' => ['status' => 403]], 403);
        }
        /** @var ZarehbinAdapter $adapter */
        $adapter = MarketplaceAdapterRegistry::make('zarehbin', $tid);
        $token = trim(str_ireplace('Bearer ', '', (string) $request->header('Authorization', '')));
        $verify = $adapter->verifyToken($token);
        if ($verify !== true) {
            return $this->raw(['code' => 'authorization_error', 'message' => $verify, 'data' => ['status' => 403]], 403);
        }

        $expand = $adapter->expand();
        $productId = (int) $request->input('product_id', 0);
        $page = max(1, (int) $request->input('page', 1));
        $count = (int) $request->input('count', 0);
        if ($count <= 0) {
            $count = max(1, (int) ($adapter->credentialsPublic()['per_page'] ?? 50));
        }

        if ($productId > 0) {
            $product = $adapter->catalog()->baseQuery()->find($productId);
            $entries = $product ? $adapter->catalog()->entriesFor(collect([$product]), $expand) : [];
            $products = array_map(fn ($e) => $adapter->productPayload($e[0], $e[1], $expand), $entries);

            return $this->raw(['code' => 'success', 'message' => 'درخواست موفق بود', 'data' => [
                'status' => 200, 'count' => count($products), 'current_page' => 1, 'total_page' => 1, 'products' => $products,
            ]]);
        }

        $result = $adapter->catalog()->page($page, $count, $expand);

        return $this->raw(['code' => 'success', 'message' => 'درخواست موفق بود', 'data' => [
            'status' => 200,
            'count' => $result['total'],
            'current_page' => $page,
            'total_page' => $result['max_pages'],
            'products' => array_map(fn ($e) => $adapter->productPayload($e[0], $e[1], $expand), $result['entries']),
        ]]);
    }

    // ── SnappPay search ─────────────────────────────────────────────────

    public function snapppay(Request $request): JsonResponse
    {
        $tid = $this->tid($request);
        if (! $this->settings->isEnabled($tid, 'snapppay-search')) {
            return $this->raw(['code' => 'wnc_sps_disabled', 'message' => __('marketplace.platform_disabled'), 'data' => ['status' => 403]], 403);
        }
        /** @var SnapppaySearchAdapter $adapter */
        $adapter = MarketplaceAdapterRegistry::make('snapppay-search', $tid);
        $verify = $adapter->verifyApiKey((string) ($request->header('x-api-key') ?? $request->header('x_api_key') ?? ''));
        if ($verify === 'network') {
            return $this->raw(['code' => 'error', 'message' => 'Authentication server could not be reached.', 'data' => ['status' => 503]], 503);
        }
        if ($verify !== true) {
            return $this->raw(['code' => 'rest_forbidden', 'message' => 'Invalid API Key.', 'data' => ['status' => 401]], 401);
        }

        $expand = $adapter->expand();
        $include = filter_var($request->input('include_content', false), FILTER_VALIDATE_BOOLEAN);
        $catalog = $adapter->catalog();
        $ids = array_filter(array_map('intval', explode(',', (string) $request->input('products', ''))));
        $slugs = array_filter(array_map('trim', explode(',', (string) $request->input('slugs', ''))));

        if ($ids || $slugs) {
            $q = $catalog->baseQuery();
            $ids ? $q->whereIn('id', $ids) : $q->whereIn('slug', $slugs);
            $entries = $catalog->entriesFor($q->get(), $expand);
            $data = ['products' => array_map(fn ($e) => $adapter->productPayload($e[0], $e[1], $expand, $include), $entries)];
        } else {
            $limit = max(1, (int) $request->input('limit', 100));
            $page = max(1, (int) $request->input('page', 1));
            $result = $catalog->page($page, $limit, $expand);
            $data = [
                'count' => $result['total'],
                'max_pages' => $result['max_pages'],
                'products' => array_map(fn ($e) => $adapter->productPayload($e[0], $e[1], $expand, $include), $result['entries']),
            ];
        }
        $data['plugin_version'] = (string) ($adapter->credentialsPublic()['version'] ?? '1.0.2');
        $data['wc_version'] = 'not_installed';
        $data['wp_version'] = null;

        return $this->raw($data);
    }

    // ── Torob ───────────────────────────────────────────────────────────

    protected function torob(Request $request): TorobAdapter
    {
        /** @var TorobAdapter $a */
        $a = MarketplaceAdapterRegistry::make('torob', $this->tid($request));

        return $a;
    }

    protected function torobGuard(Request $request, TorobAdapter $adapter): ?JsonResponse
    {
        $v = $adapter->validateRequestToken($request->header('X-Torob-Token'), $request->header('X-Torob-Token-Version'));
        if ($v['ok']) {
            return null;
        }
        $data = ['status' => $v['status']];
        if (isset($v['current_server_time'])) {
            $data['current_server_time'] = $v['current_server_time'];
        }

        return $this->raw(['code' => $v['code'], 'message' => $v['message'], 'data' => $data], $v['status']);
    }

    public function torobLegacy(Request $request): JsonResponse
    {
        $adapter = $this->torob($request);
        if ($deny = $this->torobGuard($request, $adapter)) {
            return $deny;
        }
        if (! $this->settings->isEnabled($this->tid($request), 'torob')) {
            return $this->raw(['error' => 'Torob platform is disabled'], 403);
        }
        $catalog = $adapter->catalog();
        $expand = filter_var($request->input('variation', false), FILTER_VALIDATE_BOOLEAN) || $adapter->expand();
        $ids = array_filter(array_map('intval', explode(',', (string) $request->input('products', ''))));
        $slugs = array_filter(array_map('trim', explode(',', urldecode((string) $request->input('slugs', '')))));

        if ($ids || $slugs) {
            $q = $catalog->baseQuery();
            $ids ? $q->whereIn('id', $ids) : $q->whereIn('slug', $slugs);
            $entries = $catalog->entriesFor($q->get(), $expand);
            $data = ['products' => array_map(fn ($e) => $adapter->productPayload($e[0], $e[1], $expand), $entries)];
        } else {
            $limit = max(1, (int) $request->input('limit', 100) ?: 100);
            $page = max(1, (int) $request->input('page', 1));
            $result = $catalog->page($page, $limit, $expand);
            $data = [
                'count' => $result['total'],
                'current_page' => $page,
                'max_pages' => $result['max_pages'],
                'products' => array_map(fn ($e) => $adapter->productPayload($e[0], $e[1], $expand), $result['entries']),
            ];
        }
        $data['api_version'] = TorobAdapter::LEGACY_API_VERSION;
        $data['metadata'] = $adapter->metadata();

        return $this->raw($data);
    }

    public function torobV3(Request $request): JsonResponse
    {
        $adapter = $this->torob($request);
        if ($deny = $this->torobGuard($request, $adapter)) {
            return $deny;
        }
        if (! $this->settings->isEnabled($this->tid($request), 'torob')) {
            return $this->raw(['error' => 'Torob platform is disabled'], 403);
        }
        $body = $request->json()->all();
        if (! is_array($body) || $body === []) {
            return $this->raw(['error' => 'Request body is empty or invalid'], 400);
        }
        $catalog = $adapter->catalog();
        $expand = $adapter->expand();
        $wrap = fn (array $products, int $page, int $total, int $max) => [
            'api_version' => 'torob_api_v3',
            'current_page' => $page,
            'total' => $total,
            'max_pages' => max(1, $max),
            'products' => array_values($products),
        ];

        if (isset($body['page_urls']) && is_array($body['page_urls'])) {
            if (count($body['page_urls']) < 1) {
                return $this->raw(['error' => 'page_urls must contain at least one item'], 400);
            }
            $rows = [];
            foreach ($body['page_urls'] as $url) {
                $hit = is_string($url) ? $catalog->resolveUrl($url) : null;
                if ($hit) {
                    $rows[] = $adapter->productPayloadV3($hit[0], $hit[1], $expand);
                }
            }

            return $this->raw($wrap($rows, 1, count($rows), 1));
        }
        if (isset($body['page_uniques']) && is_array($body['page_uniques'])) {
            if (count($body['page_uniques']) < 1) {
                return $this->raw(['error' => 'page_uniques must contain at least one item'], 400);
            }
            $rows = [];
            foreach ($body['page_uniques'] as $u) {
                $hit = is_scalar($u) ? $catalog->resolvePageUnique((string) $u) : null;
                if ($hit) {
                    $rows[] = $adapter->productPayloadV3($hit[0], $hit[1], $expand);
                }
            }

            return $this->raw($wrap($rows, 1, count($rows), 1));
        }
        $hasPage = array_key_exists('page', $body);
        $hasSort = array_key_exists('sort', $body);
        if ($hasPage || $hasSort) {
            if (! $hasPage || ! $hasSort) {
                return $this->raw(['error' => $hasPage ? 'sort parameter is not provided' : 'page parameter is not provided'], 400);
            }
            $page = (int) $body['page'];
            $sort = (string) $body['sort'];
            if ($page < 1) {
                return $this->raw(['error' => 'page must be >= 1'], 400);
            }
            if (! in_array($sort, ['date_added_desc', 'date_updated_desc'], true)) {
                return $this->raw(['error' => 'sort must be date_added_desc or date_updated_desc'], 400);
            }
            $result = $catalog->page($page, 100, $expand, $sort);
            $rows = array_map(fn ($e) => $adapter->productPayloadV3($e[0], $e[1], $expand), $result['entries']);

            return $this->raw($wrap($rows, $page, $result['total'], $result['max_pages']));
        }

        return $this->raw(['error' => 'Invalid request parameters'], 400);
    }

    public function torobSetToken(Request $request): JsonResponse
    {
        $adapter = $this->torob($request);
        if ($deny = $this->torobGuard($request, $adapter)) {
            return $deny;
        }
        if (! $adapter->option('product_page_webhook_enabled')) {
            return $this->raw(['error' => 'product page webhook is disabled'], 409);
        }
        $token = TorobAdapter::sanitizeOpaque((string) $request->input('token', '')) ?? '';
        if ($token === '') {
            return $this->raw(['error' => 'token parameter is required'], 400);
        }
        $adapter->setWebhookToken($token);

        return $this->raw(['success' => true]);
    }

    public function torobOrderStatus(Request $request): JsonResponse
    {
        $adapter = $this->torob($request);
        if ($deny = $this->torobGuard($request, $adapter)) {
            return $deny;
        }
        if (! $adapter->option('order_status_enabled')) {
            return $this->raw(['error' => 'Order status endpoint is disabled'], 403);
        }
        $phone = trim((string) $request->query('customer_phone', ''));
        if ($phone === '') {
            return $this->raw(['error' => 'customer_phone parameter is required'], 400);
        }
        if (! preg_match('/^09\d{9}$/', $phone)) {
            return $this->raw(['error' => 'customer_phone must be a valid 11-digit Iranian mobile number starting with 09'], 400);
        }
        $pattern = substr($phone, 1);
        $orders = Order::query()
            ->where('tenant_id', $this->tid($request))
            ->where('created_at', '>=', now()->subMonths(6)->subSecond())
            ->where('customer_phone', 'like', '%'.$pattern.'%')
            ->orderByDesc('created_at')
            ->limit(100)
            ->get();
        $pricing = $adapter->catalog()->pricing();
        $site = $adapter->catalog()->siteUrl();

        $rows = [];
        foreach ($orders as $order) {
            $status = TorobAdapter::torobStatus($order);
            $row = [
                'order_number' => (string) $order->number,
                'order_date' => $order->created_at?->toIso8601String(),
                'order_status' => $status,
                'customer_phone' => $phone,
                'total_amount' => (int) round($pricing->toRial((int) $order->total_minor, $order->currency) / 10),
                'order_url' => $site.'/account/orders/'.$order->id,
            ];
            if (filled($order->customer_name)) {
                $row['customer_name'] = (string) $order->customer_name;
            }
            $exp = TorobAdapter::explanation($order, $status);
            if ($exp !== '') {
                $row['explanation'] = $exp;
            }
            $rows[] = $row;
        }

        return $this->raw(['api_version' => 'torob_order_status_api_v1', 'total_orders' => count($rows), 'orders' => $rows]);
    }

    public function torobOrders(Request $request): JsonResponse
    {
        $adapter = $this->torob($request);
        if ($deny = $this->torobGuard($request, $adapter)) {
            return $deny;
        }
        if (! $adapter->option('orders_list_api_enabled')) {
            return $this->raw(['success' => false, 'error' => 'Orders list API is disabled by the administrator.'], 403);
        }
        $limit = (int) $request->query('limit', 0);
        if ($limit < 1 || $limit > 1000) {
            return $this->raw(['success' => false, 'error' => 'limit must be between 1 and 1000'], 400);
        }
        $ts = TorobAdapter::parseIso((string) $request->query('purchase_timestamp_gt', ''));
        if ($ts === false) {
            return $this->raw(['success' => false, 'error' => 'Invalid timestamp format. Use ISO 8601 UTC format.'], 400);
        }
        $ts = TorobAdapter::lookback($ts);
        $out = [];
        foreach ($adapter->trackedOrders($ts, $limit * 2) as $order) {
            $row = $adapter->formatTrackedOrder($order);
            if (! $row) {
                continue;
            }
            $p = TorobAdapter::parseIso($row['purchase_timestamp']);
            $l = TorobAdapter::parseIso((string) $row['last_updated_timestamp']);
            if (($p !== false && $p > $ts) || ($l !== false && $l > $ts)) {
                $out[] = $row;
            }
            if (count($out) >= $limit) {
                break;
            }
        }

        return $this->raw(['success' => true, 'data' => $out]);
    }

    public function torobActions(Request $request): JsonResponse
    {
        $adapter = $this->torob($request);
        if ($deny = $this->torobGuard($request, $adapter)) {
            return $deny;
        }
        if (! $adapter->option('action_tracking_enabled')) {
            return $this->raw(['success' => false, 'error' => 'Action tracking API is disabled by the administrator.'], 403);
        }
        $limit = (int) $request->query('limit', 0);
        if ($limit < 1 || $limit > 1000) {
            return $this->raw(['success' => false, 'error' => 'limit must be between 1 and 1000'], 400);
        }
        $ts = TorobAdapter::parseIso((string) $request->query('timestamp_gt', ''));
        if ($ts === false) {
            return $this->raw(['success' => false, 'error' => 'Invalid timestamp format. Use ISO 8601 UTC format.'], 400);
        }
        $ts = TorobAdapter::lookback($ts);
        $out = [];
        foreach ($adapter->trackedOrders($ts, $limit * 3) as $order) {
            $created = $order->created_at?->timestamp ?? 0;
            $last = max($created, $order->updated_at?->timestamp ?? $created);
            $isNew = $created > $ts;
            $isUpdate = $last > $ts && ($last - $created) <= 7 * 86400;
            if (! $isNew && ! $isUpdate) {
                continue;
            }
            $out[] = [
                'timestamp' => TorobAdapter::formatIso($created),
                'last_updated_timestamp' => TorobAdapter::formatIso($last),
                'torob_clid' => (string) ($order->meta['torob_clid'] ?? ''),
                'status' => in_array($order->status, ['cancelled', 'refunded', 'failed'], true) ? 'cancelled' : 'completed',
                'action_type' => 'purchase',
            ];
            if (count($out) >= $limit) {
                break;
            }
        }
        usort($out, fn ($a, $b) => strcmp($a['timestamp'], $b['timestamp']));

        return $this->raw(['success' => true, 'data' => array_values($out)]);
    }
}
