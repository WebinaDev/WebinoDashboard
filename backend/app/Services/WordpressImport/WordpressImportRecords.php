<?php

namespace App\Services\WordpressImport;

use App\Models\AttributeGroup;
use App\Models\BlogCategory;
use App\Models\BlogPost;
use App\Models\BlogTag;
use App\Models\Brand;
use App\Models\BuilderTemplate;
use App\Models\CmsPage;
use App\Models\Coupon;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderNote;
use App\Models\OrderReturn;
use App\Models\Product;
use App\Models\ProductAttribute;
use App\Models\ProductAttributeTerm;
use App\Models\ProductDownload;
use App\Models\ProductReview;
use App\Models\SupportTicket;
use App\Models\SupportTicketReply;
use App\Models\User;
use App\Models\WalletSetting;
use App\Models\WordpressImportQueue;
use App\Models\WordpressRedirect;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Shipping\ShippingZonesService;
use App\Services\Shop\ShopSettings;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * Resources added after the original catalog import. Unknown resources are
 * stored on the operator review queue instead of being dropped.
 */
final class WordpressImportRecords
{
    public function import(ImportContext $ctx, string $resource, string $externalId, array $payload): ImportOutcome
    {
        return match ($resource) {
            'brands' => $this->brand($ctx, $externalId, $payload),
            'blog_categories' => $this->blogCategory($ctx, $externalId, $payload),
            'blog_tags' => $this->blogTag($ctx, $externalId, $payload),
            'coupons' => $this->coupon($ctx, $externalId, $payload),
            'reviews' => $this->review($ctx, $externalId, $payload),
            'redirects' => $this->redirect($ctx, $externalId, $payload),
            'elementor_templates' => $this->template($ctx, $externalId, $payload),
            'attribute_groups' => $this->attributeGroup($ctx, $externalId, $payload),
            'staff' => $this->staff($ctx, $externalId, $payload),
            'settings' => $this->settings($ctx, $externalId, $payload),
            'permalinks' => $this->permalink($ctx, $externalId, $payload),
            'waiting_list' => $this->waitingList($ctx, $externalId, $payload),
            'review_queue' => $this->reviewQueue($ctx, $externalId, $payload),
            'tickets' => $this->ticket($ctx, $externalId, $payload),
            'returns' => $this->orderReturn($ctx, $externalId, $payload),
            'wallet' => $this->wallet($ctx, $externalId, $payload),
            default => $this->queue($ctx, $resource, $externalId, $payload, 'needs_mapping'),
        };
    }

    public function relink(ImportContext $ctx): void
    {
        if ($ctx->dryRun()) {
            return;
        }
        app(WordpressImportReviewQueue::class)->applyPending($ctx->tenantId(), (int) $ctx->job->id);
        $items = $ctx->job->items()->where('status', 'done')->get();
        foreach ($items as $item) {
            $payload = is_array($item->payload) ? $item->payload : [];
            if ($item->resource === 'products') {
                $link = $ctx->find('products', $item->external_id);
                $product = $link ? Product::query()->where('tenant_id', $ctx->tenantId())->find($link->local_id) : null;
                if ($product) {
                    $this->syncBrands($ctx, $product, $payload);
                    $this->syncProductRefs($ctx, $product, $payload);
                }
            }
            if ($item->resource === 'pages') {
                $link = $ctx->find('pages', $item->external_id);
                $page = $link ? CmsPage::query()->where('tenant_id', $ctx->tenantId())->find($link->local_id) : null;
                $parentExternal = trim((string) ($payload['parent_external_id'] ?? ''));
                if ($page && $parentExternal !== '') {
                    $parent = $ctx->find('pages', $parentExternal);
                    if ($parent && (int) $parent->local_id !== (int) $page->id) {
                        $page->parent_id = (int) $parent->local_id;
                        $page->save();
                    }
                }
            }
        }
    }

    /** @param  array<string, mixed>  $payload */
    public function syncBrands(ImportContext $ctx, Product $product, array $payload): void
    {
        $ids = [];
        $refs = $payload['brand_external_ids'] ?? $payload['brands'] ?? [];
        if (isset($payload['brand']) && is_array($payload['brand'])) {
            $refs[] = $payload['brand'];
        }
        if (! is_array($refs)) {
            return;
        }
        foreach ($refs as $ref) {
            if (is_scalar($ref)) {
                $link = $ctx->find('brands', (string) $ref);
                if ($link) {
                    $ids[] = (int) $link->local_id;
                }

                continue;
            }
            if (! is_array($ref)) {
                continue;
            }
            $external = trim((string) ($ref['external_id'] ?? $ref['source_id'] ?? ''));
            $link = $external !== '' ? $ctx->find('brands', $external) : null;
            if (! $link && trim((string) ($ref['name'] ?? '')) !== '') {
                $created = $this->brand($ctx, $external !== '' ? $external : 'name-'.md5((string) $ref['name']), $ref);
                if ($created->localId) {
                    $ids[] = $created->localId;
                }

                continue;
            }
            if ($link) {
                $ids[] = (int) $link->local_id;
            }
        }
        $product->brands()->sync(array_values(array_unique($ids)));
    }

    /** @param  array<string, mixed>  $payload */
    public function syncDownloads(ImportContext $ctx, Product $product, array $payload): void
    {
        $downloads = is_array($payload['downloads'] ?? null) ? $payload['downloads'] : [];
        if ($downloads === []) {
            return;
        }
        $product->downloads()->delete();
        foreach ($downloads as $index => $download) {
            if (! is_array($download)) {
                continue;
            }
            $name = trim((string) ($download['name'] ?? 'دانلود'));
            $path = trim((string) ($download['file'] ?? $download['url'] ?? $download['storage_path'] ?? ''));
            if ($path === '' && empty($download['data_base64'])) {
                continue;
            }
            if (! empty($download['data_base64']) && is_string($download['data_base64'])) {
                $path = $this->storeDownload($ctx, $product, $download, $index) ?? $path;
            }
            ProductDownload::query()->create([
                'tenant_id' => $ctx->tenantId(),
                'product_id' => $product->id,
                'name' => mb_substr($name !== '' ? $name : 'دانلود', 0, 255),
                'storage_path' => mb_substr($path, 0, 2000),
                'original_name' => mb_substr((string) ($download['filename'] ?? $name), 0, 255),
                'download_limit' => isset($download['limit']) ? (int) $download['limit'] : null,
                'sort_order' => $index,
            ]);
        }
    }

