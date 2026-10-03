<?php

namespace App\Services\WordpressImport;

use App\Models\BlogCategory;
use App\Models\BlogPost;
use App\Models\BlogTag;
use App\Models\BuilderTemplate;
use App\Models\Category;
use App\Models\CmsPage;
use App\Models\CustomerNote;
use App\Models\MediaAsset;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductAttribute;
use App\Models\ProductAttributeTerm;
use App\Models\ProductMedia;
use App\Models\ProductTag;
use App\Models\ProductVariant;
use App\Models\User;
use App\Models\WordpressImportLink;
use App\Services\Modules\ModuleSettingsService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;

final class WordpressImportImporter
{
    public function import(ImportContext $ctx, string $resource, array $payload): ImportOutcome
    {
        $externalId = trim((string) ($payload['external_id'] ?? ''));
        if ($externalId === '') {
            throw new InvalidArgumentException('external_id is required.');
        }

        return match ($resource) {
            'media' => $this->media($ctx, $externalId, $payload),
            'categories' => $this->category($ctx, $externalId, $payload),
            'tags' => $this->tag($ctx, $externalId, $payload),
            'customers' => $this->customer($ctx, $externalId, $payload),
            'products' => $this->product($ctx, $externalId, $payload),
            'pages' => $this->page($ctx, $externalId, $payload),
            'posts' => $this->post($ctx, $externalId, $payload),
            'orders' => $this->order($ctx, $externalId, $payload),
            'menus' => $this->menu($ctx, $externalId, $payload),
            'stats' => $this->stats($ctx, $externalId, $payload),
            default => app(WordpressImportRecords::class)->import($ctx, $resource, $externalId, $payload),
        };
    }

    public function fixCategoryParents(ImportContext $ctx): void
    {
        if ($ctx->dryRun()) {
            return;
        }
        $rows = Category::query()->where('tenant_id', $ctx->tenantId())->get();
        foreach ($rows as $row) {
            $meta = is_array($row->meta) ? $row->meta : [];
            $parentExternal = trim((string) ($meta['wordpress_parent_external_id'] ?? ''));
            if ($parentExternal === '') {
                continue;
            }
            $parent = $ctx->find('categories', $parentExternal);
            if (! $parent || (int) $parent->local_id === (int) $row->id) {
                continue;
            }
            if ((int) $row->parent_id !== (int) $parent->local_id) {
                $row->parent_id = (int) $parent->local_id;
                $row->save();
            }
        }
    }

    /** @param  array<string, mixed>  $payload */
    private function media(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        $existed = $ctx->find('media', $externalId) !== null;
        $url = $this->isFileMedia($payload)
            ? $ctx->storeFile($payload, $externalId)
            : $ctx->storeImage($payload, $externalId);
        $link = $ctx->find('media', $externalId);

        return $ctx->outcome($existed, MediaAsset::class, $link?->local_id, $url ? null : 'Image recorded without a stored file.');
    }

    /** @param  array<string, mixed>  $payload */
    private function category(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        $name = trim((string) ($payload['name'] ?? $payload['title'] ?? ''));
        if ($name === '') {
            throw new InvalidArgumentException('Category name is required.');
        }
        $link = $ctx->find('categories', $externalId);
        $row = $link ? Category::query()->where('tenant_id', $ctx->tenantId())->find($link->local_id) : null;
        $slug = $ctx->uniqueSlug(Category::class, $ctx->mapper->slug(
            isset($payload['slug']) ? (string) $payload['slug'] : null,
            $name
        ), $row?->id);
        $meta = is_array($row?->meta) ? $row->meta : [];
        $seo = app(WordpressImportRecords::class)->seo($payload);
        if ($seo) {
            $meta['seo'] = $seo;
        }
        $parentExternal = trim((string) ($payload['parent_external_id'] ?? ''));
        if ($parentExternal !== '') {
            $meta['wordpress_parent_external_id'] = $parentExternal;
        }
        $attributes = [
            'tenant_id' => $ctx->tenantId(),
            'name' => mb_substr($name, 0, 255),
            'slug' => $slug,
            'description' => isset($payload['description']) ? mb_substr(trim((string) $payload['description']), 0, 250) : $row?->description,
            'sort_order' => (int) ($payload['sort_order'] ?? $row?->sort_order ?? 0),
            'meta' => $meta,
        ];
        if (! $ctx->dryRun()) {
            if (! empty($payload['image']) && is_array($payload['image'])) {
                $attributes['image_url'] = $ctx->storeImage($payload['image']) ?? $row?->image_url;
            } elseif (! empty($payload['image_url'])) {
                $attributes['image_url'] = $ctx->storeImage([
                    'url' => (string) $payload['image_url'],
                    'external_id' => $externalId.'-image',
                    'alt' => $name,
                ]) ?? $row?->image_url;
            }
            $row = $row ?? new Category;
            $row->fill($attributes);
            $row->save();
            $ctx->link('categories', $externalId, Category::class, (int) $row->id, $this->guid($payload));
        }

        return $ctx->outcome($link !== null, Category::class, $row?->id);
    }

    /** @param  array<string, mixed>  $payload */
    private function tag(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        $name = trim((string) ($payload['name'] ?? ''));
        if ($name === '') {
            throw new InvalidArgumentException('Tag name is required.');
        }
        $link = $ctx->find('tags', $externalId);
        $row = $link ? ProductTag::query()->where('tenant_id', $ctx->tenantId())->find($link->local_id) : null;
        $slug = $ctx->uniqueSlug(ProductTag::class, $ctx->mapper->slug(
            isset($payload['slug']) ? (string) $payload['slug'] : null,
            $name
        ), $row?->id);
        if (! $ctx->dryRun()) {
            $row = $row ?? new ProductTag;
            $row->fill([
                'tenant_id' => $ctx->tenantId(),
                'name' => mb_substr($name, 0, 255),
                'slug' => $slug,
            ]);
            $row->save();
            $ctx->link('tags', $externalId, ProductTag::class, (int) $row->id, $this->guid($payload));
        }

        return $ctx->outcome($link !== null, ProductTag::class, $row?->id);
    }

