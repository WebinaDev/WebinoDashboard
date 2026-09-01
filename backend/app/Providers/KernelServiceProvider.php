<?php

namespace App\Providers;

use App\Kernel\ModuleDiscovery;
use App\Kernel\ModuleRegistry;
use App\Kernel\TenantActivationService;
use Illuminate\Support\Facades\File;
use Illuminate\Support\ServiceProvider;

class KernelServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(ModuleDiscovery::class);
        $this->app->singleton(ModuleRegistry::class);
        $this->app->singleton(TenantActivationService::class);
    }

    public function boot(): void
    {
        $this->registerModuleProviders();

        if ($this->app->runningInConsole()) {
            return;
        }

        try {
            $this->app->make(ModuleRegistry::class)->boot();
        } catch (\Throwable) {
            // DB may not be migrated yet during first install
        }
    }

    private function registerModuleProviders(): void
    {
        $base = base_path('modules');
        if (! is_dir($base)) {
            return;
        }

        foreach (File::directories($base) as $dir) {
            $name = basename($dir);
            $providerClass = "Modules\\{$name}\\{$name}ServiceProvider";
            if (class_exists($providerClass)) {
                $this->app->register($providerClass);
            }
        }
    }
}
