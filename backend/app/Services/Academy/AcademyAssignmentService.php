<?php
namespace App\Services\Academy;
use App\Models\AcademyAssignment;
use App\Models\AcademyAssignmentSubmission;
use App\Models\User;
use Illuminate\Http\UploadedFile;
final class AcademyAssignmentService
{
    public function submit(AcademyAssignment $assignment, User $user, int $tenantId, ?string $body, ?UploadedFile $file): AcademyAssignmentSubmission
    {
        if (! $assignment->allow_text && $body) abort(422, 'academy.assignment_text_disabled');
        if (! $assignment->allow_file && $file) abort(422, 'academy.assignment_file_disabled');
        if (! $body && ! $file) abort(422, 'academy.assignment_empty');
        $row = AcademyAssignmentSubmission::query()->firstOrNew(['assignment_id' => $assignment->id, 'user_id' => $user->id]);
        $row->tenant_id = $tenantId; $row->body = $body; $row->status = AcademyAssignmentSubmission::STATUS_SUBMITTED;
        $row->score = null; $row->feedback = null; $row->graded_by = null; $row->graded_at = null;
        if ($file) {
            $row->file_path = $file->store('academy/assignments/'.$tenantId, 'public');
            $row->file_name = $file->getClientOriginalName();
        }
        $row->save();
        return $row->fresh();
    }
    public function grade(AcademyAssignmentSubmission $submission, User $grader, int $score, ?string $feedback, string $status = AcademyAssignmentSubmission::STATUS_GRADED): AcademyAssignmentSubmission
    {
        $max = (int) ($submission->assignment?->max_score ?? 100);
        $submission->update([
            'score' => max(0, min($max, $score)), 'feedback' => $feedback, 'status' => $status,
            'graded_by' => $grader->id, 'graded_at' => now(),
        ]);
        return $submission->fresh('assignment');
    }
}
