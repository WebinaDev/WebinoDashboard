<?php

namespace App\Console\Commands;

use App\Models\Tenant;
use App\Services\Resume\ResumeImporter;
use App\Services\Resume\ResumeThemes;
use Illuminate\Console\Command;

/** php artisan resume:import <tenant id|slug|domain> <path/to/data.json> [--replace] [--theme=code-noir] [--locale=fa] */
class ResumeImportCommand extends Command
{
    protected $signature = 'resume:import {tenant} {file} {--replace : Delete the tenant\'s resume rows first} {--theme= : Also apply this theme layout to the home/en pages} {--locale= : Set the site default language (fa|en)}';

    protected $description = 'Load a data.json resume (resume-mockups format) into a tenant';

    public function handle(): int
    {
        $t = (string) $this->argument('tenant');
        $tenant = Tenant::query()->where('id', ctype_digit($t) ? (int) $t : 0)->orWhere('slug', $t)->orWhere('domain', $t)->first();
        if (! $tenant) {
            $this->error('Tenant not found');

            return self::FAILURE;
        }
        $json = json_decode((string) @file_get_contents((string) $this->argument('file')), true);
        if (! is_array($json)) {
            $this->error('Invalid JSON file');

            return self::FAILURE;
        }
        $report = ResumeImporter::import($tenant->id, $json, (bool) $this->option('replace'), dirname((string) realpath((string) $this->argument('file'))));
        foreach ($report as $k => $n) {
            $this->line(sprintf('%-16s %d', $k, $n));
        }
        if ($locale = $this->option('locale')) {
            $tenant->default_locale = in_array($locale, ['fa', 'en'], true) ? $locale : 'fa';
            $tenant->save();
        }
        if ($theme = $this->option('theme')) {
            $r = ResumeThemes::applyLayout($tenant->id, $theme, ['fa', 'en']);
            $this->info('Theme layout applied: '.json_encode($r['pages']));
        }

        return self::SUCCESS;
    }
}
