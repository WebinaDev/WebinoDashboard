<?php

use App\Http\Controllers\Api\V1\BuilderFormFilesController;
use App\Models\PricingSetting;
use App\Services\AiContent\AiQueue;
use App\Services\Analytics\AnalyticsRollup;
use App\Services\Bots\Engine\BotMessenger;
use App\Services\Bots\Engine\BotPoller;
use App\Services\Bots\Engine\ChannelPublisher;
use App\Services\Builder\BuilderPageLifecycle;
use App\Services\Marketing\AbandonedCartService;
use App\Services\Marketplace\Basalam\BasalamScheduler;
use App\Services\Marketplace\Digikala\DigikalaScheduler;
use App\Services\Marketplace\MarketplaceSync;
use App\Services\Marketplace\TorobWebhookQueue;
use App\Services\Orders\OrderStock;
use App\Services\Pricing\ExchangeRateService;
use App\Services\Pricing\PricingCalculator;
use App\Models\Tenant;
use App\Services\Security\SecurityEventLogger;
use App\Services\Sms\SmsLocalFeatures;
use App\Services\Support\CsatCampaignService;
use App\Services\Support\TicketSlaService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Carbon;
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
        if (PricingCalculator::bool($g['enabled'] ?? true) && PricingCalculator::bool($g['api_enabled'] ?? false) && PricingCalculator::bool($g['auto_update_enabled'] ?? false)
            && (int) ($g['auto_update_hour'] ?? 0) === $hour) {
            ExchangeRateService::update($row->tenant_id);
        }
    });
})->purpose('Daily WFCP exchange-rate refresh at each tenant\'s configured hour');

Artisan::command('analytics:rollup', function () {
    app(AnalyticsRollup::class)->runDailyForAllTenants();
    $this->info('Analytics rollup complete.');
})->purpose('Roll up yesterday/today analytics and purge old events');

Artisan::command('ai:tick', function () {
    app(AiQueue::class)->tickAllTenants();
    $this->info('AI content tick complete.');
})->purpose('Process due AI calendar slots and pending jobs');

Artisan::command('sms:dispatch-scheduled', function () {
    $sent = app(SmsLocalFeatures::class)->dispatchDue();
    $this->info("Dispatched {$sent} scheduled SMS / ad campaign batches.");
})->purpose('Send locally held scheduled SMS and due SMS ad campaigns');

Artisan::command('pricing:bulk-price-schedule', function () {
    $hour = (int) now()->format('G');
    $weekday = (int) now()->dayOfWeek;
    $bulk = app(\App\Services\Pricing\BulkPriceChangeService::class);
    PricingSetting::query()->each(function (PricingSetting $row) use ($hour, $weekday, $bulk) {
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
        if (is_string($last) && Carbon::parse($last)->isSameHour(now())) {
            return;
        }
        if ($bulk->hasActiveJob($row->tenant_id)) {
            return;
        }
        try {
            $bulk->createJob($row->tenant_id, $schedule);
            $payload['bulk_price_schedule']['last_run_at'] = now()->toIso8601String();
            $row->update(['payload' => $payload]);
        } catch (\Throwable $e) {
            // Skip this tenant; tick / next hour can retry.
        }
    });
})->purpose('Queue scheduled bulk price change jobs');

Artisan::command('pricing:bulk-price-tick', function () {
    $bulk = app(\App\Services\Pricing\BulkPriceChangeService::class);
    $bulk->releaseStaleLocks();
    $n = $bulk->tick();
    $this->info("Processed batches for {$n} bulk price job(s).");
})->purpose('Advance pending/running bulk price jobs in small batches');

Artisan::command('stock:release-reservations', function () {
    $released = app(OrderStock::class)->releaseExpired();
    $this->info("Released {$released} expired stock reservations.");
})->purpose('Give back stock held by unpaid orders whose reservation expired');