    /** @param  array<string, mixed>  $payload */
    public function syncProductRefs(ImportContext $ctx, Product $product, array $payload): void
    {
        $map = function (string $key) use ($ctx, $payload): array {
            $ids = [];
            foreach (is_array($payload[$key] ?? null) ? $payload[$key] : [] as $external) {
                $link = $ctx->find('products', (string) $external);
                if ($link) {
                    $ids[] = (int) $link->local_id;
                }
            }

            return $ids;
        };
        $product->related_ids = $map('related_external_ids');
        $product->upsell_ids = $map('upsell_external_ids');
        $product->cross_sell_ids = $map('cross_sell_external_ids');
        $grouped = $map('grouped_external_ids');
        if ($grouped !== []) {
            $meta = is_array($product->meta) ? $product->meta : [];
            $meta['grouped_ids'] = $grouped;
            $product->meta = $meta;
        }
        $product->save();
    }

    /** @param  array<string, mixed>  $payload */
    public function extraOrderLines(ImportContext $ctx, Order $order, array $payload): void
    {
        foreach ([
            'shipping_lines' => 'shipping',
            'coupon_lines' => 'coupon',
            'fee_lines' => 'fee',
            'refunds' => 'refund',
            'refund_lines' => 'refund',
        ] as $key => $lineType) {
            foreach (is_array($payload[$key] ?? null) ? $payload[$key] : [] as $line) {
                if (! is_array($line)) {
                    continue;
                }
                $this->adjustmentItem($ctx, $order, $line, $lineType);
                if ($lineType === 'refund') {
                    $this->storeRefund($ctx, $order, $line);
                }
            }
        }
        if (isset($payload['coupon_code']) || isset($payload['coupon'])) {
            $code = trim((string) ($payload['coupon_code'] ?? (is_array($payload['coupon'] ?? null) ? ($payload['coupon']['code'] ?? '') : $payload['coupon'])));
            if ($code !== '') {
                $order->coupon_code = mb_substr($code, 0, 64);
                $coupon = Coupon::query()->where('tenant_id', $ctx->tenantId())->where('code', $code)->first();
                $order->coupon_id = $coupon?->id;
                $order->save();
            }
        }
        $this->orderNotes($ctx, $order, $payload);
    }

    /** @param  array<string, mixed>  $payload */
    public function rememberPermalink(ImportContext $ctx, string $resource, string $externalId, array $payload, string $localPath): void
    {
        $from = $payload['permalink'] ?? $payload['link'] ?? $payload['old_path'] ?? null;
        if (! is_string($from) || trim($from) === '') {
            return;
        }
        $path = $ctx->mapper->safeHref($from, $ctx->sourceHost());
        if ($path === '' || $ctx->dryRun()) {
            return;
        }
        $this->upsertRedirect($ctx, $path, $localPath, 301, 'permalink', $resource, $externalId, false);
    }

    /** @param  array<string, mixed>  $payload */
    public function seo(array $payload): ?array
    {
        $seo = is_array($payload['seo'] ?? null) ? $payload['seo'] : [];
        $rank = is_array($payload['rank_math'] ?? null) ? $payload['rank_math'] : [];
        $yoast = is_array($payload['yoast'] ?? null) ? $payload['yoast'] : [];
        $title = $seo['title'] ?? $payload['seo_title'] ?? $rank['title'] ?? $rank['rank_math_title'] ?? $yoast['title'] ?? $payload['rank_math_title'] ?? $payload['_yoast_wpseo_title'] ?? null;
        $description = $seo['description'] ?? $payload['seo_description'] ?? $rank['description'] ?? $yoast['description'] ?? $payload['rank_math_description'] ?? $payload['_yoast_wpseo_metadesc'] ?? null;
        $keyword = $seo['focus_keyword'] ?? $payload['focus_keyword'] ?? $rank['focus_keyword'] ?? $yoast['focus_keyword'] ?? $payload['rank_math_focus_keyword'] ?? $payload['_yoast_wpseo_focuskw'] ?? null;
        $clean = array_filter([
            'title' => is_scalar($title) ? mb_substr(trim((string) $title), 0, 255) : null,
            'description' => is_scalar($description) ? mb_substr(trim((string) $description), 0, 2000) : null,
            'focus_keyword' => is_scalar($keyword) ? mb_substr(trim((string) $keyword), 0, 191) : null,
        ], fn ($value) => $value !== null && $value !== '');
        if (isset($payload['menu_order'])) {
            $clean['menu_order'] = (int) $payload['menu_order'];
        }
        $author = trim((string) ($payload['author_name'] ?? (is_array($payload['author'] ?? null) ? ($payload['author']['name'] ?? $payload['author']['display_name'] ?? '') : (is_string($payload['author'] ?? null) ? $payload['author'] : ''))));
        if ($author !== '') {
            $clean['author_name'] = mb_substr($author, 0, 255);
        }
        $email = trim((string) ($payload['author_email'] ?? $payload['author']['email'] ?? ''));
        if ($email !== '') {
            $clean['author_email'] = mb_substr($email, 0, 255);
        }

        return $clean === [] ? null : $clean;
    }

    /** @param  array<string, int>  $unmapped */
    public function unmappedMessage(array $unmapped): ?string
    {
        if ($unmapped === []) {
            return null;
        }

        return 'Unmapped Elementor widgets kept as HTML: '.implode(', ', array_keys($unmapped));
    }

    /** @param  array<string, mixed>  $payload */
    private function brand(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        $name = trim((string) ($payload['name'] ?? $payload['title'] ?? ''));
        if ($name === '') {
            throw new InvalidArgumentException('Brand name is required.');
        }
        $link = $ctx->find('brands', $externalId);
        $row = $link ? Brand::query()->where('tenant_id', $ctx->tenantId())->find($link->local_id) : null;
        $slug = $ctx->uniqueSlug(Brand::class, $ctx->mapper->slug(isset($payload['slug']) ? (string) $payload['slug'] : null, $name), $row?->id);
        if ($ctx->dryRun()) {
            return $ctx->outcome($link !== null, Brand::class, $row?->id);
        }
        $meta = is_array($row?->meta) ? $row->meta : [];
        $seo = $this->seo($payload);
        if ($seo) {
            $meta['seo'] = $seo;
        }
        $row = $row ?? new Brand;
        $row->fill([
            'tenant_id' => $ctx->tenantId(),
            'name' => mb_substr($name, 0, 255),
            'slug' => $slug,
            'description' => $this->text($payload['description'] ?? null, 5000),
            'image_url' => $this->text($payload['image_url'] ?? null, 2000) ?? $row->image_url,
            'meta' => $meta,
        ]);
        $row->save();
        $ctx->link('brands', $externalId, Brand::class, (int) $row->id, $this->guid($payload));
        $this->rememberPermalink($ctx, 'brands', $externalId, $payload, '/brand/'.$row->slug);

        return $ctx->outcome($link !== null, Brand::class, (int) $row->id);
    }

