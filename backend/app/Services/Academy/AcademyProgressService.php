<?php
namespace App\Services\Academy;
use App\Models\AcademyEnrollment;
use App\Models\AcademyLesson;
use App\Models\AcademyLessonProgress;
use Illuminate\Support\Facades\DB;
final class AcademyProgressService
{
    public function __construct(private readonly AcademyCertificateService $certificates) {}
    public function markLesson(AcademyEnrollment $enrollment, AcademyLesson $lesson, int $percent = 100, bool $complete = true): AcademyLessonProgress
    {
        return DB::transaction(function () use ($enrollment, $lesson, $percent, $complete) {
            $row = AcademyLessonProgress::query()->firstOrNew([
                'enrollment_id' => $enrollment->id,
                'lesson_id' => $lesson->id,
            ]);
            $row->user_id = $enrollment->user_id;
            $row->started_at = $row->started_at ?? now();
            $row->percent = max(0, min(100, $percent));
            if ($complete || $row->percent >= 100) {
                $row->status = AcademyLessonProgress::STATUS_COMPLETED;
                $row->percent = 100;
                $row->completed_at = $row->completed_at ?? now();
            } else {
                $row->status = AcademyLessonProgress::STATUS_STARTED;
            }
            $row->save();
            $this->recalcEnrollment($enrollment);
            return $row->fresh();
        });
    }
    public function recalcEnrollment(AcademyEnrollment $enrollment): void
    {
        $enrollment->refresh();
        $total = AcademyLesson::query()->where('course_id', $enrollment->course_id)->where('published', true)->count();
        $done = AcademyLessonProgress::query()->where('enrollment_id', $enrollment->id)->where('status', AcademyLessonProgress::STATUS_COMPLETED)->count();
        $pct = $total > 0 ? (int) round(($done / $total) * 100) : 0;
        $enrollment->progress_percent = min(100, $pct);
        if ($pct >= 100 && $enrollment->status !== AcademyEnrollment::STATUS_COMPLETED) {
            $enrollment->status = AcademyEnrollment::STATUS_COMPLETED;
            $enrollment->completed_at = now();
            $enrollment->save();
            $this->certificates->issueIfEnabled($enrollment);
        } else {
            $enrollment->save();
        }
    }
}
