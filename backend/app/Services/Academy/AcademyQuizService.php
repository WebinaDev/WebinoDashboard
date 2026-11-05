<?php
namespace App\Services\Academy;
use App\Models\AcademyQuiz;
use App\Models\AcademyQuizAttempt;
use App\Models\AcademyQuizQuestion;
use App\Models\User;
use Illuminate\Support\Facades\DB;
final class AcademyQuizService
{
    public function startAttempt(AcademyQuiz $quiz, User $user): AcademyQuizAttempt
    {
        if ($quiz->max_attempts !== null) {
            $used = AcademyQuizAttempt::query()->where('quiz_id', $quiz->id)->where('user_id', $user->id)->count();
            if ($used >= (int) $quiz->max_attempts) {
                abort(422, 'academy.quiz_attempts_exhausted');
            }
        }
        return AcademyQuizAttempt::query()->create([
            'quiz_id' => $quiz->id, 'user_id' => $user->id, 'score' => 0, 'max_score' => 0,
            'passed' => false, 'answers' => [], 'started_at' => now(),
        ]);
    }
    public function submitAttempt(AcademyQuizAttempt $attempt, array $answers): AcademyQuizAttempt
    {
        return DB::transaction(function () use ($attempt, $answers) {
            $quiz = AcademyQuiz::query()->with('questions')->findOrFail($attempt->quiz_id);
            $score = 0; $max = 0; $normalized = [];
            foreach ($quiz->questions as $q) {
                $max += (int) $q->points;
                $given = $answers[$q->id] ?? $answers[(string) $q->id] ?? null;
                $normalized[$q->id] = $given;
                if ($this->isCorrect($q, $given)) {
                    $score += (int) $q->points;
                }
            }
            $pct = $max > 0 ? (int) round(($score / $max) * 100) : 0;
            $attempt->update([
                'score' => $score, 'max_score' => $max, 'passed' => $pct >= (int) $quiz->pass_mark,
                'answers' => $normalized, 'finished_at' => now(),
            ]);
            return $attempt->fresh();
        });
    }
    private function isCorrect(AcademyQuizQuestion $q, mixed $given): bool
    {
        $correct = $q->correct ?? [];
        return match ($q->type) {
            AcademyQuizQuestion::TYPE_BOOLEAN => ((bool) $given) === ((bool) ($correct['value'] ?? $correct[0] ?? false)),
            AcademyQuizQuestion::TYPE_SHORT => mb_strtolower(trim((string) $given)) === mb_strtolower(trim((string) ($correct['value'] ?? $correct[0] ?? ''))),
            AcademyQuizQuestion::TYPE_MULTI => $this->sameSet((array) $given, (array) ($correct['values'] ?? $correct)),
            default => (string) $given === (string) ($correct['value'] ?? $correct[0] ?? ''),
        };
    }
    private function sameSet(array $a, array $b): bool
    {
        $a = array_map('strval', $a); $b = array_map('strval', $b); sort($a); sort($b); return $a === $b;
    }
}