    /** @param  array<string, mixed>  $payload */
    private function blogCategory(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        $name = trim((string) ($payload['name'] ?? ''));
        if ($name === '') {
            throw new InvalidArgumentException('Blog category name is required.');
        }
        $link = $ctx->find('blog_categories', $externalId);
        $row = $link ? BlogCategory::query()->where('tenant_id', $ctx->tenantId())->find($link->local_id) : null;
        $slug = $ctx->uniqueSlug(BlogCategory::class, $ctx->mapper->slug(isset($payload['slug']) ? (string) $payload['slug'] : null, $name), $row?->id);
        if ($ctx->dryRun()) {
            return $ctx->outcome($link !== null, BlogCategory::class, $row?->id);
        }
        $row = $row ?? new BlogCategory;
        $row->fill([
            'tenant_id' => $ctx->tenantId(),
            'name' => mb_substr($name, 0, 255),
            'slug' => $slug,
            'seo' => $this->seo($payload) ?? $row->seo,
        ]);
        $row->save();
        $ctx->link('blog_categories', $externalId, BlogCategory::class, (int) $row->id, $this->guid($payload));

        return $ctx->outcome($link !== null, BlogCategory::class, (int) $row->id);
    }

    /** @param  array<string, mixed>  $payload */
    private function blogTag(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        $name = trim((string) ($payload['name'] ?? ''));
        if ($name === '') {
            throw new InvalidArgumentException('Blog tag name is required.');
        }
        $link = $ctx->find('blog_tags', $externalId);
        $row = $link ? BlogTag::query()->where('tenant_id', $ctx->tenantId())->find($link->local_id) : null;
        $slug = $ctx->uniqueSlug(BlogTag::class, $ctx->mapper->slug(isset($payload['slug']) ? (string) $payload['slug'] : null, $name), $row?->id);
        if ($ctx->dryRun()) {
            return $ctx->outcome($link !== null, BlogTag::class, $row?->id);
        }
        $row = $row ?? new BlogTag;
        $row->fill([
            'tenant_id' => $ctx->tenantId(),
            'name' => mb_substr($name, 0, 255),
            'slug' => $slug,
        ]);
        $row->save();
        $ctx->link('blog_tags', $externalId, BlogTag::class, (int) $row->id, $this->guid($payload));

        return $ctx->outcome($link !== null, BlogTag::class, (int) $row->id);
    }

    /** @param  array<string, mixed>  $payload */
    private function coupon(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        $code = trim((string) ($payload['code'] ?? $payload['title'] ?? ''));
        if ($code === '') {
            throw new InvalidArgumentException('Coupon code is required.');
        }
        $type = match (strtolower((string) ($payload['discount_type'] ?? $payload['type'] ?? 'percent'))) {
            'fixed_cart', 'fixed' => 'fixed_cart',
            'fixed_product' => 'fixed_product',
            default => 'percent',
        };
        $amount = $type === 'percent'
            ? max(0, (int) round((float) ($payload['amount'] ?? 0)))
            : $ctx->minor($payload, 'amount');
        $link = $ctx->find('coupons', $externalId);
        $row = $link ? Coupon::query()->where('tenant_id', $ctx->tenantId())->find($link->local_id) : null;
        if (! $row) {
            $row = Coupon::query()->where('tenant_id', $ctx->tenantId())->where('code', $code)->first();
        }
        $existed = $row !== null;
        if ($ctx->dryRun()) {
            return $ctx->outcome($existed, Coupon::class, $row?->id);
        }
        $status = $ctx->publishContent() && $ctx->mapper->contentPublished((string) ($payload['status'] ?? 'publish'))
            ? 'publish'
            : 'draft';
        $row = $row ?? new Coupon;
        $row->fill([
            'tenant_id' => $ctx->tenantId(),
            'code' => mb_substr($code, 0, 64),
            'type' => $type,
            'amount' => $amount,
            'free_shipping' => (bool) ($payload['free_shipping'] ?? false),
            'individual_use' => (bool) ($payload['individual_use'] ?? false),
            'exclude_sale' => (bool) ($payload['exclude_sale_items'] ?? $payload['exclude_sale'] ?? false),
            'min_spend_minor' => $this->optionalMinor($ctx, $payload, 'minimum_amount') ?? $this->optionalMinor($ctx, $payload, 'min_spend'),
            'max_spend_minor' => $this->optionalMinor($ctx, $payload, 'maximum_amount') ?? $this->optionalMinor($ctx, $payload, 'max_spend'),
            'usage_limit' => isset($payload['usage_limit']) ? (int) $payload['usage_limit'] : null,
            'usage_limit_per_user' => isset($payload['usage_limit_per_user']) ? (int) $payload['usage_limit_per_user'] : null,
            'usage_count' => (int) ($payload['usage_count'] ?? $row->usage_count ?? 0),
            'expires_at' => $ctx->mapper->date($payload['expires_at'] ?? $payload['date_expires'] ?? null),
            'status' => $status,
            'description' => $this->text($payload['description'] ?? null, 5000),
            'restrictions' => [
                'wordpress' => ['external_id' => $externalId],
                'product_ids' => $payload['product_ids'] ?? [],
                'excluded_product_ids' => $payload['excluded_product_ids'] ?? [],
            ],
        ]);
        $row->save();
        $ctx->link('coupons', $externalId, Coupon::class, (int) $row->id, $this->guid($payload));

        return $ctx->outcome($existed, Coupon::class, (int) $row->id, $ctx->publishContent() ? null : 'Coupon kept as draft because publish_content is off.');
    }

    /** @param  array<string, mixed>  $payload */
    private function review(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        $productExternal = trim((string) ($payload['product_external_id'] ?? $payload['product_source_id'] ?? ''));
        $product = $productExternal !== '' ? $ctx->find('products', $productExternal) : null;
        if (! $product) {
            throw new InvalidArgumentException('Review product is not imported yet.');
        }
        $body = trim((string) ($payload['content'] ?? $payload['body'] ?? $payload['review'] ?? ''));
        if ($body === '') {
            throw new InvalidArgumentException('Review body is required.');
        }
        $link = $ctx->find('reviews', $externalId);
        $row = $link ? ProductReview::query()->where('tenant_id', $ctx->tenantId())->find($link->local_id) : null;
        if ($ctx->dryRun()) {
            return $ctx->outcome($link !== null, ProductReview::class, $row?->id);
        }
        $rawStatus = (string) ($payload['status'] ?? $payload['comment_approved'] ?? 'pending');
        $status = in_array($rawStatus, ['1', 'approve', 'approved'], true)
            ? ProductReview::STATUS_APPROVED
            : ProductReview::normalizeStoredStatus($rawStatus);
        $row = $row ?? new ProductReview;
        $row->fill([
            'tenant_id' => $ctx->tenantId(),
            'product_id' => (int) $product->local_id,
            'rating' => max(1, min(5, (int) ($payload['rating'] ?? 5))),
            'body' => mb_substr($body, 0, 10000),
            'author_name' => $this->text($payload['author_name'] ?? $payload['author'] ?? null, 255),
            'status' => $status,
        ]);
        $row->save();
        $ctx->link('reviews', $externalId, ProductReview::class, (int) $row->id, $this->guid($payload));

        return $ctx->outcome($link !== null, ProductReview::class, (int) $row->id);
    }