    /** @param  array<string, mixed>  $payload */
    private function customer(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        $name = $this->personName($payload);
        if ($name === '') {
            throw new InvalidArgumentException('Customer name, email, or phone is required.');
        }
        $originalEmail = strtolower(trim((string) ($payload['email'] ?? '')));
        $phone = $this->phone($payload['phone'] ?? $payload['billing']['phone'] ?? null);
        [$email, $emailNote] = $this->customerEmail($ctx, $externalId, $originalEmail);
        $link = $ctx->find('customers', $externalId);
        $row = $link ? User::query()->find($link->local_id) : null;
        if (! $row && $originalEmail !== '') {
            $sameTenant = User::query()->where('tenant_id', $ctx->tenantId())->where('email', $originalEmail)->first();
            if ($sameTenant) {
                $row = $sameTenant;
                $email = (string) $sameTenant->email;
                $emailNote = null;
            }
        }
        $existed = $row !== null;
        $message = $emailNote;
        if (isset($payload['role']) && ! in_array(strtolower((string) $payload['role']), ['customer', 'subscriber', ''], true)) {
            $message = trim(($message ? $message.' ' : '').'Source role was ignored.');
        }
        if ($ctx->dryRun()) {
            return $ctx->outcome($existed, User::class, $row?->id, $message);
        }

        $staff = $row && in_array((string) $row->role, ['admin', 'staff', 'shop_manager', 'seller', 'accountant', 'author', 'editor'], true);
        if ($staff) {
            $ctx->link('customers', $externalId, User::class, (int) $row->id, $this->guid($payload));

            return $ctx->outcome(true, User::class, (int) $row->id, 'Matched an existing staff user; profile was left unchanged.');
        }
        if (! $row) {
            $row = new User([
                'tenant_id' => $ctx->tenantId(),
                'role' => 'customer',
                'password' => Str::password(40),
                'is_active' => true,
            ]);
        }
        $row->name = mb_substr($name, 0, 255);
        $row->first_name = $this->nullableString($payload['first_name'] ?? null, 80);
        $row->last_name = $this->nullableString($payload['last_name'] ?? null, 80);
        $row->email = $email;
        $row->phone = $phone ?? $row->phone;
        if (isset($payload['wallet_balance_minor']) && is_numeric($payload['wallet_balance_minor'])) {
            $row->wallet_balance_minor = max(0, (int) $payload['wallet_balance_minor']);
        }
        $addresses = $this->addresses($payload);
        if ($addresses !== []) {
            $row->addresses = $addresses;
        }
        $row->save();
        $ctx->link('customers', $externalId, User::class, (int) $row->id, $this->guid($payload));
        if ($emailNote) {
            CustomerNote::query()->firstOrCreate(
                [
                    'tenant_id' => $ctx->tenantId(),
                    'customer_user_id' => $row->id,
                    'subject' => 'WordPress import',
                ],
                ['body' => $emailNote]
            );
        }

        return $ctx->outcome($existed, User::class, (int) $row->id, $message);
    }

    /** @param  array<string, mixed>  $payload */
    private function product(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        $name = trim((string) ($payload['name'] ?? $payload['title'] ?? ''));
        if ($name === '') {
            throw new InvalidArgumentException('Product name is required.');
        }
        $link = $ctx->find('products', $externalId);
        $row = $link ? Product::query()->where('tenant_id', $ctx->tenantId())->find($link->local_id) : null;
        $slug = $ctx->uniqueSlug(Product::class, $ctx->mapper->slug(
            isset($payload['slug']) ? (string) $payload['slug'] : null,
            $name
        ), $row?->id);
        $sourceStatus = $ctx->mapper->productStatus((string) ($payload['status'] ?? 'publish'));
        $visible = $ctx->publishContent() && $sourceStatus === 'publish' && (($payload['catalog_visibility'] ?? 'visible') !== 'hidden');
        $price = $ctx->minor($payload, 'regular_price') ?: $ctx->minor($payload, 'price');
        $sale = $ctx->minor($payload, 'sale_price');
        if ($sale > 0 && $price > 0 && $sale >= $price) {
            $sale = 0;
        }
        $stockStatus = in_array(($payload['stock_status'] ?? ''), ['instock', 'outofstock', 'onbackorder'], true)
            ? (string) $payload['stock_status']
            : 'instock';
        $variations = is_array($payload['variations'] ?? null) ? $payload['variations'] : [];
        $rawType = strtolower((string) ($payload['type'] ?? 'simple'));
        $type = match ($rawType) {
            'variable' => 'variable',
            'grouped' => 'grouped',
            'external' => 'external',
            default => $variations !== [] ? 'variable' : 'simple',
        };
        $warnings = [];
        if ($ctx->dryRun()) {
            foreach ($this->imagePayloads($payload) as $image) {
                if (! empty($image['url'])) {
                    ImportUrlGuard::parseHttp((string) $image['url']);
                    if (! ImportUrlGuard::hostAllowed(ImportUrlGuard::parseHttp((string) $image['url'])['host'], $ctx->hosts())) {
                        throw new InvalidArgumentException('Image host is not on the allowlist.');
                    }
                }
            }

            return $ctx->outcome($link !== null, Product::class, $row?->id);
        }

        $gallery = [];
        $cover = $row?->image_url;
        foreach ($this->imagePayloads($payload) as $index => $image) {
            try {
                $url = $ctx->storeImage($image, $externalId.'-img-'.$index);
                if ($url) {
                    $gallery[] = $url;
                    $cover ??= $url;
                }
            } catch (\Throwable $e) {
                $warnings[] = $e->getMessage();
            }
        }
        $meta = is_array($row?->meta) ? $row->meta : [];
        $meta['wordpress'] = [
            'external_id' => $externalId,
            'source_guid' => $this->guid($payload),
            'type' => (string) ($payload['type'] ?? $type),
            'tax_class' => $payload['tax_class'] ?? null,
            'grouped_external_ids' => $payload['grouped_external_ids'] ?? [],
        ];
        $productSeo = app(WordpressImportRecords::class)->seo($payload);
        if ($productSeo) {
            $meta['seo'] = $productSeo;
        }
        $row = $row ?? new Product;
        $row->fill([
            'tenant_id' => $ctx->tenantId(),
            'name' => mb_substr($name, 0, 255),
            'slug' => $slug,
            'description' => mb_substr($ctx->mapper->sanitizeHtml((string) ($payload['description'] ?? '')), 0, 60000),
            'short_description' => mb_substr(trim((string) ($payload['short_description'] ?? '')), 0, 5000),
            'sku' => $this->nullableString($payload['sku'] ?? null, 64),
            'price_minor' => $price,
            'sale_price_minor' => $sale > 0 ? $sale : null,
            'sale_starts_at' => $ctx->mapper->date($payload['sale_starts_at'] ?? $payload['date_on_sale_from'] ?? null),
            'sale_ends_at' => $ctx->mapper->date($payload['sale_ends_at'] ?? $payload['date_on_sale_to'] ?? null),
            'currency' => $ctx->currency($payload),
            'stock' => max(0, (int) ($payload['stock'] ?? $payload['stock_quantity'] ?? 0)),
            'manage_stock' => (bool) ($payload['manage_stock'] ?? false),
            'stock_status' => $stockStatus,
            'backorders' => in_array((string) ($payload['backorders'] ?? 'no'), ['no', 'notify', 'yes'], true) ? (string) ($payload['backorders'] ?? 'no') : 'no',
            'status' => $visible ? 'publish' : 'draft',
            'type' => $type,
            'catalog_visibility' => $visible ? 'visible' : 'hidden',
            'is_available' => $visible && $stockStatus !== 'outofstock',
            'is_hidden' => ! $visible,
            'is_featured' => (bool) ($payload['featured'] ?? $payload['is_featured'] ?? false),
            'is_sold_out' => $stockStatus === 'outofstock',
            'weight' => isset($payload['weight']) ? (float) $payload['weight'] : null,
            'length' => isset($payload['length']) ? (float) $payload['length'] : null,
            'width' => isset($payload['width']) ? (float) $payload['width'] : null,
            'height' => isset($payload['height']) ? (float) $payload['height'] : null,
            'image_url' => $cover,
            'cover_image_url' => $cover,
            'gallery' => $gallery,
            'discount_percent' => ($price > 0 && $sale > 0) ? (int) round((1 - ($sale / $price)) * 100) : 0,
            'reference_source' => 'wordpress',
            'reference_url' => $type === 'external'
                ? ($this->nullableString($payload['product_url'] ?? $payload['external_url'] ?? null, 2000) ?? $this->guid($payload))
                : $this->guid($payload),
            'meta' => $meta,
        ]);
        $row->save();
        $ctx->link('products', $externalId, Product::class, (int) $row->id, $this->guid($payload));
        $this->syncTaxonomy($ctx, $row, $payload);
        $this->syncAttributes($ctx, $row, $payload);
        $this->syncVariations($ctx, $row, $variations, $warnings);
        $this->syncProductMedia($row, $gallery);
        $records = app(WordpressImportRecords::class);
        $records->syncBrands($ctx, $row, $payload);
        $records->syncDownloads($ctx, $row, $payload);
        $this->syncRelations($ctx, $row, $payload);
        $records->rememberPermalink($ctx, 'products', $externalId, $payload, '/product/'.$row->slug);

        return $ctx->outcome($link !== null, Product::class, (int) $row->id, $warnings === [] ? null : implode(' ', array_unique($warnings)));
    }

