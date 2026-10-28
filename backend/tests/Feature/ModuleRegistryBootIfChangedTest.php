<?php

namespace Tests\Feature;

use App\Kernel\ModuleRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ModuleRegistryBootIfChangedTest extends TestCase
{
    use RefreshDatabase;

    public function test_syncs_once_then_skips_until_fingerprint_changes(): void
    {
        $registry = app(ModuleRegistry::class);
        Cache::forget(ModuleRegistry::FINGERPRINT_KEY);

        $registry->bootIfChanged();
        $this->assertSame($registry->catalogFingerprint(), Cache::get(ModuleRegistry::FINGERPRINT_KEY));
        $this->assertGreaterThan(0, DB::table('submodules')->count());

        DB::enableQueryLog();
        DB::flushQueryLog();
        $registry->bootIfChanged();
        $this->assertCount(0, DB::getQueryLog(), 'unchanged catalog must not hit the DB');

        Cache::put(ModuleRegistry::FINGERPRINT_KEY, 'stale');
        DB::flushQueryLog();
        $registry->bootIfChanged();
        $this->assertNotEmpty(DB::getQueryLog());
        $this->assertSame($registry->catalogFingerprint(), Cache::get(ModuleRegistry::FINGERPRINT_KEY));
    }
}