    /** @param  array<string, mixed>  $payload */
    private function redirect(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        $fromRaw = (string) ($payload['from'] ?? $payload['from_path'] ?? '');
        if ($fromRaw === '' && is_string($payload['source'] ?? null) && (str_starts_with($payload['source'], '/') || str_contains($payload['source'], '://'))) {
            $fromRaw = $payload['source'];
        }
        $from = $ctx->mapper->safeHref($fromRaw, $ctx->sourceHost());
        $to = $ctx->mapper->safeHref((string) ($payload['target'] ?? $payload['to'] ?? $payload['to_path'] ?? $payload['url'] ?? ''), $ctx->sourceHost());
        if ($from === '' || $to === '') {
            throw new InvalidArgumentException('Redirect needs a source and a target.');
        }
        $state = strtolower(trim((string) ($payload['status'] ?? 'active')));
        if (in_array($state, ['inactive', 'disabled', 'trash', 'draft'], true)) {
            return $this->queue($ctx, 'redirects', $externalId, $payload, 'needs_mapping', 'Inactive redirect kept for review and was not published.');
        }
        $code = (int) ($payload['code'] ?? $payload['status_code'] ?? 301);
        if (! in_array($code, [301, 302, 307, 308], true)) {
            $code = 301;
        }
        if ($ctx->dryRun()) {
            return $ctx->outcome(false, WordpressRedirect::class, null);
        }
        $row = $this->upsertRedirect($ctx, $from, $to, $code, 'redirect', 'redirects', $externalId, true);
        $ctx->link('redirects', $externalId, WordpressRedirect::class, (int) $row->id, $this->guid($payload));

        return $ctx->outcome(false, WordpressRedirect::class, (int) $row->id);
    }

    /** @param  array<string, mixed>  $payload */
    private function template(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        $title = trim((string) ($payload['title'] ?? $payload['name'] ?? 'قالب المنتور'));
        $kind = strtolower((string) ($payload['template_type'] ?? $payload['location'] ?? $payload['type'] ?? 'section'));
        $converter = app(ElementorToBuilderConverter::class);
        $supplied = $converter->preferDocument($payload);
        $converted = $supplied === null ? $converter->convertRecord($payload) : null;
        $document = $supplied ?? $converted['document'] ?? [
            'version' => 1,
            'sections' => [[
                'id' => 'el_tpl_'.$ctx->mapper->safeId($externalId),
                'columns' => [[
                    'id' => 'el_tpl_col_'.$ctx->mapper->safeId($externalId),
                    'span' => 12,
                    'widgets' => [[
                        'id' => 'el_tpl_html_'.$ctx->mapper->safeId($externalId),
                        'type' => 'html',
                        'props' => ['html' => '<div class="webino-unmapped" data-widget="elementor-template">'.e($title).'</div>'],
                    ]],
                ]],
            ]],
        ];
        $message = $converted ? $this->unmappedMessage($converted['unmapped']) : null;
        $chrome = in_array($kind, ['header', 'footer'], true) ? $kind : null;
        if ($ctx->dryRun()) {
            return $ctx->outcome(false, $chrome ? BuilderTemplate::class : CmsPage::class, null, $message);
        }
        if ($chrome) {
            $existing = BuilderTemplate::preferred($ctx->tenantId(), $chrome);
            $taken = $existing && is_array($existing->draft) && (($existing->draft['source'] ?? '') === 'elementor');
            $owner = $ctx->find('elementor_templates', $externalId);
            $owns = $owner && (int) $owner->local_id === (int) $existing?->id && $owner->local_type === BuilderTemplate::class;
            if ($existing && $taken && ! $owns) {
                return $this->templatePage($ctx, $externalId, $title, $kind, $document, $message);
            }
            $template = $existing ?? new BuilderTemplate([
                'tenant_id' => $ctx->tenantId(),
                'kind' => $chrome,
                'slug' => $chrome,
                'is_default' => true,
                'priority' => 0,
            ]);
            $template->title = mb_substr($title, 0, 255);
            $template->draft = $document;
            if ($ctx->publishContent()) {
                $template->published = $document;
            }
            $template->save();
            $ctx->link('elementor_templates', $externalId, BuilderTemplate::class, (int) $template->id, $this->guid($payload));

            return $ctx->outcome($owner !== null, BuilderTemplate::class, (int) $template->id, $message);
        }

        return $this->templatePage($ctx, $externalId, $title, $kind, $document, $message);
    }

    /**
     * @param  array<string, mixed>  $document
     */
    private function templatePage(ImportContext $ctx, string $externalId, string $title, string $kind, array $document, ?string $message): ImportOutcome
    {
        $link = $ctx->find('elementor_templates', $externalId);
        $row = $link && $link->local_type === CmsPage::class
            ? CmsPage::query()->where('tenant_id', $ctx->tenantId())->find($link->local_id)
            : null;
        $slug = $ctx->uniqueSlug(CmsPage::class, $ctx->mapper->slug(null, 'elementor-'.$kind.'-'.$title), $row?->id);
        $publish = $ctx->publishContent();
        $row = $row ?? new CmsPage;
        $row->fill([
            'tenant_id' => $ctx->tenantId(),
            'title' => mb_substr($title, 0, 255),
            'slug' => $row->slug ?: $slug,
            'builder_draft' => $document,
            'builder_published' => $publish ? $document : $row->builder_published,
            'published' => $publish,
            'status' => $publish ? 'published' : 'draft',
            'excerpt' => 'Elementor '.$kind,
        ]);
        $row->save();
        $ctx->link('elementor_templates', $externalId, CmsPage::class, (int) $row->id);

        return $ctx->outcome($link !== null, CmsPage::class, (int) $row->id, $message);
    }

