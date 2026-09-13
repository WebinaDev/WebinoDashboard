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
        $discovery = $this->app->make(ModuleDiscovery::class);
        $dirs = [];

        if (is_dir($discovery->bundledPath())) {
            foreach (File::directories($discovery->bundledPath()) as $dir) {
                $dirs[basename($dir)] = $dir;
            }
        }
        if (is_dir($discovery->externalPath())) {
            foreach (File::directories($discovery->externalPath()) as $dir) {
                // Prefer nested backend/ for provider class resolution
                $dirs[basename($dir)] = is_dir($dir.'/backend') ? $dir.'/backend' : $dir;
            }
        }

        foreach ($dirs as $name => $dir) {
            $providerClass = "Modules\\{$name}\\{$name}ServiceProvider";
            if (class_exists($providerClass)) {
                $this->app->register($providerClass);
            }
        }
    }
}