Schedule::command('stock:release-reservations')->everyMinute()->withoutOverlapping();
Schedule::command('pricing:exchange-auto-update')->hourly()->withoutOverlapping();
Schedule::command('pricing:bulk-price-schedule')->hourly()->withoutOverlapping();
Schedule::command('pricing:bulk-price-tick')->everyMinute()->withoutOverlapping(5);
Schedule::command('analytics:rollup')->hourly()->withoutOverlapping();
Schedule::command('ai:tick')->everyMinute()->withoutOverlapping();
Schedule::command('wordpress-import:reset --stale')->everyTenMinutes()->withoutOverlapping();
Schedule::command('sms:dispatch-scheduled')->everyMinute()->withoutOverlapping();
Schedule::command('bots:retry-outbound')->everyMinute()->withoutOverlapping();
Schedule::command('bots:channel-tick')->everyMinute()->withoutOverlapping();
Schedule::command('bots:poll')->everyMinute()->withoutOverlapping(2);
Schedule::command('security:prune-events')->daily()->withoutOverlapping();
Schedule::command('cart:abandoned-recover')->everyFifteenMinutes()->withoutOverlapping();
Schedule::command('marketplace:maintain')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('marketplace:pull-orders')->everyFifteenMinutes()->withoutOverlapping();
Schedule::command('marketplace:torob-webhooks')->everyMinute()->withoutOverlapping();
Schedule::command('marketplace:basalam-tick')->everyMinute()->withoutOverlapping();
Schedule::command('marketplace:digikala-tick')->hourly()->withoutOverlapping();

Artisan::command('builder:scheduled', function () {
    [$published, $unpublished] = app(BuilderPageLifecycle::class)->runDue();
    $this->info("Builder pages published: {$published}, unpublished: {$unpublished}");
})->purpose('Publish/unpublish builder pages whose schedule is due');

Schedule::command('builder:scheduled')->everyMinute()->withoutOverlapping();

Artisan::command('builder:purge-form-uploads {--hours=24}', function () {
    $removed = BuilderFormFilesController::purgeOrphans(max(1, (int) $this->option('hours')));
    $this->info("Removed {$removed} unattached form uploads");
})->purpose('Delete builder form uploads that were never attached to a submission');

Schedule::command('builder:purge-form-uploads')->hourly()->withoutOverlapping();

Artisan::command('bots:retry-outbound', function () {
    $sent = BotMessenger::retryDue();
    $this->info("Retried bot messages: {$sent} sent.");
})->purpose('Retry failed Bale/Telegram outbound messages with backoff');

Artisan::command('bots:channel-tick', function () {
    $n = ChannelPublisher::publishDue();
    $this->info("Published {$n} scheduled channel posts.");
})->purpose('Publish due scheduled Bale/Telegram channel posts');

Artisan::command('bots:poll', function () {
    $res = app(BotPoller::class)->tick();
    $this->info("Polled {$res['bots']} bot(s), handled {$res['updates']} update(s).");
})->purpose('Poll getUpdates for Bale/Telegram bots in polling mode');

Artisan::command('cart:abandoned-recover', function () {
    $n = app(AbandonedCartService::class)->run();
    $this->info("Abandoned-cart reminders sent: {$n}.");
})->purpose('Multi-stage abandoned cart recovery via bot + SMS');

Artisan::command('security:prune-events', function () {
    $this->info('Pruned security events: '.SecurityEventLogger::prune());
})->purpose('Delete security events past each tenant retention window');

Artisan::command('support:sla-tick', function () {
    $sla = app(TicketSlaService::class);
    $breached = 0;
    $warned = 0;
    Tenant::query()->orderBy('id')->pluck('id')->each(function ($tid) use ($sla, &$breached, &$warned) {
        $r = $sla->refreshTenant((int) $tid);
        $breached += $r['breached'];
        $warned += $r['warned'];
    });
    $this->info("SLA tick: breached={$breached} warned={$warned}");
})->purpose('Detect SLA warnings and breaches for support tickets');

Artisan::command('support:csat-tick', function () {
    $csat = app(CsatCampaignService::class);
    $sent = 0;
    Tenant::query()->orderBy('id')->pluck('id')->each(function ($tid) use ($csat, &$sent) {
        $sent += $csat->dispatchDue((int) $tid);
    });
    $this->info("CSAT invitations sent: {$sent}");
})->purpose('Send due post-resolve CSAT survey invitations');

Schedule::command('support:sla-tick')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('support:csat-tick')->everyFiveMinutes()->withoutOverlapping();