    /** @param  array<string, mixed>  $payload */
    private function attributeGroup(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        $name = trim((string) ($payload['name'] ?? 'ویژگی‌ها'));
        $attributeIds = [];
        foreach (is_array($payload['attributes'] ?? null) ? $payload['attributes'] : [] as $attribute) {
            if (! is_array($attribute)) {
                continue;
            }
            $attrName = trim((string) ($attribute['name'] ?? ''));
            if ($attrName === '') {
                continue;
            }
            $slug = $ctx->mapper->slug(isset($attribute['slug']) ? (string) $attribute['slug'] : null, $attrName, 80);
            $type = in_array(($attribute['type'] ?? ''), ['select', 'color', 'image', 'button', 'label'], true)
                ? (string) $attribute['type']
                : 'select';
            $model = ProductAttribute::query()->firstOrCreate(
                ['tenant_id' => $ctx->tenantId(), 'slug' => $slug],
                ['name' => mb_substr($attrName, 0, 255), 'type' => $type, 'order_by' => 'menu_order', 'show_swatch_label' => $type !== 'select']
            );
            if ($model->type !== $type) {
                $model->type = $type;
                $model->show_swatch_label = $type !== 'select';
                $model->save();
            }
            foreach (is_array($attribute['terms'] ?? null) ? $attribute['terms'] : (is_array($attribute['options'] ?? null) ? $attribute['options'] : []) as $index => $term) {
                $termName = is_array($term) ? trim((string) ($term['name'] ?? '')) : trim((string) $term);
                if ($termName === '') {
                    continue;
                }
                $termSlug = $ctx->mapper->slug(is_array($term) ? (string) ($term['slug'] ?? '') : null, $termName, 80);
                ProductAttributeTerm::query()->updateOrCreate(
                    ['product_attribute_id' => $model->id, 'slug' => $termSlug],
                    [
                        'tenant_id' => $ctx->tenantId(),
                        'name' => mb_substr($termName, 0, 255),
                        'menu_order' => $index,
                        'color' => is_array($term) ? ($term['color'] ?? null) : null,
                        'image_url' => is_array($term) ? ($term['image_url'] ?? null) : null,
                    ]
                );
            }
            $attributeIds[] = (int) $model->id;
        }
        if ($ctx->dryRun()) {
            return $ctx->outcome(false, AttributeGroup::class, null);
        }
        $link = $ctx->find('attribute_groups', $externalId);
        $row = $link ? AttributeGroup::query()->where('tenant_id', $ctx->tenantId())->find($link->local_id) : null;
        $row = $row ?? new AttributeGroup;
        $row->fill([
            'tenant_id' => $ctx->tenantId(),
            'name' => mb_substr($name, 0, 255),
            'attribute_ids' => $attributeIds,
        ]);
        $row->save();
        $ctx->link('attribute_groups', $externalId, AttributeGroup::class, (int) $row->id, $this->guid($payload));

        return $ctx->outcome($link !== null, AttributeGroup::class, (int) $row->id);
    }

    /** @param  array<string, mixed>  $payload */
    private function staff(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        unset($payload['password'], $payload['user_pass'], $payload['pass']);
        $roleName = trim((string) ($payload['role'] ?? ''));
        if ($roleName === '' && is_array($payload['roles'] ?? null)) {
            $roleName = trim((string) ($payload['roles'][0] ?? 'staff'));
        }
        $role = $this->staffRole($roleName !== '' ? $roleName : 'staff');
        if ($role === null) {
            return $this->queue($ctx, 'staff', $externalId, $payload, 'needs_mapping', 'Customer accounts stay on the customers resource.');
        }
        $email = strtolower(trim((string) ($payload['email'] ?? '')));
        $name = trim((string) ($payload['name'] ?? $payload['display_name'] ?? $email));
        if ($name === '' || $email === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Staff name and email are required. Passwords are never copied.');
        }
        $owner = User::query()->where('email', $email)->first();
        if ($owner && (int) $owner->tenant_id !== $ctx->tenantId()) {
            return $this->queue($ctx, 'staff', $externalId, $this->redact($payload), 'needs_mapping', 'Email belongs to another tenant and was not copied.');
        }
        $link = $ctx->find('staff', $externalId);
        $row = $owner ?: ($link ? User::query()->find($link->local_id) : null);
        if ($ctx->dryRun()) {
            return $ctx->outcome($row !== null, User::class, $row?->id, 'Staff user will be asked to set a new password.');
        }
        if (! $row) {
            $row = new User([
                'tenant_id' => $ctx->tenantId(),
                'email' => $email,
                'password' => Str::password(40),
                'is_active' => true,
            ]);
        }
        $row->name = mb_substr($name, 0, 255);
        $row->email = $email;
        $row->role = $role;
        $row->password_must_change = true;
        $row->is_active = true;
        $row->save();
        $ctx->link('staff', $externalId, User::class, (int) $row->id, $this->guid($payload));

        return $ctx->outcome($link !== null || $owner !== null, User::class, (int) $row->id, 'Invite-safe staff user. WordPress password was not copied; password change is required.');
    }

    /** @param  array<string, mixed>  $payload */
    private function settings(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        if ($ctx->dryRun()) {
            return $ctx->outcome(false, 'settings', null);
        }
        $redacted = $this->redact($payload);
        $applied = [];
        if (is_array($payload['store'] ?? null) || is_array($payload['store_address'] ?? null)) {
            $this->applyStore($ctx, is_array($payload['store'] ?? null) ? $payload['store'] : $payload['store_address']);
            $applied[] = 'store';
        }
        if (is_array($payload['tax'] ?? null) || is_array($payload['tax_rates'] ?? null)) {
            $tax = is_array($payload['tax'] ?? null) ? $payload['tax'] : ['rates' => $payload['tax_rates']];
            $this->applyTax($ctx, $tax, $externalId);
            $applied[] = 'tax';
        }
        if (is_array($payload['shipping_zones'] ?? null)) {
            $this->applyShipping($ctx, $payload['shipping_zones']);
            $applied[] = 'shipping_zones';
        }
        $payments = $payload['payments'] ?? $payload['gateways'] ?? $payload['payment_gateways'] ?? null;
        if (is_array($payments)) {
            app(ModuleSettingsService::class)->put($ctx->tenantId(), 'settings', 'shop.gateways', ['gateways' => $this->redact($payments)]);
            $applied[] = 'gateways';
        }
        app(ModuleSettingsService::class)->put($ctx->tenantId(), 'settings', 'wordpress.import', $redacted);
        $queued = [];
        foreach (['emails', 'pwa', 'notify', 'brand_style', 'swatches', 'attribute_groups', 'modules', 'elementor_kit', 'yith', 'yith_waitlist', 'accounting', 'marketplace', 'bots', 'sms', 'otp'] as $key) {
            if (! array_key_exists($key, $payload)) {
                continue;
            }
            $value = $redacted[$key] ?? $payload[$key];
            $this->queue($ctx, 'settings_'.$key, $externalId.':'.$key, [
                'external_id' => $externalId.':'.$key,
                'label' => $key,
                'data' => $value,
            ], 'needs_mapping', 'Stored for operator review. Not applied automatically.');
            $queued[] = $key;
        }
        $ctx->link('settings', $externalId, 'settings', 0, $this->guid($payload));
        $message = 'Applied: '.($applied === [] ? 'none' : implode(', ', $applied));
        if ($queued !== []) {
            $message .= '. Queued for review: '.implode(', ', $queued);
        }

        return $ctx->outcome(false, 'settings', null, $message);
    }

