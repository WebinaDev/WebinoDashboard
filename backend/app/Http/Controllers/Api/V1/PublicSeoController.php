<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\BlogPost;
use App\Models\CmsPage;
use App\Models\Product;
use App\Services\Payments\BnplBadgeService;
use App\Services\Seo\SeoMetaBuilder;
use App\Services\Seo\SeoRedirectService;
use App\Services\Seo\SitemapBuilder;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class PublicSeoController extends Controller
{
    use ResolvesPublicTenant;

    public function meta(Request $request, SeoMetaBuilder $builder): \Illuminate\Http\JsonResponse
    {
        $tenant = $this->publicTenant($request);
        $path = (string) $request->query('path', '/');
        $type = (string) $request->query('type', '');
        $slug = (string) $request->query('slug', '');

        $product = null;
        $post = null;
        $meta = $builder->build($tenant, $path);

        if ($type === 'product' && $slug !== '') {
            $product = Product::query()->where('tenant_id', $tenant->id)->where('slug', $slug)->where('status', 'publish')->first();
            if ($product) {
                $meta = $builder->forProduct($tenant, $product);
            }
        } elseif ($type === 'post' && $slug !== '') {
            $post = BlogPost::query()->where('tenant_id', $tenant->id)->where('slug', $slug)->where('status', 'publish')->first();
            if ($post) {
                $meta = $builder->forBlogPost($tenant, $post);
            }
        } elseif ($type === 'page' && $slug !== '') {
            $page = CmsPage::query()->where('tenant_id', $tenant->id)->where('slug', $slug)
                ->where(function ($q) {
                    $q->where('published', true)->orWhere('status', 'publish');
                })->first();
            if ($page) {
                $meta = $builder->forCmsPage($tenant, $page);
            }
        }

        $graphs = $builder->jsonLdGraphs($tenant, $meta, $product, $post);

        return response()->json([
            'data' => [
                'meta' => $meta,
                'json_ld' => [
                    '@context' => 'https://schema.org',
                    '@graph' => $graphs,
                ],
            ],
        ])->header('Cache-Control', 'public, max-age=60, s-maxage=120');
    }

    public function redirectLookup(Request $request, SeoRedirectService $redirects): \Illuminate\Http\JsonResponse
    {
        $tenant = $this->publicTenant($request);
        $path = (string) $request->query('path', '/');
        $row = $redirects->find((int) $tenant->id, $path);
        if ($row === null) {
            return response()->json(['data' => null]);
        }

        return response()->json([
            'data' => [
                'from_path' => $row->from_path,
                'to_path' => $row->to_path,
                'status_code' => $row->status_code,
            ],
        ]);
    }

    public function sitemap(Request $request, SitemapBuilder $sitemaps, string $kind = 'index'): Response
    {
        $tenant = $this->publicTenant($request);
        $xml = match ($kind) {
            'pages' => $sitemaps->pagesXml($tenant),
            'products' => $sitemaps->productsXml($tenant),
            'posts' => $sitemaps->postsXml($tenant),
            'news' => $sitemaps->newsXml($tenant),
            'video' => $sitemaps->videoXml($tenant),
            default => $sitemaps->indexXml($tenant),
        };

        return response($xml, 200, [
            'Content-Type' => 'application/xml; charset=UTF-8',
            'Cache-Control' => 'public, max-age=300, s-maxage=600',
        ]);
    }

    public function robots(Request $request, SitemapBuilder $sitemaps): Response
    {
        $tenant = $this->publicTenant($request);

        return response($sitemaps->robotsTxt($tenant), 200, [
            'Content-Type' => 'text/plain; charset=UTF-8',
            'Cache-Control' => 'public, max-age=300, s-maxage=600',
        ]);
    }

    public function installmentBadges(Request $request, BnplBadgeService $badges): \Illuminate\Http\JsonResponse
    {
        $tenant = $this->publicTenant($request);
        $productId = (int) $request->query('product_id', 0);
        $amount = $request->query('amount_minor');
        $product = $productId > 0
            ? Product::query()->where('tenant_id', $tenant->id)->where('id', $productId)->first()
            : null;

        return response()->json([
            'data' => [
                'badges' => $badges->forProduct(
                    (int) $tenant->id,
                    $product,
                    $amount !== null ? (int) $amount : null
                ),
            ],
        ])->header('Cache-Control', 'public, max-age=30, s-maxage=60');
    }
}
