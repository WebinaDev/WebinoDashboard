<?php
namespace App\Http\Controllers\Api\V1;
use App\Http\Controllers\Controller;
use App\Models\AcademyAssignment;
use App\Models\AcademyCertificate;
use App\Models\AcademyCourse;
use App\Models\AcademyEnrollment;
use App\Models\AcademyLesson;
use App\Models\AcademyQuiz;
use App\Models\AcademyQuizAttempt;
use App\Services\Academy\AcademyAccessService;
use App\Services\Academy\AcademyAssignmentService;
use App\Services\Academy\AcademyEnrollmentService;
use App\Services\Academy\AcademyProgressService;
use App\Services\Academy\AcademyQuizService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class AcademyStudentController extends Controller
{
    public function myCourses(Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        return response()->json(AcademyEnrollment::query()->where('tenant_id', $user->tenant_id)->where('user_id', $user->id)
            ->with(['course' => fn ($q) => $q->select('id', 'slug', 'title', 'cover_url', 'level')])->orderByDesc('id')->paginate(20));
    }
    public function myCertificates(Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        return response()->json(AcademyCertificate::query()->where('tenant_id', $user->tenant_id)->where('user_id', $user->id)->orderByDesc('id')->paginate(20));
    }
    public function mySubmissions(Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        return response()->json(\App\Models\AcademyAssignmentSubmission::query()->where('tenant_id', $user->tenant_id)->where('user_id', $user->id)
            ->with(['assignment.lesson'])->orderByDesc('id')->paginate(20));
    }
    public function lessonContent(Request $request, int $course, int $lesson, AcademyEnrollmentService $enrollments, AcademyAccessService $access): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        $courseRow = AcademyCourse::query()->where('tenant_id', $user->tenant_id)->findOrFail($course);
        $lessonRow = AcademyLesson::query()->where('course_id', $courseRow->id)->with(['quiz.questions', 'assignment'])->findOrFail($lesson);
        if (! $access->canViewLesson($lessonRow, $courseRow, $user)) {
            return response()->json(['message' => 'academy.lesson_locked'], 403);
        }
        $payload = $access->publicLessonPayload($lessonRow, true);
        if ($lessonRow->type === AcademyLesson::TYPE_QUIZ && $lessonRow->quiz) {
            $payload['quiz'] = [
                'id' => $lessonRow->quiz->id, 'pass_mark' => $lessonRow->quiz->pass_mark,
                'max_attempts' => $lessonRow->quiz->max_attempts, 'time_limit_seconds' => $lessonRow->quiz->time_limit_seconds,
                'questions' => $lessonRow->quiz->questions->map(fn ($q) => [
                    'id' => $q->id, 'type' => $q->type, 'prompt' => $q->prompt, 'options' => $q->options, 'points' => $q->points,
                ]),
            ];
        }
        if ($lessonRow->type === AcademyLesson::TYPE_ASSIGNMENT && $lessonRow->assignment) {
            $payload['assignment'] = $lessonRow->assignment->only(['id', 'instructions', 'max_score', 'allow_file', 'allow_text', 'due_at']);
        }
        $payload['enrollment'] = $enrollments->activeEnrollment($courseRow, $user);
        return response()->json(['data' => $payload]);
    }
    public function downloadLessonFile(Request $request, int $course, int $lesson, AcademyAccessService $access): \Symfony\Component\HttpFoundation\Response
    {
        $user = $request->user();
        $courseRow = AcademyCourse::query()->where('tenant_id', $user->tenant_id)->findOrFail($course);
        $lessonRow = AcademyLesson::query()->where('course_id', $courseRow->id)->findOrFail($lesson);
        if (! $access->canViewLesson($lessonRow, $courseRow, $user) || ! $lessonRow->file_path) abort(403);
        if (! Storage::disk('public')->exists($lessonRow->file_path)) abort(404);
        return Storage::disk('public')->download($lessonRow->file_path, $lessonRow->file_name ?: 'file');
    }
    public function markProgress(Request $request, int $course, int $lesson, AcademyEnrollmentService $enrollments, AcademyProgressService $progress): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        $courseRow = AcademyCourse::query()->where('tenant_id', $user->tenant_id)->findOrFail($course);
        $lessonRow = AcademyLesson::query()->where('course_id', $courseRow->id)->findOrFail($lesson);
        $enrollment = $enrollments->activeEnrollment($courseRow, $user);
        if (! $enrollment) return response()->json(['message' => 'academy.not_enrolled'], 403);
        $data = $request->validate(['percent' => 'nullable|integer|min:0|max:100', 'complete' => 'boolean']);
        $row = $progress->markLesson($enrollment, $lessonRow, (int) ($data['percent'] ?? 100), (bool) ($data['complete'] ?? true));
        return response()->json(['data' => ['progress' => $row, 'enrollment' => $enrollment->fresh()]]);
    }
    public function startQuiz(Request $request, int $quiz, AcademyQuizService $quizzes): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        $quizRow = AcademyQuiz::query()->whereHas('lesson.course', fn ($q) => $q->where('tenant_id', $user->tenant_id))->findOrFail($quiz);
        return response()->json(['data' => $quizzes->startAttempt($quizRow, $user)], 201);
    }
    public function submitQuiz(Request $request, int $attempt, AcademyQuizService $quizzes): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        $row = AcademyQuizAttempt::query()->where('user_id', $user->id)->findOrFail($attempt);
        AcademyQuiz::query()->whereHas('lesson.course', fn ($q) => $q->where('tenant_id', $user->tenant_id))->findOrFail($row->quiz_id);
        $data = $request->validate(['answers' => 'required|array']);
        return response()->json(['data' => $quizzes->submitAttempt($row, $data['answers'])]);
    }
    public function submitAssignment(Request $request, int $assignment, AcademyAssignmentService $assignments): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        $row = AcademyAssignment::query()->whereHas('lesson.course', fn ($q) => $q->where('tenant_id', $user->tenant_id))->findOrFail($assignment);
        $data = $request->validate(['body' => 'nullable|string|max:20000', 'file' => 'nullable|file|max:51200']);
        return response()->json(['data' => $assignments->submit($row, $user, (int) $user->tenant_id, $data['body'] ?? null, $request->file('file'))], 201);
    }
}