    /** @param  array<string, mixed>  $payload */
    private function page(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        $title = trim((string) ($payload['title'] ?? $payload['name'] ?? ''));
        if ($title === '') {
            throw new InvalidArgumentException('Page title is required.');
        }
        $link = $ctx->find('pages', $externalId);
        $row = $link ? CmsPage::query()->where('tenant_id', $ctx->tenantId())->find($link->local_id) : null;
        $slug = $ctx->uniqueSlug(CmsPage::class, $ctx->mapper->slug(
            isset($payload['slug']) ? (string) $payload['slug'] : null,
            $title
        ), $row?->id);
        $html = (string) ($payload['content'] ?? $payload['body'] ?? $payload['html'] ?? '');
        [$document, $unmapped] = $this->pageDocument($ctx, $externalId, $title, $html, $payload);
        $publish = $ctx->publishContent() && $ctx->mapper->contentPublished((string) ($payload['status'] ?? 'draft'));
        $records = app(WordpressImportRecords::class);
        $seo = $records->seo($payload) ?? (is_array($row?->seo) ? $row->seo : null);
        if (! empty($payload['is_front_page']) || ($payload['permalink'] ?? null) === '/') {
            $home = $ctx->uniqueSlug(CmsPage::class, 'home', $row?->id);
            if ($slug === 'item' || $slug === 'home' || ($payload['permalink'] ?? null) === '/') {
                $slug = $home;
            }
        }
        if ($ctx->dryRun()) {
            return $ctx->outcome($link !== null, CmsPage::class, $row?->id, $records->unmappedMessage($unmapped));
        }
        $parentExternal = trim((string) ($payload['parent_external_id'] ?? ''));
        $parent = $parentExternal !== '' ? $ctx->find('pages', $parentExternal) : null;
        $row = $row ?? new CmsPage;
        $row->fill([
            'tenant_id' => $ctx->tenantId(),
            'parent_id' => $parent?->local_id,
            'title' => mb_substr($title, 0, 255),
            'slug' => $slug,
            'excerpt' => $this->nullableString($payload['excerpt'] ?? null, 2000),
            'body' => mb_substr($ctx->mapper->sanitizeHtml($html), 0, 60000),
            'builder_draft' => $document,
            'builder_published' => $publish ? $document : $row->builder_published,
            'published' => $publish,
            'status' => $publish ? 'published' : 'draft',
            'seo' => $seo,
        ]);
        $row->save();
        $ctx->link('pages', $externalId, CmsPage::class, (int) $row->id, $this->guid($payload));
        $records->rememberPermalink($ctx, 'pages', $externalId, $payload, '/pages/'.$row->slug);

        return $ctx->outcome($link !== null, CmsPage::class, (int) $row->id, $records->unmappedMessage($unmapped));
    }

