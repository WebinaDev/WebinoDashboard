<?php

use App\Models\PricingSetting;
use App\Services\Marketplace\Basalam\BasalamScheduler;
use App\Services\Pricing\ExchangeRateService;
use App\Services\Pricing\PricingCalculator;
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

Artisan::command('pricing:exchange-auto-update', function () {
    $hour = (int) now()->format('G');
    PricingSetting::query()->each(function (PricingSetting $row) use ($hour) {
        $g = (new PricingCalculator($row->payload ?? []))->section('general');
        if (PricingCalculator::bool($g['api_enabled'] ?? false) && PricingCalculator::bool($g['auto_update_enabled'] ?? false)
            && (int) ($g['auto_update_hour'] ?? 0) === $hour) {
            ExchangeRateService::update($row->tenant_id);
        }
    });
})->purpose('Daily WFCP exchange-rate refresh at each tenant\'s configured hour');

Artisan::command('analytics:rollup', function () {
    app(\App\Services\Analytics\AnalyticsRollup::class)->runDailyForAllTenants();
    $this->info('Analytics rollup complete.');
})->purpose('Roll up yesterday/today analytics and purge old events');

Artisan::command('ai:tick', function () {
    app(\App\Services\AiContent\AiQueue::class)->tickAllTenants();
    $this->info('AI content tick complete.');
})->purpose('Process due AI calendar slots and pending jobs');

Artisan::command('sms:dispatch-scheduled', function () {
    $sent = app(\App\Services\Sms\SmsLocalFeatures::class)->dispatchDue();
    $this->info("Dispatched {$sent} scheduled SMS.");
})->purpose('Send locally held scheduled SMS whose time has come');

Artisan::command('pricing:bulk-price-schedule', function () {
    $hour = (int) now()->format('G');
    $weekday = (int) now()->dayOfWeek;
    PricingSetting::query()->each(function (PricingSetting $row) use ($hour, $weekday) {
        $payload = is_array($row->payload) ? $row->payload : [];
        $schedule = is_array($payload['bulk_price_schedule'] ?? null) ? $payload['bulk_price_schedule'] : null;
        if (! $schedule || empty($schedule['enabled'])) {
            return;
        }
        if ((int) ($schedule['hour'] ?? 3) !== $hour) {
            return;
        }
        if (($schedule['frequency'] ?? 'daily') === 'weekly' && (int) ($schedule['weekday'] ?? 0) !== $weekday) {
            return;
        }
        $last = $schedule['last_run_at'] ?? null;
        if (is_string($last) && \Illuminate\Support\Carbon::parse($last)->isSameHour(now())) {
            return;
        }
        $running = \App\Models\BulkPriceJob::query()
            ->where('tenant_id', $row->tenant_id)
            ->where('locked', true)
            ->where('updated_at', '>=', now()->subMinutes(15))
            ->exists();
        if ($running) {
            return;
        }
        $job = \App\Models\BulkPriceJob::query()->create([
            'tenant_id' => $row->tenant_id,
            'status' => 'running',
            'params' => [
                'change_type' => $schedule['change_type'] ?? 'percent',
                'value' => $schedule['value'] ?? 0,
                'apply_to_sale' => (bool) ($schedule['apply_to_sale'] ?? false),
                'category_slugs' => $schedule['category_slugs'] ?? [],
                'rounding' => (bool) ($schedule['rounding'] ?? false),
                'round_step' => $schedule['round_step'] ?? 1000,
            ],
            'state' => ['processed' => 0, 'updated' => 0, 'skipped' => 0, 'total' => 0],
            'locked' => true,
            'last_log' => 'Scheduled job started',
        ]);
        try {
            app(\App\Http\Controllers\Api\V1\PricingController::class)->runBulkPriceJob($job);
            $payload['bulk_price_schedule']['last_run_at'] = now()->toIso8601String();
            $row->update(['payload' => $payload]);
        } catch (\Throwable $e) {
            $job->update(['status' => 'failed', 'locked' => false, 'last_log' => $e->getMessage()]);
        }
    });
})->purpose('Run scheduled bulk price changes');

Schedule::command('pricing:exchange-auto-update')->hourly()->withoutOverlapping();
Schedule::command('pricing:bulk-price-schedule')->hourly()->withoutOverlapping();
Schedule::command('analytics:rollup')->hourly()->withoutOverlapping();
Schedule::command('ai:tick')->everyMinute()->withoutOverlapping();
Schedule::command('sms:dispatch-scheduled')->everyMinute()->withoutOverlapping();
Schedule::command('marketplace:maintain')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('marketplace:pull-orders')->everyFifteenMinutes()->withoutOverlapping();
Schedule::command('marketplace:torob-webhooks')->everyMinute()->withoutOverlapping();
Schedule::command('marketplace:basalam-tick')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('marketplace:digikala-tick')->hourly()->withoutOverlapping();
