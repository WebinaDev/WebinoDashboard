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

        foreach (['db:seed', 'db:wipe', 'migrate:fresh', 'migrate:refresh', 'migrate:reset', 'migrate:rollback'] as $command) {
            try {
                Event::dispatch(new CommandStarting($command, new ArrayInput([]), new BufferedOutput));
                $this->fail("Command {$command} was not blocked.");
            } catch (\RuntimeException $exception) {
                $this->assertSame(__('production.database_command_forbidden'), $exception->getMessage());
            }
        }
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
