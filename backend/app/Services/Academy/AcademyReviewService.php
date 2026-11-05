<?php
namespace App\Services\Academy;
use App\Models\AcademyCourse;
use App\Models\AcademyReview;
use App\Models\User;
final class AcademyReviewService
{
    public function submit(AcademyCourse $course, ?User $user, int $rating, ?string $body, ?string $authorName): AcademyReview
    {
        return AcademyReview::query()->create([
            'tenant_id' => $course->tenant_id, 'course_id' => $course->id, 'user_id' => $user?->id,
            'rating' => max(1, min(5, $rating)), 'body' => $body, 'author_name' => $authorName ?: ($user?->name),
            'status' => AcademyReview::STATUS_PENDING,
        ]);
    }
    public function moderate(AcademyReview $review, string $status, ?string $adminReply = null): AcademyReview
    {
        $review->status = $status;
        if ($adminReply !== null) $review->admin_reply = $adminReply;
        $review->save();
        $this->recalcCourse($review->course_id);
        return $review->fresh();
    }
    public function recalcCourse(int $courseId): void
    {
        $course = AcademyCourse::query()->find($courseId);
        if (! $course) return;
        $q = AcademyReview::query()->where('course_id', $courseId)->where('status', AcademyReview::STATUS_APPROVED);
        $count = (clone $q)->count();
        $avg = $count > 0 ? round((float) (clone $q)->avg('rating'), 2) : null;
        $course->update(['rating_count' => $count, 'rating_avg' => $avg]);
    }
}
