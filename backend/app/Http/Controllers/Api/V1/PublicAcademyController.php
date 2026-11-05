<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\AcademyCourse;
use App\Models\AcademyLesson;
use App\Models\AcademyReview;
use App\Services\Academy\AcademyAccessService;
use App\Services\Academy\AcademyCertificateService;
use App\Services\Academy\AcademyEnrollmentService;
use App\Services\Academy\AcademyReviewService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class PublicAcademyController extends Controller
{
    use ResolvesPublicTenant;

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $perPage = max(1, min(48, (int) $request->query('per_page', 12)));
        $paginator = AcademyCourse::query()->where('tenant_id', $tid)->published()->orderBy('sort_order')->paginate($perPage);
        $items = collect($paginator->items())->map(fn (AcademyCourse $c) => $this->courseCard($c))->values();

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function show(Request $request, string $slug, AcademyAccessService $access, AcademyEnrollmentService $enrollments): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $course = AcademyCourse::query()->where('tenant_id', $tid)->where('slug', $slug)->published()
            ->with(['sections', 'lessons' => fn ($q) => $q->where('published', true)->orderBy('sort_order'), 'lessons.quiz', 'lessons.assignment'])
            ->first();
        if (! $course) {
            return response()->json(['message' => 'academy.course_not_found'], 404);
        }
        $user = $request->user('sanctum');
        $enrollment = $enrollments->activeEnrollment($course, $user);
        $curriculum = [];
        foreach ($course->sections->sortBy('sort_order') as $section) {
            $curriculum[] = [
                'id' => $section->id,
                'title' => $section->title,
                'description' => $section->description,
                'sort_order' => $section->sort_order,
                'lessons' => $course->lessons->where('section_id', $section->id)->values()->map(
                    fn (AcademyLesson $lesson) => $access->publicLessonPayload($lesson, $access->canViewLesson($lesson, $course, $user))
                ),
            ];
        }
        $orphan = $course->lessons->whereNull('section_id')->values()->map(
            fn (AcademyLesson $lesson) => $access->publicLessonPayload($lesson, $access->canViewLesson($lesson, $course, $user))
        );
        $reviews = AcademyReview::query()->where('course_id', $course->id)->where('status', AcademyReview::STATUS_APPROVED)
            ->orderByDesc('id')->limit(20)->get(['id', 'rating', 'body', 'author_name', 'created_at']);

        return response()->json(['data' => array_merge($this->courseCard($course), [
            'description' => $course->description,
            'instructor' => [
                'name' => $course->instructor_name,
                'bio' => $course->instructor_bio,
                'avatar_url' => $course->instructor_avatar_url,
            ],
            'certificate_enabled' => (bool) $course->certificate_enabled,
            'drip_enabled' => (bool) $course->drip_enabled,
            'enrolled' => (bool) $enrollment,
            'progress_percent' => $enrollment?->progress_percent ?? 0,
            'curriculum' => $curriculum,
            'lessons' => $orphan->values(),
            'reviews' => $reviews,
            'stats' => [
                'students_count' => (int) $course->students_count,
                'rating_avg' => $course->rating_avg,
                'rating_count' => (int) $course->rating_count,
                'lessons_count' => $course->lessons->count(),
                'duration_minutes' => $course->duration_minutes,
            ],
        ])]);
    }

    public function enrollFree(Request $request, string $slug, AcademyEnrollmentService $enrollments): \Illuminate\Http\JsonResponse
    {
        $user = $request->user('sanctum');
        if (! $user) {
            return response()->json(['message' => 'auth.unauthorized'], 401);
        }
        $course = AcademyCourse::query()->where('tenant_id', $this->publicTenantId($request))->where('slug', $slug)->published()->firstOrFail();

        return response()->json(['data' => $enrollments->enrollFree($course, $user)], 201);
    }

    public function storeReview(Request $request, string $slug, AcademyReviewService $reviews): \Illuminate\Http\JsonResponse
    {
        $course = AcademyCourse::query()->where('tenant_id', $this->publicTenantId($request))->where('slug', $slug)->published()->firstOrFail();
        $data = $request->validate([
            'rating' => 'required|integer|min:1|max:5',
            'body' => 'nullable|string|max:5000',
            'author_name' => 'nullable|string|max:120',
        ]);

        return response()->json(['data' => $reviews->submit($course, $request->user('sanctum'), (int) $data['rating'], $data['body'] ?? null, $data['author_name'] ?? null)], 201);
    }

    public function verifyCertificate(Request $request, string $serial, AcademyCertificateService $certs): \Illuminate\Http\JsonResponse
    {
        $cert = $certs->verifyBySerial($serial, $this->publicTenantId($request));
        if (! $cert) {
            return response()->json(['message' => 'academy.certificate_not_found'], 404);
        }

        return response()->json(['data' => [
            'serial' => $cert->serial,
            'student_name' => $cert->student_name,
            'course_title' => $cert->course_title,
            'issued_at' => optional($cert->issued_at)?->toIso8601String(),
            'valid' => true,
        ]]);
    }

    public function downloadCertificate(Request $request, string $serial, AcademyCertificateService $certs): \Symfony\Component\HttpFoundation\Response
    {
        $cert = $certs->verifyBySerial($serial, $this->publicTenantId($request));
        if (! $cert || ! $cert->pdf_path) {
            return response()->json(['message' => 'academy.certificate_not_found'], 404);
        }
        if (! Storage::disk('public')->exists($cert->pdf_path)) {
            $certs->renderPdf($cert);
            $cert->refresh();
        }
        $ext = str_ends_with((string) $cert->pdf_path, '.html') ? 'html' : 'pdf';

        return Storage::disk('public')->download($cert->pdf_path, $cert->serial.'.'.$ext);
    }

    private function courseCard(AcademyCourse $c): array
    {
        return [
            'id' => $c->id, 'slug' => $c->slug, 'title' => $c->title, 'description' => $c->description,
            'cover_url' => $c->cover_url, 'published' => (bool) $c->published, 'sort_order' => $c->sort_order,
            'is_free' => (bool) $c->is_free, 'price_minor' => $c->price_minor, 'level' => $c->level,
            'product_id' => $c->product_id, 'rating_avg' => $c->rating_avg, 'rating_count' => (int) $c->rating_count,
            'students_count' => (int) $c->students_count, 'duration_minutes' => $c->duration_minutes,
        ];
    }
}