    /** @param  array<string, mixed>  $store */
    private function applyStore(ImportContext $ctx, array $store): void
    {
        $current = ShopSettings::getGeneral($ctx->tenantId());
        $address = is_array($store['address'] ?? null) ? $store['address'] : $store;
        $current['store_address'] = array_merge($current['store_address'] ?? [], array_filter([
            'address_1' => $address['address_1'] ?? $address['address'] ?? null,
            'address_2' => $address['address_2'] ?? null,
            'city' => $address['city'] ?? null,
            'country' => $address['country'] ?? null,
            'state' => $address['state'] ?? null,
            'postcode' => $address['postcode'] ?? null,
        ], fn ($value) => is_scalar($value) && $value !== ''));
        if (! empty($store['currency']) && is_scalar($store['currency'])) {
            $current['currency'] = strtoupper((string) $store['currency']);
        }
        app(ModuleSettingsService::class)->put($ctx->tenantId(), ShopSettings::MODULE, ShopSettings::GENERAL_KEY, $current);
    }

    /** @param  array<string, mixed>  $tax */
    private function applyTax(ImportContext $ctx, array $tax, string $externalId): void
    {
        $current = ShopSettings::getTax($ctx->tenantId());
        if (array_key_exists('enabled', $tax)) {
            $current['enabled'] = (bool) $tax['enabled'];
        }
        $rates = is_array($tax['rates'] ?? null) ? $tax['rates'] : [];
        $first = is_array($rates[0] ?? null) ? $rates[0] : null;
        $percent = is_array($first)
            ? ($first['rate'] ?? $first['rate_percent'] ?? $first['tax_rate'] ?? null)
            : ($tax['rate_percent'] ?? $tax['rate'] ?? null);
        if (is_numeric($percent)) {
            $current['rate_percent'] = (float) $percent;
        }
        app(ModuleSettingsService::class)->put($ctx->tenantId(), ShopSettings::MODULE, ShopSettings::TAX_KEY, $current);
        if (count($rates) > 1) {
            $this->queue($ctx, 'settings_tax_rates', $externalId.':tax', [
                'external_id' => $externalId.':tax',
                'rates' => $this->redact($rates),
            ], 'needs_mapping', 'Multiple tax rates kept for review. The first rate was applied.');
        }
    }

    /** @param  list<mixed>  $zones */
    private function applyShipping(ImportContext $ctx, array $zones): void
    {
        $service = app(ShippingZonesService::class);
        $cfg = $service->getConfig($ctx->tenantId());
        $built = [];
        $nextZone = 1;
        $nextMethod = 1;
        foreach ($zones as $zone) {
            if (! is_array($zone)) {
                continue;
            }
            $methods = [];
            foreach (is_array($zone['methods'] ?? null) ? $zone['methods'] : [] as $method) {
                if (! is_array($method)) {
                    continue;
                }
                $settings = is_array($method['settings'] ?? null) ? $method['settings'] : [];
                $raw = strtolower((string) ($method['method_id'] ?? $method['id'] ?? 'flat_rate'));
                $methodId = match ($raw) {
                    'free_shipping' => 'free_shipping',
                    'local_pickup' => 'local_pickup',
                    'tapin' => 'tapin',
                    default => 'flat_rate',
                };
                $settings = $methodId === 'free_shipping'
                    ? ['min_amount' => (int) ($method['min_amount'] ?? $settings['min_amount'] ?? 0)]
                    : ['cost' => (int) ($method['cost'] ?? $method['cost_minor'] ?? $settings['cost'] ?? $settings['cost_minor'] ?? 0), 'original_method_id' => $raw];
                $methods[] = [
                    'instance_id' => $nextMethod++,
                    'method_id' => $methodId,
                    'title' => mb_substr((string) ($method['title'] ?? $raw), 0, 255),
                    'enabled' => (bool) ($method['enabled'] ?? true),
                    'settings' => $settings,
                ];
            }
            $locations = [];
            foreach (is_array($zone['locations'] ?? null) ? $zone['locations'] : [] as $location) {
                if (is_array($location) && ! empty($location['type']) && ! empty($location['code'])) {
                    $locations[] = ['type' => (string) $location['type'], 'code' => (string) $location['code']];
                }
            }
            $built[] = [
                'id' => $nextZone++,
                'name' => mb_substr((string) ($zone['name'] ?? 'Zone'), 0, 255),
                'order' => count($built),
                'locations' => $locations !== [] ? $locations : [['type' => 'country', 'code' => 'IR']],
                'methods' => $methods,
                'external_id' => (string) ($zone['id'] ?? $zone['external_id'] ?? ''),
            ];
        }
        $cfg['zones'] = $built;
        $cfg['next_zone_id'] = $nextZone;
        $cfg['next_method_id'] = $nextMethod;
        $service->putConfig($ctx->tenantId(), $cfg);
    }

    /** @param  array<string, mixed>  $payload */
    private function ticket(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        $subject = trim((string) ($payload['subject'] ?? $payload['title'] ?? ''));
        $userExternal = trim((string) ($payload['customer_external_id'] ?? $payload['user_external_id'] ?? ''));
        $user = $userExternal !== '' ? $ctx->find('customers', $userExternal) : null;
        if ($subject === '' || ! $user) {
            throw new InvalidArgumentException('Ticket needs a subject and an imported customer.');
        }
        if ($ctx->dryRun()) {
            return $ctx->outcome(false, SupportTicket::class, null);
        }
        $link = $ctx->find('tickets', $externalId);
        $row = $link ? SupportTicket::query()->where('tenant_id', $ctx->tenantId())->find($link->local_id) : null;
        $row = $row ?? new SupportTicket;
        $row->fill([
            'tenant_id' => $ctx->tenantId(),
            'user_id' => (int) $user->local_id,
            'subject' => mb_substr($subject, 0, 190),
            'status' => in_array(($payload['status'] ?? ''), ['open', 'pending', 'closed'], true) ? (string) $payload['status'] : 'open',
        ]);
        $row->save();
        $row->replies()->delete();
        foreach (is_array($payload['replies'] ?? null) ? $payload['replies'] : [] as $reply) {
            if (! is_array($reply) || trim((string) ($reply['body'] ?? '')) === '') {
                continue;
            }
            SupportTicketReply::query()->create([
                'tenant_id' => $ctx->tenantId(),
                'ticket_id' => $row->id,
                'user_id' => (int) $user->local_id,
                'is_staff' => (bool) ($reply['is_staff'] ?? false),
                'body' => mb_substr((string) $reply['body'], 0, 20000),
            ]);
        }
        $ctx->link('tickets', $externalId, SupportTicket::class, (int) $row->id, $this->guid($payload));

        return $ctx->outcome($link !== null, SupportTicket::class, (int) $row->id);
    }

