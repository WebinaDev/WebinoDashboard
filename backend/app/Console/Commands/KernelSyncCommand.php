<?php

namespace App\Console\Commands;

use App\Kernel\ModuleRegistry;
use Illuminate\Console\Command;

class KernelSyncCommand extends Command
{
    protected $signature = 'webino:kernel-sync';

    protected $description = 'Sync module manifests and site type profiles into the database';

    public function handle(ModuleRegistry $registry): int
    {
        $registry->boot();
        $this->info('Kernel registry synced.');

        return self::SUCCESS;
    }
}