    /** @param  array<string, mixed>  $payload */
    private function post(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        $title = trim((string) ($payload['title'] ?? $payload['name'] ?? ''));
        if ($title === '') {
            throw new InvalidArgumentException('Post title is required.');
        }
        $link = $ctx->find('posts', $externalId);
        $row = $link ? BlogPost::query()->where('tenant_id', $ctx->tenantId())->find($link->local_id) : null;
        $slug = $ctx->uniqueSlug(BlogPost::class, $ctx->mapper->slug(
            isset($payload['slug']) ? (string) $payload['slug'] : null,
            $title
        ), $row?->id);
        $publish = $ctx->publishContent() && $ctx->mapper->contentPublished((string) ($payload['status'] ?? 'draft'));
        $publishedAt = $ctx->mapper->date($payload['published_at'] ?? $payload['date'] ?? null);
        $records = app(WordpressImportRecords::class);
        $html = (string) ($payload['content'] ?? $payload['body'] ?? '');
        $converter = app(ElementorToBuilderConverter::class);
        $supplied = $converter->preferDocument($payload);
        $converted = $supplied === null ? $converter->convertRecord($payload) : null;
        $builderDraft = $supplied ?? ($converted['document'] ?? null);
        $unmapped = $converted['unmapped'] ?? [];
        if ($ctx->dryRun()) {
            return $ctx->outcome($link !== null, BlogPost::class, $row?->id, $records->unmappedMessage($unmapped));
        }
        $categoryIds = $this->blogCategoryIds($ctx, $payload);
        $cover = $row?->cover_url;
        foreach (['cover', 'featured', 'featured_image'] as $coverKey) {
            if (! empty($payload[$coverKey]) && is_array($payload[$coverKey])) {
                try {
                    $cover = $ctx->storeImage($payload[$coverKey]) ?? $cover;
                } catch (\Throwable) {
                    // A missing cover must not drop the post.
                }
                break;
            }
        }
        if (! empty($payload['images']) && is_array($payload['images'])) {
            $featured = $payload['images']['featured'] ?? null;
            if (is_array($featured)) {
                try {
                    $cover = $ctx->storeImage($featured) ?? $cover;
                } catch (\Throwable) {
                }
            }
        }
        $row = $row ?? new BlogPost;
        $row->fill([
            'tenant_id' => $ctx->tenantId(),
            'category_id' => $categoryIds[0] ?? null,
            'title' => mb_substr($title, 0, 255),
            'slug' => $slug,
            'excerpt' => $this->nullableString($payload['excerpt'] ?? null, 2000),
            'body' => $ctx->mapper->sanitizeHtml($html),
            'builder_draft' => $builderDraft ?? $row->builder_draft,
            'cover_url' => $cover,
            'status' => $publish ? 'published' : 'draft',
            'published_at' => $publish ? ($publishedAt ?? now()) : null,
            'seo' => $records->seo($payload) ?? $row->seo,
        ]);
        $row->save();
        $row->tags()->sync($this->blogTagIds($ctx, $payload));
        $row->categories()->sync($categoryIds);
        $ctx->link('posts', $externalId, BlogPost::class, (int) $row->id, $this->guid($payload));
        $records->rememberPermalink($ctx, 'posts', $externalId, $payload, '/blog/'.$row->slug);

        return $ctx->outcome($link !== null, BlogPost::class, (int) $row->id, $records->unmappedMessage($unmapped));
    }

    /** @param  array<string, mixed>  $payload */
    private function order(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        $link = $ctx->find('orders', $externalId);
        $row = $link ? Order::query()->where('tenant_id', $ctx->tenantId())->find($link->local_id) : null;
        $status = $ctx->mapper->orderStatus((string) ($payload['status'] ?? 'processing'));
        $total = $ctx->minor($payload, 'total');
        $userId = null;
        $customerExternal = trim((string) ($payload['customer_external_id'] ?? ''));
        if ($customerExternal !== '') {
            $customer = $ctx->find('customers', $customerExternal);
            $userId = $customer?->local_id;
        }
        $billing = is_array($payload['billing'] ?? null) ? $payload['billing'] : [];
        $shipping = is_array($payload['shipping'] ?? null) ? $payload['shipping'] : [];
        $email = strtolower(trim((string) ($payload['customer_email'] ?? $billing['email'] ?? '')));
        $name = trim((string) ($payload['customer_name'] ?? trim(((string) ($billing['first_name'] ?? '')).' '.((string) ($billing['last_name'] ?? '')))));
        if ($ctx->dryRun()) {
            return $ctx->outcome($link !== null, Order::class, $row?->id);
        }
        $number = $row?->number ?: $this->orderNumber($ctx, $externalId, $payload);
        $meta = is_array($row?->meta) ? $row->meta : [];
        $meta['wordpress_import'] = [
            'external_id' => $externalId,
            'job_id' => (int) $ctx->job->id,
            'source_guid' => $this->guid($payload),
            'source_status' => (string) ($payload['status'] ?? ''),
        ];
        $row = $row ?? new Order;
        $row->fill([
            'tenant_id' => $ctx->tenantId(),
            'user_id' => $userId,
            'number' => $number,
            'status' => $status,
            'currency' => $ctx->currency($payload),
            'total_minor' => $total,
            'subtotal_minor' => $ctx->minor($payload, 'subtotal'),
            'discount_minor' => $ctx->minor($payload, 'discount'),
            'shipping_minor' => $ctx->minor($payload, 'shipping'),
            'tax_minor' => $ctx->minor($payload, 'tax'),
            'amount_paid_minor' => in_array($status, ['paid', 'processing', 'completed', 'shipped'], true) ? $total : $ctx->minor($payload, 'amount_paid'),
            'payment_provider' => $this->nullableString($payload['payment_method'] ?? null, 64),
            'payment_ref' => $this->nullableString($payload['transaction_id'] ?? null, 191),
            'customer_name' => $name !== '' ? mb_substr($name, 0, 255) : null,
            'customer_email' => $email !== '' ? mb_substr($email, 0, 255) : null,
            'customer_phone' => $this->phone($payload['customer_phone'] ?? $billing['phone'] ?? null),
            'customer_note' => $this->nullableString($payload['customer_note'] ?? null, 500),
            'shipping_address' => $ctx->mapper->addressLine($payload['shipping_address'] ?? $shipping),
            'billing_address' => $billing !== [] ? $billing : null,
            'sales_channel' => 'online',
            'meta' => $meta,
        ]);
        $row->save();
        $createdAt = $ctx->mapper->date($payload['created_at'] ?? $payload['date_created'] ?? null);
        if ($createdAt) {
            $row->timestamps = false;
            $row->created_at = $createdAt;
            $row->updated_at = $createdAt;
            $row->save();
        }
        $row->items()->delete();
        foreach (is_array($payload['line_items'] ?? null) ? $payload['line_items'] : [] as $line) {
            if (! is_array($line)) {
                continue;
            }
            $qty = max(1, (int) ($line['quantity'] ?? 1));
            $unit = $ctx->minor($line, 'price');
            if ($unit === 0 && isset($line['total'])) {
                $lineTotal = $ctx->minor($line, 'total');
                $unit = (int) round($lineTotal / $qty);
            }
            $productId = null;
            $variantId = null;
            $productExternal = trim((string) ($line['product_external_id'] ?? ''));
            if ($productExternal !== '') {
                $productLink = $ctx->find('products', $productExternal);
                $productId = $productLink?->local_id;
            }
            $variationExternal = trim((string) ($line['variation_external_id'] ?? ''));
            if ($variationExternal !== '') {
                $variationLink = $ctx->find('variation', $variationExternal);
                $variantId = $variationLink?->local_id;
            }
            OrderItem::query()->create([
                'order_id' => $row->id,
                'product_id' => $productId,
                'product_variant_id' => $variantId,
                'product_name' => mb_substr((string) ($line['name'] ?? 'کالا'), 0, 255),
                'sku' => $this->nullableString($line['sku'] ?? null, 64),
                'quantity' => $qty,
                'unit_price_minor' => $unit,
                'meta' => [
                    'external_id' => (string) ($line['external_id'] ?? ''),
                ],
            ]);
        }
        app(WordpressImportRecords::class)->extraOrderLines($ctx, $row, $payload);
        $ctx->link('orders', $externalId, Order::class, (int) $row->id, $this->guid($payload));

        return $ctx->outcome($link !== null, Order::class, (int) $row->id);
    }

