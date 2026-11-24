<?php

namespace Tests\Feature;

use Illuminate\Console\Events\CommandStarting;
use Illuminate\Support\Facades\Event;
use Symfony\Component\Console\Input\ArrayInput;
use Symfony\Component\Console\Output\BufferedOutput;
use Tests\TestCase;

class ProductionDatabaseCommandGuardTest extends TestCase
{
    public function test_destructive_commands_are_blocked_in_production(): void
    {
        $this->app['env'] = 'production';

        foreach (['db:seed', 'db:wipe', 'migrate:fresh', 'migrate:refresh', 'migrate:reset', 'migrate:rollback', 'cafe:seed-demo'] as $command) {
            try {
                Event::dispatch(new CommandStarting($command, new ArrayInput([]), new BufferedOutput));
                $this->fail("Command {$command} was not blocked.");
            } catch (\RuntimeException $exception) {
                $this->assertSame(__('production.database_command_forbidden'), $exception->getMessage());
            }
        }
    }

    public function test_demo_content_services_are_blocked_in_production(): void
    {
        $this->app['env'] = 'production';
        $tenant = new \App\Models\Tenant;
        $siteSeeder = app(\App\Services\Provision\SiteTypeDemoSeeder::class);
        $this->assertFalse($siteSeeder->shouldAutoSeed($tenant));

        $calls = [
            fn () => $siteSeeder->seed($tenant, null, [], true),
            fn () => app(\App\Services\Provision\ProvisionContentSeeder::class)->seed($tenant, []),
            fn () => app(\App\Services\Provision\CafeRichDemoSeeder::class)->seed($tenant, app(\App\Services\Modules\ModuleSettingsService::class), 'test'),
        ];
        foreach ($calls as $call) {
            try {
                $call();
                $this->fail('Demo content was not blocked.');
            } catch (\RuntimeException $exception) {
                $this->assertSame(__('production.database_command_forbidden'), $exception->getMessage());
            }
        }
    }

    public function test_demo_import_is_rejected_before_processing_in_production(): void
    {
        $this->app['env'] = 'production';
        $request = \Illuminate\Http\Request::create('/api/v1/setup/import-demo', 'POST');

        $response = app(\App\Http\Controllers\Api\V1\SetupController::class)->importDemo($request);

        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame(__('production.database_command_forbidden'), $response->getData(true)['message']);
    }

    public function test_seed_option_is_blocked_for_production_migrations(): void
    {
        $this->app['env'] = 'production';
        $input = new ArrayInput(['--seed' => true], new \Symfony\Component\Console\Input\InputDefinition([
            new \Symfony\Component\Console\Input\InputOption('seed'),
        ]));

        $this->expectException(\RuntimeException::class);
        Event::dispatch(new CommandStarting('migrate', $input, new BufferedOutput));
    }

    public function test_commands_are_allowed_outside_production(): void
    {
        $this->app['env'] = 'testing';
        Event::dispatch(new CommandStarting('db:seed', new ArrayInput([]), new BufferedOutput));

        $this->assertTrue(true);
    }
}
