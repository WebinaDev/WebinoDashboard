<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AcademyAssignment;
use App\Models\AcademyCourse;
use App\Models\AcademyLesson;
use App\Models\AcademyQuiz;
use App\Models\AcademyQuizQuestion;
use App\Models\AcademySection;
use App\Services\Academy\AcademyCoursePresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AcademyCourseController extends Controller
{
    public function index(Request $request, AcademyCoursePresenter $presenter): JsonResponse
    {
        $rows = AcademyCourse::query()->where('tenant_id', $request->user()->tenant_id)
            ->with(['product'])
            ->withCount(['lessons', 'enrollments', 'sections'])->orderBy('sort_order')->paginate(20);
        $rows->setCollection($rows->getCollection()->map(fn (AcademyCourse $c) => $presenter->enrich($c)));

        return response()->json($rows);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatedCourse($request);
        $row = AcademyCourse::query()->create([
            'tenant_id' => $request->user()->tenant_id,
            'slug' => $data['slug'] ?? Str::slug($data['title']),
            ...$data,
        ]);

        return response()->json(['data' => $row], 201);
    }

    public function show(Request $request, int $course): JsonResponse
    {
        $row = AcademyCourse::query()->where('tenant_id', $request->user()->tenant_id)
            ->with(['sections.lessons.quiz.questions', 'sections.lessons.assignment', 'lessons.quiz.questions', 'lessons.assignment'])
            ->findOrFail($course);

        return response()->json(['data' => $row]);
    }

    public function update(Request $request, int $course): JsonResponse
    {
        $row = $this->course($request, $course);
        $row->update($this->validatedCourse($request, false));

        return response()->json(['data' => $row->fresh(['sections', 'lessons'])]);
    }

    public function destroy(Request $request, int $course): JsonResponse
    {
        AcademyCourse::query()->where('tenant_id', $request->user()->tenant_id)->where('id', $course)->delete();

        return response()->json(null, 204);
    }

    public function storeSection(Request $request, int $course): JsonResponse
    {
        $parent = $this->course($request, $course);
        $data = $request->validate(['title' => 'required|string|max:255', 'description' => 'nullable|string', 'sort_order' => 'integer']);

        return response()->json(['data' => $parent->sections()->create($data)], 201);
    }

    public function updateSection(Request $request, int $course, int $section): JsonResponse
    {
        $parent = $this->course($request, $course);
        $row = AcademySection::query()->where('course_id', $parent->id)->findOrFail($section);
        $row->update($request->validate(['title' => 'sometimes|string|max:255', 'description' => 'nullable|string', 'sort_order' => 'integer']));

        return response()->json(['data' => $row]);
    }

    public function destroySection(Request $request, int $course, int $section): JsonResponse
    {
        $parent = $this->course($request, $course);
        AcademySection::query()->where('course_id', $parent->id)->where('id', $section)->delete();

        return response()->json(null, 204);
    }

    public function storeLesson(Request $request, int $course): JsonResponse
    {
        $parent = $this->course($request, $course);
        $data = $this->validatedLesson($request);
        $lesson = $parent->lessons()->create(['slug' => $data['slug'] ?? Str::slug($data['title']), ...$data]);
        $this->syncLessonExtras($request, $lesson);

        return response()->json(['data' => $lesson->fresh(['quiz.questions', 'assignment'])], 201);
    }

    public function updateLesson(Request $request, int $course, int $lesson): JsonResponse
    {
        $parent = $this->course($request, $course);
        $row = AcademyLesson::query()->where('course_id', $parent->id)->findOrFail($lesson);
        $row->update($this->validatedLesson($request, false));
        $this->syncLessonExtras($request, $row);

        return response()->json(['data' => $row->fresh(['quiz.questions', 'assignment'])]);
    }

    public function destroyLesson(Request $request, int $course, int $lesson): JsonResponse
    {
        $parent = $this->course($request, $course);
        AcademyLesson::query()->where('course_id', $parent->id)->where('id', $lesson)->delete();

        return response()->json(null, 204);
    }

    public function uploadLessonFile(Request $request, int $course, int $lesson): JsonResponse
    {
        $parent = $this->course($request, $course);
        $row = AcademyLesson::query()->where('course_id', $parent->id)->findOrFail($lesson);
        $request->validate(['file' => 'required|file|max:51200']);
        $file = $request->file('file');
        $path = $file->store('academy/lessons/'.$parent->tenant_id, 'public');
        $row->update([
            'file_path' => $path,
            'file_name' => $file->getClientOriginalName(),
            'type' => $row->type === AcademyLesson::TYPE_TEXT ? AcademyLesson::TYPE_FILE : $row->type,
        ]);

        return response()->json(['data' => $row->fresh()]);
    }

    private function course(Request $request, int $course): AcademyCourse
    {
        return AcademyCourse::query()->where('tenant_id', $request->user()->tenant_id)->findOrFail($course);
    }

    private function validatedCourse(Request $request, bool $creating = true): array
    {
        return $request->validate([
            'title' => ($creating ? 'required' : 'sometimes').'|string|max:255',
            'slug' => 'nullable|string|max:120', 'description' => 'nullable|string', 'cover_url' => 'nullable|string|max:500',
            'published' => 'boolean', 'sort_order' => 'integer', 'product_id' => 'nullable|integer', 'is_free' => 'boolean',
            'price_minor' => 'nullable|integer|min:0', 'level' => 'nullable|string|max:64', 'duration_minutes' => 'nullable|integer|min:0',
            'instructor_name' => 'nullable|string|max:255', 'instructor_bio' => 'nullable|string', 'instructor_avatar_url' => 'nullable|string|max:500',
            'certificate_enabled' => 'boolean', 'certificate_title' => 'nullable|string|max:255', 'drip_enabled' => 'boolean', 'meta' => 'nullable|array',
        ]);
    }

    private function validatedLesson(Request $request, bool $creating = true): array
    {
        return $request->validate([
            'title' => ($creating ? 'required' : 'sometimes').'|string|max:255', 'slug' => 'nullable|string|max:120',
            'section_id' => 'nullable|integer', 'type' => ['nullable', Rule::in(AcademyLesson::TYPES)],
            'content' => 'nullable|string', 'video_url' => 'nullable|string|max:500', 'audio_url' => 'nullable|string|max:500',
            'duration_seconds' => 'nullable|integer|min:0', 'sort_order' => 'integer', 'published' => 'boolean',
            'is_preview' => 'boolean', 'drip_days' => 'nullable|integer|min:0', 'requires_pass_lesson_id' => 'nullable|integer', 'meta' => 'nullable|array',
        ]);
    }

    private function syncLessonExtras(Request $request, AcademyLesson $lesson): void
    {
        if ($request->has('quiz') && is_array($request->input('quiz'))) {
            $quizData = $request->validate([
                'quiz.pass_mark' => 'nullable|integer|min:1|max:100',
                'quiz.max_attempts' => 'nullable|integer|min:1',
                'quiz.time_limit_seconds' => 'nullable|integer|min:30',
                'quiz.shuffle_questions' => 'boolean',
                'quiz.questions' => 'nullable|array',
                'quiz.questions.*.type' => ['required_with:quiz.questions', Rule::in([
                    AcademyQuizQuestion::TYPE_SINGLE, AcademyQuizQuestion::TYPE_MULTI, AcademyQuizQuestion::TYPE_BOOLEAN, AcademyQuizQuestion::TYPE_SHORT,
                ])],
                'quiz.questions.*.prompt' => 'required_with:quiz.questions|string',
                'quiz.questions.*.options' => 'nullable|array',
                'quiz.questions.*.correct' => 'nullable|array',
                'quiz.questions.*.points' => 'nullable|integer|min:1',
            ])['quiz'];
            $quiz = AcademyQuiz::query()->updateOrCreate(['lesson_id' => $lesson->id], [
                'pass_mark' => $quizData['pass_mark'] ?? 70,
                'max_attempts' => $quizData['max_attempts'] ?? null,
                'time_limit_seconds' => $quizData['time_limit_seconds'] ?? null,
                'shuffle_questions' => (bool) ($quizData['shuffle_questions'] ?? false),
            ]);
            if (array_key_exists('questions', $quizData)) {
                $quiz->questions()->delete();
                foreach ($quizData['questions'] ?? [] as $i => $q) {
                    $quiz->questions()->create([
                        'type' => $q['type'], 'prompt' => $q['prompt'], 'options' => $q['options'] ?? null,
                        'correct' => $q['correct'] ?? null, 'points' => $q['points'] ?? 1, 'sort_order' => $i,
                    ]);
                }
            }
            $lesson->update(['type' => AcademyLesson::TYPE_QUIZ]);
        }
        if ($request->has('assignment') && is_array($request->input('assignment'))) {
            $a = $request->validate([
                'assignment.instructions' => 'nullable|string', 'assignment.max_score' => 'nullable|integer|min:1',
                'assignment.allow_file' => 'boolean', 'assignment.allow_text' => 'boolean', 'assignment.due_at' => 'nullable|date',
            ])['assignment'];
            AcademyAssignment::query()->updateOrCreate(['lesson_id' => $lesson->id], [
                'instructions' => $a['instructions'] ?? null, 'max_score' => $a['max_score'] ?? 100,
                'allow_file' => $a['allow_file'] ?? true, 'allow_text' => $a['allow_text'] ?? true, 'due_at' => $a['due_at'] ?? null,
            ]);
            $lesson->update(['type' => AcademyLesson::TYPE_ASSIGNMENT]);
        }
    }
}
