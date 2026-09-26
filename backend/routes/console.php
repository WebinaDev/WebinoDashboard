<?php

use App\Services\Marketplace\Basalam\BasalamScheduler;
use App\Services\Marketplace\Digikala\DigikalaScheduler;
use App\Services\Marketplace\MarketplaceSync;
use App\Services\Marketplace\TorobWebhookQueue;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('marketplace:pull-orders', function () {
    app(MarketplaceSync::class)->pullAllOrders();
})->purpose('Queue order pulls for every enabled marketplace');

Artisan::command('marketplace:maintain', function () {
    app(MarketplaceSync::class)->maintain();
})->purpose('Recover stuck marketplace jobs and prune history');

Artisan::command('marketplace:torob-webhooks', function () {
    app(TorobWebhookQueue::class)->flushAll();
})->purpose('Send debounced Torob product-page webhooks');

Artisan::command('marketplace:basalam-tick', function () {
    app(BasalamScheduler::class)->tick();
})->purpose('Basalam token refresh, order polling, discount tasks and webhook health');

Artisan::command('marketplace:digikala-tick', function () {
    app(DigikalaScheduler::class)->tick();
})->purpose('Digikala token refresh and reconcile');

Schedule::command('marketplace:maintain')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('marketplace:pull-orders')->everyFifteenMinutes()->withoutOverlapping();
Schedule::command('marketplace:torob-webhooks')->everyMinute()->withoutOverlapping();
Schedule::command('marketplace:basalam-tick')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('marketplace:digikala-tick')->hourly()->withoutOverlapping();