    /** @param  array<string, mixed>  $payload */
    private function menu(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
        $links = $ctx->mapper->menuLinks($items, $ctx->sourceHost());
        if ($links === '' && trim((string) ($payload['name'] ?? '')) === '') {
            throw new InvalidArgumentException('Menu needs a name or items.');
        }
        $location = strtolower((string) ($payload['location'] ?? 'header'));
        $kind = str_contains($location, 'footer') ? 'footer' : 'header';
        $link = $ctx->find('menus', $externalId);
        if ($ctx->dryRun()) {
            return $ctx->outcome($link !== null, BuilderTemplate::class, null);
        }
        $template = BuilderTemplate::preferred($ctx->tenantId(), $kind) ?? new BuilderTemplate([
            'tenant_id' => $ctx->tenantId(),
            'kind' => $kind,
            'slug' => $kind,
            'is_default' => true,
            'priority' => 0,
        ]);
        $document = is_array($template->draft) ? $template->draft : (is_array($template->published) ? $template->published : ['version' => 1, 'sections' => []]);
        $template->title = $template->title ?: mb_substr((string) ($payload['name'] ?? ($kind === 'header' ? 'سربرگ' : 'پاورقی')), 0, 255);
        $template->draft = $ctx->mapper->mergeNavigation($document, $kind, $links);
        $template->save();
        $this->storeMenuTree($ctx, $externalId, $payload, $kind);
        $ctx->link('menus', $externalId, BuilderTemplate::class, (int) $template->id, $this->guid($payload));

        return $ctx->outcome($link !== null, BuilderTemplate::class, (int) $template->id);
    }

    /** @param  array<string, mixed>  $payload */
    private function stats(ImportContext $ctx, string $externalId, array $payload): ImportOutcome
    {
        if ($ctx->dryRun()) {
            return new ImportOutcome('would_create', 'stats', null);
        }
        $job = $ctx->job;
        $summary = is_array($job->summary) ? $job->summary : [];
        $snapshots = is_array($summary['snapshots'] ?? null) ? $summary['snapshots'] : [];
        $snapshots[$externalId] = [
            'external_id' => $externalId,
            'period' => (string) ($payload['period'] ?? $externalId),
            'orders' => (int) ($payload['orders'] ?? $payload['order_count'] ?? 0),
            'revenue_minor' => $ctx->minor($payload, 'revenue') ?: (int) ($payload['revenue_minor'] ?? 0),
            'currency' => $ctx->currency($payload),
        ];
        $summary['snapshots'] = $snapshots;
        $job->summary = $summary;
        $job->save();
        $this->storeDailyStats($ctx, $payload);

        return new ImportOutcome('created', 'stats', null);
    }

    /** @param  array<string, mixed>  $payload */
    private function syncTaxonomy(ImportContext $ctx, Product $product, array $payload): void
    {
        $categoryIds = [];
        foreach (is_array($payload['category_external_ids'] ?? null) ? $payload['category_external_ids'] : [] as $id) {
            $link = $ctx->find('categories', (string) $id);
            if ($link) {
                $categoryIds[] = (int) $link->local_id;
            }
        }
        $product->category_id = $categoryIds[0] ?? null;
        $product->save();
        $product->categories()->sync($categoryIds);

        $tagIds = [];
        foreach (is_array($payload['tag_external_ids'] ?? null) ? $payload['tag_external_ids'] : [] as $id) {
            $link = $ctx->find('tags', (string) $id);
            if ($link) {
                $tagIds[] = (int) $link->local_id;
            }
        }
        $product->tags()->sync($tagIds);
    }

