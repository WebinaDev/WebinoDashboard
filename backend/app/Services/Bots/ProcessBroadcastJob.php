<?php

namespace App\Services\Bots;

use App\Models\BotBroadcastJob;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Bus\Queueable;

class ProcessBroadcastJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public int $jobId) {}

    public function handle(BroadcastService $broadcasts): void
    {
        $job = BotBroadcastJob::query()->find($this->jobId);
        if (! $job) {
            return;
        }
        $broadcasts->tick($job);
    }
}
