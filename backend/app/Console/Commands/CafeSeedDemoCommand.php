<?php

namespace App\Console\Commands;

use App\Kernel\TenantActivationService;
use App\Kernel\ThemeCatalog;
use App\Models\CafeEvent;
use App\Models\Category;
use App\Models\MenuBanner;
use App\Models\Product;
use App\Models\Tenant;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Provision\CafeRichDemoSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Loads a complete Persian demo cafe into the single tenant so every cafe skin can be shown to prospects.
 * Idempotent: rows are matched by slug and refreshed on every run. Photos ship with the frontend under
 * /themes/cafe-demo (Unsplash license).
 */
class CafeSeedDemoCommand extends Command
{
    protected $signature = 'cafe:seed-demo
        {--theme=cafe-signature : Cafe theme to activate (cafe-signature, cafe-reyhoon, cafe-mash-donald, cafe-kerase, cafe-super, cafe-menew)}
        {--brand= : Rename the tenant, e.g. --brand="کافه دَم"}
        {--fresh : Remove previously seeded demo rows before seeding}
        {--switch-site-type : Switch the tenant to the cafe site type when it is something else}
        {--keep-theme : Seed data only, do not change the active theme}';

    protected $description = 'Seed a sales-ready Persian demo cafe menu (images, modifiers, hours, gallery) and activate a cafe theme';

    private const DEMO_TAG = 'cafe-demo';

    public function handle(
        ModuleSettingsService $settings,
        TenantActivationService $activation,
        CafeRichDemoSeeder $richDemo,
    ): int {
        $tenant = Tenant::query()->first();
        if (! $tenant) {
            $this->error('No tenant found. Run the installer / provisioning first.');

            return self::FAILURE;
        }

        $theme = (string) $this->option('theme');
        if (ThemeCatalog::find($theme) === null || ! str_starts_with($theme, 'cafe-')) {
            $this->error("Unknown cafe theme: {$theme}");

            return self::FAILURE;
        }

        $siteType = $tenant->site_type_slug ?? $tenant->business_type_slug;
        if ($siteType !== 'cafe') {
            if ($this->option('switch-site-type')) {
                $activation->applySiteType($tenant, 'cafe');
                $tenant->refresh();
                $this->info('Site type switched to cafe.');
            } else {
                $this->warn("Tenant site type is '".($siteType ?: 'none')."'. Cafe themes and menu pages need the cafe site type; rerun with --switch-site-type to apply it.");
            }
        }

        $tid = (int) $tenant->id;
        $brand = filled($this->option('brand')) ? trim((string) $this->option('brand')) : (string) $tenant->name;

        DB::transaction(function () use ($tid, $settings, $brand, $tenant, $richDemo) {
            if ($this->option('fresh')) {
                $this->purge($tid, $richDemo);
            }

            $result = $richDemo->seed($tenant, $settings, self::DEMO_TAG, overwrite: true, brandOverride: $brand);
            $this->info("Seeded {$result['products']} menu items in {$result['categories']} categories.");
        });

        if (filled($this->option('brand'))) {
            $tenant->name = (string) $this->option('brand');
        }
        if (! $this->option('keep-theme')) {
            $tenant->active_theme_slug = $theme;
        }
        $tenant->save();

        foreach (['venue', 'menu', 'hours', 'gallery', 'engagement'] as $sub) {
            Cache::forget("module_settings:{$tid}:cafe.{$sub}");
        }
        Cache::forget('modules:tenant:'.$tid);
        Cache::forget('kernel:tenant:'.$tid.':activations');

        $this->info('Demo cafe ready'.($this->option('keep-theme') ? '.' : " with theme {$theme}.").' Open /catalogue (add ?table=7 to try table ordering).');

        return self::SUCCESS;
    }

    private function purge(int $tid, CafeRichDemoSeeder $richDemo): void
    {
        $slugs = array_column($richDemo->items(), 'slug');
        Product::query()->where('tenant_id', $tid)->whereIn('slug', $slugs)->delete();
        Category::query()->where('tenant_id', $tid)->whereIn('slug', array_keys($richDemo->categoryDefs()))->delete();
        MenuBanner::query()->where('tenant_id', $tid)->where('image_url', 'like', CafeRichDemoSeeder::IMG.'/%')->delete();
        CafeEvent::query()->where('tenant_id', $tid)->whereIn('title_en', ['Live acoustic night', 'Latte art workshop'])->delete();
        $this->line('Removed previous demo rows.');
    }
}