    /** @param  array<string, mixed>  $payload */
    private function orderReturn(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        $orderExternal = trim((string) ($payload['order_external_id'] ?? ''));
        $order = $orderExternal !== '' ? $ctx->find('orders', $orderExternal) : null;
        if (! $order) {
            throw new InvalidArgumentException('Return needs an imported order.');
        }
        if ($ctx->dryRun()) {
            return $ctx->outcome(false, OrderReturn::class, null);
        }
        $link = $ctx->find('returns', $externalId);
        $row = $link ? OrderReturn::query()->where('tenant_id', $ctx->tenantId())->find($link->local_id) : null;
        $row = $row ?? new OrderReturn;
        $row->fill([
            'tenant_id' => $ctx->tenantId(),
            'order_id' => (int) $order->local_id,
            'status' => in_array(($payload['status'] ?? ''), ['requested', 'approved', 'rejected', 'received', 'refunded'], true) ? (string) $payload['status'] : 'refunded',
            'reason' => $this->text($payload['reason'] ?? null, 5000),
            'items' => is_array($payload['items'] ?? null) ? $payload['items'] : [],
            'refund_minor' => $ctx->minor($payload, 'amount') ?: $ctx->minor($payload, 'total'),
            'admin_note' => $this->text($payload['note'] ?? null, 5000),
        ]);
        $row->save();
        $ctx->link('returns', $externalId, OrderReturn::class, (int) $row->id, $this->guid($payload));

        return $ctx->outcome($link !== null, OrderReturn::class, (int) $row->id);
    }

