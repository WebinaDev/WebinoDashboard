<?php

namespace App\Jobs;

use App\Models\SiteConsultation;
use App\Services\Erm\ErmConsultationSyncService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class SyncConsultationToErmJob implements ShouldQueue
{
    use Queueable;

    public function __construct(public int $consultationId) {}

    public function handle(ErmConsultationSyncService $sync): void
    {
        $row = SiteConsultation::query()->find($this->consultationId);
        if (! $row || $row->erp_consultation_id) {
            return;
        }

        $sync->sync($row);
    }
}