    /** @param  array<string, mixed>  $payload */
    private function syncAttributes(ImportContext $ctx, Product $product, array $payload): void
    {
        $sync = [];
        $position = 0;
        foreach (is_array($payload['attributes'] ?? null) ? $payload['attributes'] : [] as $attribute) {
            if (! is_array($attribute)) {
                continue;
            }
            $name = trim((string) ($attribute['name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $slug = $ctx->mapper->slug(isset($attribute['slug']) ? (string) $attribute['slug'] : null, $name, 80);
            $model = ProductAttribute::query()->firstOrCreate(
                ['tenant_id' => $ctx->tenantId(), 'slug' => $slug],
                ['name' => mb_substr($name, 0, 255), 'type' => 'select', 'order_by' => 'menu_order']
            );
            $termIds = [];
            $options = is_array($attribute['options'] ?? null) ? $attribute['options'] : [];
            foreach ($options as $option) {
                $termName = is_array($option) ? trim((string) ($option['name'] ?? '')) : trim((string) $option);
                if ($termName === '') {
                    continue;
                }
                $termSlug = $ctx->mapper->slug(is_array($option) ? (string) ($option['slug'] ?? '') : null, $termName, 80);
                $term = ProductAttributeTerm::query()->firstOrCreate(
                    ['product_attribute_id' => $model->id, 'slug' => $termSlug],
                    [
                        'tenant_id' => $ctx->tenantId(),
                        'name' => mb_substr($termName, 0, 255),
                        'menu_order' => count($termIds),
                        'color' => is_array($option) ? ($option['color'] ?? null) : null,
                    ]
                );
                $termIds[] = (int) $term->id;
            }
            $sync[$model->id] = [
                'is_visible' => (bool) ($attribute['visible'] ?? $attribute['is_visible'] ?? true),
                'is_variation' => (bool) ($attribute['variation'] ?? $attribute['is_variation'] ?? false),
                'position' => $position++,
                'term_ids' => json_encode($termIds),
                'custom_options' => null,
            ];
        }
        $product->attributes()->sync($sync);
    }

    /**
     * @param  list<mixed>  $variations
     * @param  list<string>  $warnings
     */
    private function syncVariations(ImportContext $ctx, Product $product, array $variations, array &$warnings): void
    {
        $keep = [];
        foreach ($variations as $index => $variation) {
            if (! is_array($variation)) {
                continue;
            }
            $externalId = trim((string) ($variation['external_id'] ?? ($product->id.'-'.$index)));
            $link = $ctx->find('variation', $externalId);
            $variant = $link
                ? ProductVariant::query()->where('tenant_id', $ctx->tenantId())->where('product_id', $product->id)->find($link->local_id)
                : null;
            $values = is_array($variation['attributes'] ?? null) ? $variation['attributes'] : [];
            $label = trim((string) ($variation['name'] ?? ''));
            if ($label === '') {
                $label = implode(' / ', array_map(fn ($v) => (string) $v, $values));
            }
            $image = null;
            if (! empty($variation['image_url']) || ! empty($variation['image'])) {
                try {
                    $image = $ctx->storeImage(is_array($variation['image'] ?? null) ? $variation['image'] : [
                        'url' => (string) ($variation['image_url'] ?? ''),
                        'external_id' => $externalId.'-image',
                    ]);
                } catch (\Throwable $e) {
                    $warnings[] = $e->getMessage();
                }
            }
            $price = $ctx->minor($variation, 'regular_price') ?: $ctx->minor($variation, 'price');
            $sale = $ctx->minor($variation, 'sale_price');
            $variant = $variant ?? new ProductVariant;
            $variant->fill([
                'tenant_id' => $ctx->tenantId(),
                'product_id' => $product->id,
                'name' => mb_substr($label !== '' ? $label : 'گونه', 0, 255),
                'sku' => $this->nullableString($variation['sku'] ?? null, 64),
                'price_minor' => $price,
                'sale_price_minor' => $sale > 0 ? $sale : null,
                'stock' => max(0, (int) ($variation['stock'] ?? $variation['stock_quantity'] ?? 0)),
                'stock_status' => in_array(($variation['stock_status'] ?? ''), ['instock', 'outofstock', 'onbackorder'], true)
                    ? (string) $variation['stock_status'] : 'instock',
                'manage_stock' => (bool) ($variation['manage_stock'] ?? false),
                'attribute_values' => $values,
                'image_url' => $image,
                'is_default' => $index === 0,
                'sort_order' => $index,
                'weight' => isset($variation['weight']) ? (float) $variation['weight'] : null,
            ]);
            $variant->save();
            $ctx->link('variation', $externalId, ProductVariant::class, (int) $variant->id);
            $keep[] = (int) $variant->id;
        }
        $imported = WordpressImportLink::query()
            ->where('tenant_id', $ctx->tenantId())
            ->where('resource', 'variation')
            ->where('local_type', ProductVariant::class)
            ->pluck('local_id');
        ProductVariant::query()
            ->where('tenant_id', $ctx->tenantId())
            ->where('product_id', $product->id)
            ->whereIn('id', $imported)
            ->whereNotIn('id', $keep === [] ? [0] : $keep)
            ->get()
            ->each(function (ProductVariant $variant) use ($ctx): void {
                WordpressImportLink::query()
                    ->where('tenant_id', $ctx->tenantId())
                    ->where('resource', 'variation')
                    ->where('local_id', $variant->id)
                    ->delete();
                $variant->delete();
            });
    }

    /** @param  list<string>  $gallery */
    private function syncProductMedia(Product $product, array $gallery): void
    {
        $product->media()->delete();
        foreach (array_values($gallery) as $index => $url) {
            ProductMedia::query()->create([
                'tenant_id' => $product->tenant_id,
                'product_id' => $product->id,
                'type' => 'image',
                'url' => $url,
                'sort_order' => $index,
                'is_cover' => $index === 0,
            ]);
        }
    }

    /** @param  array<string, mixed>  $payload */
    private function syncRelations(ImportContext $ctx, Product $product, array $payload): void
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
        $product->save();
    }

    /**
     * Every embedded category, plus ids already imported as blog_categories.
     * Product tags stay on the product tag namespace.
     *
     * @param  array<string, mixed>  $payload
     * @return list<int>
     */
    private function blogCategoryIds(ImportContext $ctx, array $payload): array
    {
        $ids = [];
        foreach (is_array($payload['categories'] ?? null) ? $payload['categories'] : [] as $category) {
            $id = $this->ensureBlogCategory($ctx, $category);
            if ($id) {
                $ids[] = $id;
            }
        }
        foreach (is_array($payload['category_external_ids'] ?? null) ? $payload['category_external_ids'] : [] as $external) {
            $link = $ctx->find('blog_categories', (string) $external);
            if ($link) {
                $ids[] = (int) $link->local_id;
            }
        }

        return array_values(array_unique($ids));
    }

    private function ensureBlogCategory(ImportContext $ctx, mixed $category): ?int
    {
        if (! is_array($category)) {
            return null;
        }
        $name = trim((string) ($category['name'] ?? ''));
        $external = trim((string) ($category['external_id'] ?? $category['source_id'] ?? ''));
        if ($external !== '') {
            $link = $ctx->find('blog_categories', $external);
            if ($link) {
                return (int) $link->local_id;
            }
        }
        if ($name === '') {
            return null;
        }
        $slug = $ctx->uniqueSlug(BlogCategory::class, $ctx->mapper->slug(
            isset($category['slug']) ? (string) $category['slug'] : null,
            $name
        ));
        $row = BlogCategory::query()->create([
            'tenant_id' => $ctx->tenantId(),
            'name' => mb_substr($name, 0, 255),
            'slug' => $slug,
        ]);
        if ($external !== '') {
            $ctx->link('blog_categories', $external, BlogCategory::class, (int) $row->id);
        }

        return (int) $row->id;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return list<int>
     */
    private function blogTagIds(ImportContext $ctx, array $payload): array
    {
        $ids = [];
        foreach (is_array($payload['tags'] ?? null) ? $payload['tags'] : [] as $tag) {
            if (! is_array($tag)) {
                continue;
            }
            $name = trim((string) ($tag['name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $external = trim((string) ($tag['external_id'] ?? ''));
            if ($external !== '') {
                $link = $ctx->find('blog_tags', $external);
                if ($link) {
                    $ids[] = (int) $link->local_id;

                    continue;
                }
            }
            $slug = $ctx->uniqueSlug(BlogTag::class, $ctx->mapper->slug(
                isset($tag['slug']) ? (string) $tag['slug'] : null,
                $name
            ));
            $row = BlogTag::query()->create([
                'tenant_id' => $ctx->tenantId(),
                'name' => mb_substr($name, 0, 255),
                'slug' => $slug,
            ]);
            if ($external !== '') {
                $ctx->link('blog_tags', $external, BlogTag::class, (int) $row->id);
            }
            $ids[] = (int) $row->id;
        }

        return $ids;
    }

    /** @param  array<string, mixed>  $payload */
    private function isFileMedia(array $payload): bool
    {
        $kind = strtolower(trim((string) ($payload['kind'] ?? '')));
        if ($kind === 'file') {
            return true;
        }
        if ($kind === 'image') {
            return false;
        }
        $mime = strtolower((string) ($payload['mime'] ?? $payload['mime_type'] ?? ''));
        if (str_starts_with($mime, 'image/') && ! str_contains($mime, 'svg')) {
            return false;
        }
        $haystack = strtolower($mime.' '.(string) ($payload['filename'] ?? '').' '.(string) ($payload['url'] ?? '').' '.(string) ($payload['name'] ?? ''));

        return str_contains($mime, 'pdf')
            || str_contains($mime, 'mp4')
            || str_contains($mime, 'webm')
            || str_contains($mime, 'svg')
            || (bool) preg_match('/\.(pdf|mp4|webm|svg)(\?|#|$)/', $haystack);
    }

    /**
     * Prefer a plugin-built builder document, then Elementor data, then post_content.
     *
     * @param  array<string, mixed>  $payload
     * @return array{0: array<string, mixed>, 1: array<string, int>}
     */
    private function pageDocument(ImportContext $ctx, string $externalId, string $title, string $html, array $payload): array
    {
        $converter = app(ElementorToBuilderConverter::class);
        $supplied = $converter->preferDocument($payload);
        if ($supplied !== null) {
            return [$supplied, []];
        }
        $converted = $converter->convertRecord($payload);
        if ($converted !== null) {
            return [$converted['document'], $converted['unmapped']];
        }

        return [$this->document($ctx, $externalId, $title, $html, $payload), []];
    }

    /** @param  array<string, mixed>  $payload */
    private function storeMenuTree(ImportContext $ctx, string $externalId, array $payload, string $kind): void
    {
        $service = app(ModuleSettingsService::class);
        $current = $service->get($ctx->tenantId(), 'cms', 'menus', ['draft' => [], 'published' => []]);
        $draft = is_array($current['draft'] ?? null) ? array_values($current['draft']) : [];
        $locations = is_array($payload['locations'] ?? null) ? $payload['locations'] : [];
        if ($locations === [] && isset($payload['location'])) {
            $locations = [(string) $payload['location']];
        }
        $tree = [
            'external_id' => $externalId,
            'name' => mb_substr(trim((string) ($payload['name'] ?? $kind)), 0, 255),
            'slug' => mb_substr($ctx->mapper->slug(
                isset($payload['slug']) ? (string) $payload['slug'] : null,
                (string) ($payload['name'] ?? $kind)
            ), 0, 191),
            'location' => $kind,
            'locations' => array_values(array_map(fn ($location) => mb_substr((string) $location, 0, 64), $locations)),
            'items' => $this->menuNodes(is_array($payload['items'] ?? null) ? $payload['items'] : []),
        ];
        $replaced = false;
        foreach ($draft as $index => $row) {
            if (is_array($row) && (string) ($row['external_id'] ?? '') === $externalId) {
                $draft[$index] = $tree;
                $replaced = true;
                break;
            }
        }
        if (! $replaced) {
            $draft[] = $tree;
        }
        $published = $ctx->publishContent()
            ? $draft
            : (is_array($current['published'] ?? null) ? $current['published'] : []);
        $service->put($ctx->tenantId(), 'cms', 'menus', [
            'draft' => array_values($draft),
            'published' => $published,
        ]);
    }

    /**
     * @param  list<mixed>  $items
     * @return list<array<string, mixed>>
     */
    private function menuNodes(array $items): array
    {
        $nodes = [];
        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }
            $children = $item['children'] ?? $item['items'] ?? [];
            $nodes[] = [
                'title' => mb_substr(trim((string) ($item['title'] ?? $item['label'] ?? '')), 0, 255),
                'url' => mb_substr(trim((string) ($item['url'] ?? $item['href'] ?? '')), 0, 500),
                'children' => $this->menuNodes(is_array($children) ? $children : []),
            ];
        }

        return $nodes;
    }

    /** @param  array<string, mixed>  $payload */
    private function storeDailyStats(ImportContext $ctx, array $payload): void
    {
        $day = $payload['day'] ?? null;
        if (! is_string($day) || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $day)) {
            return;
        }
        $tenantId = $ctx->tenantId();
        DB::table('analytics_daily_totals')->updateOrInsert(
            ['tenant_id' => $tenantId, 'day' => $day],
            [
                'visitors' => max(0, (int) ($payload['visitors'] ?? 0)),
                'views' => max(0, (int) ($payload['views'] ?? $payload['pageviews'] ?? 0)),
                'sessions' => max(0, (int) ($payload['sessions'] ?? 0)),
                'bounces' => max(0, (int) ($payload['bounces'] ?? 0)),
                'duration_sum_ms' => max(0, (int) ($payload['duration_sum_ms'] ?? 0)),
            ]
        );
        foreach (is_array($payload['pages'] ?? null) ? $payload['pages'] : [] as $page) {
            if (! is_array($page)) {
                continue;
            }
            $uri = mb_substr((string) ($page['uri'] ?? $page['path'] ?? '/'), 0, 512);
            DB::table('analytics_page_daily')->updateOrInsert(
                [
                    'tenant_id' => $tenantId,
                    'day' => $day,
                    'post_id' => max(0, (int) ($page['post_id'] ?? 0)),
                    'uri_key' => mb_substr($uri !== '' ? $uri : '/', 0, 191),
                ],
                [
                    'uri' => $uri !== '' ? $uri : '/',
                    'views' => max(0, (int) ($page['views'] ?? 0)),
                    'title' => mb_substr((string) ($page['title'] ?? ''), 0, 255),
                ]
            );
        }
        foreach (is_array($payload['referrers'] ?? null) ? $payload['referrers'] : [] as $row) {
            if (! is_array($row)) {
                continue;
            }
            DB::table('analytics_referrer_daily')->updateOrInsert(
                [
                    'tenant_id' => $tenantId,
                    'day' => $day,
                    'ref_category' => mb_substr((string) ($row['category'] ?? $row['ref_category'] ?? 'direct'), 0, 32),
                    'ref_source' => mb_substr((string) ($row['source'] ?? $row['ref_source'] ?? ''), 0, 100),
                ],
                ['visits' => max(0, (int) ($row['visits'] ?? $row['views'] ?? 0))]
            );
        }
        foreach (is_array($payload['devices'] ?? null) ? $payload['devices'] : [] as $row) {
            if (! is_array($row)) {
                continue;
            }
            DB::table('analytics_device_daily')->updateOrInsert(
                [
                    'tenant_id' => $tenantId,
                    'day' => $day,
                    'dim_type' => mb_substr((string) ($row['type'] ?? $row['dim_type'] ?? 'browser'), 0, 32),
                    'dim_value' => mb_substr((string) ($row['value'] ?? $row['dim_value'] ?? ''), 0, 50),
                ],
                ['views' => max(0, (int) ($row['views'] ?? 0))]
            );
        }
        foreach (is_array($payload['geo'] ?? null) ? $payload['geo'] : [] as $row) {
            if (! is_array($row)) {
                continue;
            }
            DB::table('analytics_geo_daily')->updateOrInsert(
                [
                    'tenant_id' => $tenantId,
                    'day' => $day,
                    'dim_type' => mb_substr((string) ($row['type'] ?? $row['dim_type'] ?? 'country'), 0, 32),
                    'dim_value' => mb_substr((string) ($row['value'] ?? $row['dim_value'] ?? ''), 0, 80),
                ],
                ['views' => max(0, (int) ($row['views'] ?? 0))]
            );
        }
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function document(ImportContext $ctx, string $externalId, string $title, string $html, array $payload): array
    {
        $given = $payload['document'] ?? $payload['builder'] ?? null;
        if (is_array($given) && is_array($given['sections'] ?? null)) {
            if (! isset($given['version'])) {
                $given['version'] = 1;
            }
            $encoded = json_encode($given);
            if ($encoded !== false && strlen($encoded) <= 750000) {
                return $given;
            }
        }

        return $ctx->mapper->htmlDocument($externalId, $title, $html);
    }

    /** @param  array<string, mixed>  $payload
     * @return list<array<string, mixed>>
     */
    private function imagePayloads(array $payload): array
    {
        $images = [];
        foreach (is_array($payload['images'] ?? null) ? $payload['images'] : [] as $image) {
            if (is_string($image)) {
                $images[] = ['url' => $image];
            } elseif (is_array($image)) {
                $images[] = $image;
            }
        }

        return $images;
    }

    /** @param  array<string, mixed>  $payload */
    private function orderNumber(ImportContext $ctx, string $externalId, array $payload): string
    {
        $raw = trim((string) ($payload['number'] ?? ''));
        $number = $raw !== '' ? 'WP-'.$raw : 'WP-'.$externalId;
        $number = mb_substr(preg_replace('/\s+/', '', $number) ?? $number, 0, 64);
        $base = $number;
        $i = 2;
        while (Order::query()->where('tenant_id', $ctx->tenantId())->where('number', $number)->exists()) {
            $number = mb_substr($base, 0, 58).'-'.$i;
            $i++;
        }

        return $number;
    }

    /** @return array{0: string, 1: ?string} */
    private function customerEmail(ImportContext $ctx, string $externalId, string $email): array
    {
        if ($email === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['wp-'.$ctx->tenantId().'-'.$this->safeEmailKey($externalId).'@import.webino.invalid', $email === '' ? null : 'Source email was not a valid address.'];
        }
        $owner = User::query()->where('email', $email)->first();
        if ($owner && (int) $owner->tenant_id !== $ctx->tenantId()) {
            return [
                'wp-'.$ctx->tenantId().'-'.$this->safeEmailKey($externalId).'@import.webino.invalid',
                'Original email belongs to another tenant and was not copied.',
            ];
        }

        return [$email, null];
    }

    private function safeEmailKey(string $externalId): string
    {
        $key = preg_replace('/[^a-zA-Z0-9]+/', '-', $externalId) ?? 'user';
        $key = trim($key, '-');

        return $key !== '' ? mb_substr($key, 0, 40) : substr(sha1($externalId), 0, 10);
    }

    /** @param  array<string, mixed>  $payload */
    private function personName(array $payload): string
    {
        $name = trim((string) ($payload['name'] ?? ''));
        if ($name === '') {
            $name = trim(((string) ($payload['first_name'] ?? '')).' '.((string) ($payload['last_name'] ?? '')));
        }
        if ($name === '') {
            $name = trim((string) ($payload['email'] ?? $payload['phone'] ?? ''));
        }

        return $name;
    }

    private function phone(mixed $value): ?string
    {
        if (! is_scalar($value)) {
            return null;
        }
        $phone = preg_replace('/[^\d+]/', '', (string) $value) ?? '';

        return $phone === '' ? null : mb_substr($phone, 0, 32);
    }

    /** @param  array<string, mixed>  $payload
     * @return list<array<string, mixed>>
     */
    private function addresses(array $payload): array
    {
        $rows = [];
        foreach (['billing', 'shipping'] as $type) {
            if (is_array($payload[$type] ?? null)) {
                $line = app(WordpressImportMapper::class)->addressLine($payload[$type]);
                if ($line) {
                    $rows[] = ['type' => $type, 'line' => $line];
                }
            }
        }

        return $rows;
    }

    /** @param  array<string, mixed>  $payload */
    private function guid(array $payload): ?string
    {
        $guid = trim((string) ($payload['source_guid'] ?? $payload['guid'] ?? $payload['permalink'] ?? ''));

        return $guid === '' ? null : mb_substr($guid, 0, 500);
    }

    private function nullableString(mixed $value, int $max): ?string
    {
        if (! is_scalar($value)) {
            return null;
        }
        $text = trim((string) $value);

        return $text === '' ? null : mb_substr($text, 0, $max);
    }
}
