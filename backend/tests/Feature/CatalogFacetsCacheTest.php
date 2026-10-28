<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Tenant;
use App\Observers\CatalogFacetsObserver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class CatalogFacetsCacheTest extends TestCase
{
    use RefreshDatabase;

    public function test_category_change_drops_cached_facets(): void
    {
        $tenant = Tenant::query()->create(['name' => 'T', 'slug' => 't', 'domain' => 't.test', 'license_key' => 'k', 'default_currency' => 'IRR']);
        Cache::put(CatalogFacetsObserver::key($tenant->id), ['stale' => true], 300);
        $cat = Category::query()->create(['tenant_id' => $tenant->id, 'name' => 'Cat', 'slug' => 'cat']);
        $this->assertNull(Cache::get(CatalogFacetsObserver::key($tenant->id)));

        Cache::put(CatalogFacetsObserver::key($tenant->id), ['stale' => true], 300);
        $cat->delete();
        $this->assertNull(Cache::get(CatalogFacetsObserver::key($tenant->id)));
    }
}
