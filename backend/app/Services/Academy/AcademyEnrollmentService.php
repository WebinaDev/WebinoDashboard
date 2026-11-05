<?php
namespace App\Services\Academy;
use App\Models\AcademyCourse;
use App\Models\AcademyEnrollment;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use Illuminate\Support\Facades\DB;
final class AcademyEnrollmentService
{
    public function enrollUser(AcademyCourse $course, User $user, ?Order $order = null): AcademyEnrollment
    {
        return DB::transaction(function () use ($course, $user, $order) {
            $row = AcademyEnrollment::query()->firstOrNew(['course_id' => $course->id, 'user_id' => $user->id]);
            if (! $row->exists) {
                $row->tenant_id = (int) $course->tenant_id;
                $row->enrolled_at = now();
                $row->status = AcademyEnrollment::STATUS_ACTIVE;
                $row->progress_percent = 0;
                $course->increment('students_count');
            }
            if ($order && ! $row->order_id) {
                $row->order_id = $order->id;
            }
            if ($row->status === AcademyEnrollment::STATUS_CANCELLED) {
                $row->status = AcademyEnrollment::STATUS_ACTIVE;
                $row->enrolled_at = $row->enrolled_at ?? now();
            }
            $row->save();
            return $row->fresh();
        });
    }
    public function enrollFree(AcademyCourse $course, User $user): AcademyEnrollment
    {
        if (! $course->is_free && (int) ($course->price_minor ?? 0) > 0) {
            abort(422, 'academy.course_not_free');
        }
        return $this->enrollUser($course, $user);
    }
    public function enrollFromPaidOrder(Order $order): int
    {
        if (! $order->user_id) {
            return 0;
        }
        $user = User::query()->find($order->user_id);
        if (! $user) {
            return 0;
        }
        $count = 0;
        foreach (OrderItem::query()->where('order_id', $order->id)->get() as $item) {
            $course = null;
            $metaCourseId = (int) data_get($item->meta, 'academy_course_id', 0);
            if ($metaCourseId > 0) {
                $course = AcademyCourse::query()->where('tenant_id', $order->tenant_id)->where('id', $metaCourseId)->first();
            }
            if (! $course && $item->product_id) {
                $course = AcademyCourse::query()->where('tenant_id', $order->tenant_id)->where('product_id', $item->product_id)->first();
            }
            if ($course) {
                $this->enrollUser($course, $user, $order);
                $count++;
            }
        }
        return $count;
    }
    public function activeEnrollment(AcademyCourse $course, ?User $user): ?AcademyEnrollment
    {
        if (! $user) {
            return null;
        }
        return AcademyEnrollment::query()->where('course_id', $course->id)->where('user_id', $user->id)
            ->whereIn('status', [AcademyEnrollment::STATUS_ACTIVE, AcademyEnrollment::STATUS_COMPLETED])->first();
    }
}