    /** @param  array<string, mixed>  $payload */
    private function wallet(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        if ($ctx->dryRun()) {
            return $ctx->outcome(false, WalletSetting::class, null);
        }
        $row = WalletSetting::query()->firstOrNew(['tenant_id' => $ctx->tenantId()]);
        $row->payload = $this->redact($payload);
        $row->save();
        $ctx->link('wallet', $externalId, WalletSetting::class, (int) $row->id, $this->guid($payload));

        return $ctx->outcome(false, WalletSetting::class, (int) $row->id, 'Wallet settings stored without secrets. Customer balances are not moved unless sent on the customer.');
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function queue(ImportContext $ctx, string $resource, string $externalId, array $payload, string $status, ?string $message = null): ImportOutcome
    {
        $label = $this->text($payload['label'] ?? $payload['title'] ?? $payload['name'] ?? $resource, 255);
        if ($ctx->dryRun()) {
            return $ctx->outcome(false, WordpressImportQueue::class, null, $message ?? 'Would queue for review.');
        }
        $row = WordpressImportQueue::query()->updateOrCreate(
            [
                'tenant_id' => $ctx->tenantId(),
                'resource' => mb_substr($resource, 0, 64),
                'external_id' => mb_substr($externalId, 0, 191),
            ],
            [
                'job_id' => $ctx->job->id,
                'label' => $label,
                'status' => $status,
                'payload' => $this->redact($payload),
            ]
        );
        $summary = is_array($ctx->job->summary) ? $ctx->job->summary : [];
        $list = is_array($summary['needs_mapping'] ?? null) ? $summary['needs_mapping'] : [];
        $list[$resource.':'.$externalId] = [
            'resource' => $resource,
            'external_id' => $externalId,
            'label' => $label,
            'status' => $status,
        ];
        $summary['needs_mapping'] = array_slice($list, 0, 100, true);
        $ctx->job->summary = $summary;
        $ctx->job->save();
        $ctx->link('queue', $resource.':'.$externalId, WordpressImportQueue::class, (int) $row->id);

        return $ctx->outcome(false, WordpressImportQueue::class, (int) $row->id, $message ?? 'Queued for operator review (needs mapping).');
    }

    /** @param  array<string, mixed>  $line */
    private function adjustmentItem(ImportContext $ctx, Order $order, array $line, string $lineType): void
    {
        $qty = max(1, (int) ($line['quantity'] ?? 1));
        $unit = $ctx->minor($line, 'total');
        if ($unit === 0) {
            $unit = $ctx->minor($line, 'amount');
        }
        if ($unit === 0) {
            $unit = $ctx->minor($line, 'price');
        }
        OrderItem::query()->create([
            'order_id' => $order->id,
            'product_id' => null,
            'product_name' => mb_substr((string) ($line['name'] ?? $line['method_title'] ?? $line['code'] ?? $lineType), 0, 255),
            'sku' => null,
            'quantity' => $qty,
            'unit_price_minor' => $unit,
            'purchase_type' => 'cash',
            'meta' => [
                'line_type' => $lineType,
                'external_id' => (string) ($line['external_id'] ?? $line['id'] ?? ''),
                'code' => $line['code'] ?? $line['method_id'] ?? null,
            ],
        ]);
    }

    /** @param  array<string, mixed>  $line */
    private function storeRefund(ImportContext $ctx, Order $order, array $line): void
    {
        $external = trim((string) ($line['external_id'] ?? $line['id'] ?? ''));
        if ($external === '') {
            $external = 'refund-'.$order->id.'-'.md5(json_encode($line) ?: '');
        }
        $link = $ctx->find('refunds', $external);
        $row = $link ? OrderReturn::query()->find($link->local_id) : null;
        $row = $row ?? new OrderReturn;
        $row->fill([
            'tenant_id' => $ctx->tenantId(),
            'order_id' => $order->id,
            'status' => 'refunded',
            'reason' => $this->text($line['reason'] ?? $line['name'] ?? 'refund', 5000),
            'refund_minor' => $ctx->minor($line, 'total') ?: $ctx->minor($line, 'amount'),
            'items' => is_array($line['line_items'] ?? null) ? $line['line_items'] : [],
        ]);
        $row->save();
        $ctx->link('refunds', $external, OrderReturn::class, (int) $row->id);
    }

    /** @param  array<string, mixed>  $payload */
    private function orderNotes(ImportContext $ctx, Order $order, array $payload): void
    {
        $meta = is_array($order->meta) ? $order->meta : [];
        $previous = is_array($meta['wordpress_import']['note_ids'] ?? null) ? $meta['wordpress_import']['note_ids'] : [];
        if ($previous !== []) {
            OrderNote::query()->where('tenant_id', $ctx->tenantId())->where('order_id', $order->id)->whereIn('id', $previous)->delete();
        }
        $ids = [];
        $notes = is_array($payload['notes'] ?? null) ? $payload['notes'] : [];
        if (trim((string) ($payload['note'] ?? '')) !== '') {
            $notes[] = ['body' => $payload['note'], 'customer' => false];
        }
        foreach ($notes as $note) {
            if (is_string($note)) {
                $note = ['body' => $note, 'customer' => false];
            }
            if (! is_array($note) || trim((string) ($note['body'] ?? $note['content'] ?? '')) === '') {
                continue;
            }
            $created = OrderNote::query()->create([
                'tenant_id' => $ctx->tenantId(),
                'order_id' => $order->id,
                'body' => mb_substr((string) ($note['body'] ?? $note['content']), 0, 5000),
                'is_customer' => (bool) ($note['customer'] ?? $note['customer_note'] ?? false),
            ]);
            $ids[] = (int) $created->id;
        }
        $import = is_array($meta['wordpress_import'] ?? null) ? $meta['wordpress_import'] : [];
        $import['note_ids'] = $ids;
        $meta['wordpress_import'] = $import;
        $order->meta = $meta;
        $order->save();
    }

    /** @param  array<string, mixed>  $payload */
    private function permalink(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        $entity = strtolower(trim((string) ($payload['entity'] ?? '')));
        $entity = match ($entity) {
            'product' => 'products',
            'page' => 'pages',
            'post' => 'posts',
            default => $entity,
        };
        $slug = trim((string) ($payload['slug'] ?? ''));
        $objectId = trim((string) ($payload['object_source_id'] ?? $payload['object_external_id'] ?? ''));
        $local = match ($entity) {
            'products' => '/product/'.$slug,
            'pages' => '/pages/'.$slug,
            'posts' => '/blog/'.$slug,
            default => $slug !== '' ? '/'.$slug : '',
        };
        if ($objectId !== '' && $objectId !== '0') {
            $link = $ctx->find($entity, $objectId);
            $model = match ($entity) {
                'products' => Product::class,
                'pages' => CmsPage::class,
                'posts' => BlogPost::class,
                default => null,
            };
            if ($link && $model) {
                $row = $model::query()->where('tenant_id', $ctx->tenantId())->find($link->local_id);
                if ($row && is_string($row->slug) && $row->slug !== '') {
                    $prefix = match ($entity) {
                        'products' => '/product/',
                        'pages' => '/pages/',
                        default => '/blog/',
                    };
                    $local = $prefix.$row->slug;
                }
            }
        }
        $from = $ctx->mapper->safeHref((string) ($payload['path'] ?? $payload['permalink'] ?? ''), $ctx->sourceHost());
        if ($from === '' || $from === '/' || $local === '') {
            return $this->queue($ctx, 'permalinks', $externalId, $payload, 'needs_mapping', 'Permalink had no usable path or slug.');
        }
        if ($ctx->dryRun()) {
            return $ctx->outcome(false, WordpressRedirect::class, null);
        }
        $row = $this->upsertRedirect($ctx, $from, $local, 301, 'permalink', $entity !== '' ? $entity : 'permalinks', $objectId !== '' && $objectId !== '0' ? $objectId : $externalId, false);
        $ctx->link('permalinks', $externalId, WordpressRedirect::class, (int) $row->id, $this->guid($payload));

        return $ctx->outcome(false, WordpressRedirect::class, (int) $row->id);
    }

    /** @param  array<string, mixed>  $payload */
    private function waitingList(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        return $this->queue($ctx, 'waiting_list', $externalId, $payload, 'needs_mapping', 'YITH waiting list has no Webino model yet and was queued for review.');
    }

    /** @param  array<string, mixed>  $payload */
    private function reviewQueue(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        $kind = trim((string) ($payload['kind'] ?? 'review'));
        $outcome = $this->queue($ctx, 'review_queue', $externalId, $payload, 'needs_mapping', 'Queued for operator review ('.$kind.').');
        if ($ctx->dryRun() || ! in_array($kind, ['wallet', 'tickets', 'ticket', 'returns', 'return'], true)) {
            return $outcome;
        }
        $row = WordpressImportQueue::query()
            ->where('tenant_id', $ctx->tenantId())
            ->where('resource', 'review_queue')
            ->where('external_id', mb_substr($externalId, 0, 191))
            ->first();
        if (! $row) {
            return $outcome;
        }
        $applied = app(WordpressImportReviewQueue::class)->apply($row);
        if (! $applied['applied']) {
            return $ctx->outcome(false, WordpressImportQueue::class, (int) $row->id, $applied['message']);
        }

        return $ctx->outcome(false, $applied['local_type'], $applied['local_id'], $applied['message']);
    }

    private function upsertRedirect(ImportContext $ctx, string $from, string $to, int $code, string $kind, string $resource, string $externalId, bool $force): WordpressRedirect
    {
        $from = mb_substr($from, 0, 191);
        $existing = WordpressRedirect::query()->where('tenant_id', $ctx->tenantId())->where('from_path', $from)->first();
        if ($existing && $existing->kind === 'redirect' && $kind === 'permalink' && ! $force) {
            return $existing;
        }
        $row = $existing ?? new WordpressRedirect(['tenant_id' => $ctx->tenantId(), 'from_path' => $from]);
        $row->fill([
            'to_path' => mb_substr($to, 0, 500),
            'status_code' => $code,
            'kind' => $kind,
            'resource' => $resource,
            'external_id' => mb_substr($externalId, 0, 191),
        ]);
        $row->save();

        return $row;
    }

    /** @param  array<string, mixed>  $download */
    private function storeDownload(ImportContext $ctx, Product $product, array $download, int $index): ?string
    {
        $raw = $download['data_base64'];
        if (str_contains($raw, ',')) {
            $raw = substr($raw, (int) strrpos($raw, ',') + 1);
        }
        $bytes = base64_decode($raw, true);
        if ($bytes === false || $bytes === '' || strlen($bytes) > 16_777_216) {
            return null;
        }
        $name = preg_replace('/[^A-Za-z0-9._-]+/', '-', (string) ($download['filename'] ?? 'file-'.$index)) ?? 'file';
        $path = 'downloads/'.$ctx->tenantId().'/'.$product->id.'/'.$name;
        Storage::disk('local')->put($path, $bytes);

        return $path;
    }

    private function staffRole(string $role): ?string
    {
        return match (strtolower(trim($role))) {
            'administrator', 'admin', 'owner' => 'admin',
            'shop_manager' => 'shop_manager',
            'editor' => 'editor',
            'author' => 'author',
            'seller', 'vendor' => 'seller',
            'accountant' => 'accountant',
            'customer', 'subscriber' => null,
            default => 'staff',
        };
    }

    /** @param  array<string, mixed>  $payload */
    private function optionalMinor(ImportContext $ctx, array $payload, string $key): ?int
    {
        if (! array_key_exists($key, $payload) && ! array_key_exists($key.'_minor', $payload)) {
            return null;
        }

        return $ctx->minor($payload, $key);
    }

    /** @param  array<string, mixed>  $value */
    private function redact(array $value): array
    {
        $out = [];
        foreach ($value as $key => $item) {
            if (is_string($key) && preg_match('/password|secret|token|api[_-]?key|private[_-]?key|credential|merchant|passwd|consumer_(key|secret)/i', $key)) {
                $out[$key] = '[redacted]';

                continue;
            }
            $out[$key] = is_array($item) ? $this->redact($item) : $item;
        }

        return $out;
    }

    private function text(mixed $value, int $max): ?string
    {
        if (! is_scalar($value)) {
            return null;
        }
        $text = trim((string) $value);

        return $text === '' ? null : mb_substr($text, 0, $max);
    }

    /** @param  array<string, mixed>  $payload */
    private function guid(array $payload): ?string
    {
        $guid = trim((string) ($payload['source_guid'] ?? $payload['guid'] ?? $payload['permalink'] ?? ''));

        return $guid === '' ? null : mb_substr($guid, 0, 500);
    }
}
