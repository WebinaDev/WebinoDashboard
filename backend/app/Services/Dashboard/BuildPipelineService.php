<?php

namespace App\Services\Dashboard;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Symfony\Component\Process\Process;

final class BuildPipelineService
{
    private const STATE_KEY = 'dashboard:build_pipeline_state';

    private const LOCK_KEY = 'dashboard:build_pipeline_lock';

    private const LOG_MAX = 120000;

    /** @return array<int, array<string, string>> */
    public function steps(): array
    {
        $frontend = dirname(base_path()).'/frontend';

        return [
            [
                'id' => 'frontend_deps',
                'label' => 'Install frontend dependencies',
                'command' => 'npm ci',
                'cwd' => $frontend,
            ],
            [
                'id' => 'frontend_build',
                'label' => 'Build frontend',
                'command' => 'npm run build',
                'cwd' => $frontend,
            ],
        ];
    }

    /** @return array<string, mixed> */
    public function defaultState(): array
    {
        return [
            'enabled' => (bool) config('dashboard.build_pipeline'),
            'status' => 'idle',
            'current_step' => '',
            'started_at' => null,
            'finished_at' => null,
            'exit_code' => null,
            'error' => '',
            'log' => '',
            'log_tail' => '',
            'steps_done' => [],
            'steps' => $this->formatSteps([]),
            'locked' => false,
        ];
    }

    /** @return array<string, mixed> */
    public function status(): array
    {
        if (! config('dashboard.build_pipeline')) {
            return array_merge($this->defaultState(), [
                'enabled' => false,
                'status' => 'disabled',
            ]);
        }

        $state = Cache::get(self::STATE_KEY);
        if (! is_array($state)) {
            $state = [];
        }

        $merged = array_merge($this->defaultState(), $state);
        $merged['enabled'] = true;
        $merged['locked'] = Cache::has(self::LOCK_KEY);
        $merged['steps'] = $this->formatSteps(is_array($merged['steps_done'] ?? null) ? $merged['steps_done'] : []);
        $log = (string) ($merged['log'] ?? '');
        $merged['log_tail'] = strlen($log) > 4000 ? substr($log, -4000) : $log;

        return $merged;
    }

    /** @return array<string, mixed> */
    public function start(): array
    {
        if (! config('dashboard.build_pipeline')) {
            throw new \DomainException('Build pipeline is disabled on this host');
        }

        if (Cache::has(self::LOCK_KEY)) {
            throw new \RuntimeException('A build pipeline is already running');
        }

        $frontend = dirname(base_path()).'/frontend';
        if (! is_file($frontend.'/package.json')) {
            throw new \RuntimeException('Frontend package.json is missing');
        }

        Cache::put(self::LOCK_KEY, 1, config('dashboard.build_pipeline_timeout', 900) + 60);

        $state = array_merge($this->defaultState(), [
            'enabled' => true,
            'status' => 'running',
            'current_step' => 'starting',
            'started_at' => now()->toIso8601String(),
            'finished_at' => null,
            'exit_code' => null,
            'error' => '',
            'log' => "== Build pipeline started ==\n",
            'steps_done' => [],
        ]);
        $this->persistState($state);

        try {
            foreach ($this->steps() as $step) {
                $state['current_step'] = $step['id'];
                $this->persistState($state);
                $this->appendLog($state, "\n>> {$step['label']}\n");

                $process = Process::fromShellCommandline($step['command'], $step['cwd']);
                $process->setTimeout((int) config('dashboard.build_pipeline_timeout', 900));
                $process->run(function ($type, $buffer) use (&$state) {
                    $this->appendLog($state, $buffer);
                });

                if (! $process->isSuccessful()) {
                    $state['status'] = 'failed';
                    $state['exit_code'] = $process->getExitCode();
                    $state['error'] = trim($process->getErrorOutput()) ?: 'Step failed';
                    $state['finished_at'] = now()->toIso8601String();
                    $this->persistState($state);
                    Cache::forget(self::LOCK_KEY);

                    return $this->status();
                }

                $done = is_array($state['steps_done']) ? $state['steps_done'] : [];
                $done[] = $step['id'];
                $state['steps_done'] = $done;
            }

            $state['status'] = 'success';
            $state['current_step'] = '';
            $state['exit_code'] = 0;
            $state['finished_at'] = now()->toIso8601String();
            $this->appendLog($state, "\n== Build pipeline finished ==\n");
            $this->persistState($state);
        } catch (\Throwable $e) {
            $state['status'] = 'failed';
            $state['error'] = $e->getMessage();
            $state['finished_at'] = now()->toIso8601String();
            $this->persistState($state);
        } finally {
            Cache::forget(self::LOCK_KEY);
        }

        return $this->status();
    }

    /** @return array<string, mixed> */
    public function cancel(): array
    {
        Cache::forget(self::LOCK_KEY);
        $state = $this->status();
        if (($state['status'] ?? '') === 'running') {
            $state['status'] = 'failed';
            $state['error'] = 'Cancelled';
            $state['finished_at'] = now()->toIso8601String();
            $this->persistState($state);
        }

        return $this->status();
    }

    /**
     * @param  list<string>  $done
     * @return list<array<string, mixed>>
     */
    private function formatSteps(array $done): array
    {
        return array_map(function (array $step) use ($done) {
            return [
                'id' => $step['id'],
                'label' => $step['label'],
                'done' => in_array($step['id'], $done, true),
            ];
        }, $this->steps());
    }

    /** @param  array<string, mixed>  $state */
    private function persistState(array $state): void
    {
        Cache::put(self::STATE_KEY, $state, 86400);
    }

    /** @param  array<string, mixed>  $state */
    private function appendLog(array &$state, string $chunk): void
    {
        $log = (string) ($state['log'] ?? '');
        $log .= $chunk;
        if (strlen($log) > self::LOG_MAX) {
            $log = substr($log, -self::LOG_MAX);
        }
        $state['log'] = $log;
        $this->persistState($state);
    }
}
