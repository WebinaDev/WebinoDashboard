<?php
namespace App\Services\Academy;
use App\Models\AcademyCourse;
use App\Models\AcademyLesson;
use App\Models\AcademyQuizAttempt;
use App\Models\User;
final class AcademyAccessService
{
    public function __construct(private readonly AcademyEnrollmentService $enrollments) {}
    public function canViewLesson(AcademyLesson $lesson, AcademyCourse $course, ?User $user): bool
    {
        if ($lesson->is_preview) {
            return true;
        }
        $enrollment = $this->enrollments->activeEnrollment($course, $user);
        if (! $enrollment) {
            return false;
        }
        if ($course->drip_enabled && $lesson->drip_days !== null && $enrollment->enrolled_at) {
            if (now()->lt($enrollment->enrolled_at->copy()->addDays((int) $lesson->drip_days))) {
                return false;
            }
        }
        if ($lesson->requires_pass_lesson_id) {
            $gate = AcademyLesson::query()->with('quiz')->find($lesson->requires_pass_lesson_id);
            if ($gate && $gate->type === AcademyLesson::TYPE_QUIZ && $gate->quiz && $user) {
                $passed = AcademyQuizAttempt::query()->where('quiz_id', $gate->quiz->id)->where('user_id', $user->id)->where('passed', true)->exists();
                if (! $passed) {
                    return false;
                }
            }
        }
        return true;
    }
    public function publicLessonPayload(AcademyLesson $lesson, bool $unlocked): array
    {
        $base = [
            'id' => $lesson->id, 'slug' => $lesson->slug, 'title' => $lesson->title,
            'type' => $lesson->type ?: AcademyLesson::TYPE_TEXT, 'sort_order' => $lesson->sort_order,
            'duration_seconds' => $lesson->duration_seconds, 'is_preview' => (bool) $lesson->is_preview,
            'section_id' => $lesson->section_id, 'locked' => ! $unlocked, 'drip_days' => $lesson->drip_days,
        ];
        if (! $unlocked) {
            return $base;
        }
        return array_merge($base, [
            'content' => $lesson->content, 'video_url' => $lesson->video_url, 'audio_url' => $lesson->audio_url,
            'file_name' => $lesson->file_name, 'has_file' => (bool) $lesson->file_path,
        ]);
    }
}
