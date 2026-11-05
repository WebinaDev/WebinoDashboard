<?php
namespace App\Http\Controllers\Api\V1;
use App\Http\Controllers\Controller;
use App\Models\AcademyAssignmentSubmission;
use App\Models\AcademyCertificate;
use App\Models\AcademyEnrollment;
use App\Models\AcademyReview;
use App\Services\Academy\AcademyAssignmentService;
use App\Services\Academy\AcademyReviewService;
use Illuminate\Http\Request;

class AcademyAdminExtrasController extends Controller
{
    public function enrollments(Request $request): \Illuminate\Http\JsonResponse
    {
        $q = AcademyEnrollment::query()->where('tenant_id', $request->user()->tenant_id)->with(['course:id,title,slug', 'user:id,name,email']);
        if ($request->filled('course_id')) $q->where('course_id', (int) $request->query('course_id'));
        return response()->json($q->orderByDesc('id')->paginate(30));
    }
    public function gradingQueue(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json(AcademyAssignmentSubmission::query()->where('tenant_id', $request->user()->tenant_id)
            ->where('status', AcademyAssignmentSubmission::STATUS_SUBMITTED)
            ->with(['assignment.lesson', 'user:id,name,email'])->orderBy('id')->paginate(30));
    }
    public function gradeSubmission(Request $request, int $submission, AcademyAssignmentService $assignments): \Illuminate\Http\JsonResponse
    {
        $row = AcademyAssignmentSubmission::query()->where('tenant_id', $request->user()->tenant_id)->findOrFail($submission);
        $data = $request->validate(['score' => 'required|integer|min:0', 'feedback' => 'nullable|string|max:10000', 'status' => 'nullable|in:graded,returned']);
        return response()->json(['data' => $assignments->grade($row->load('assignment'), $request->user(), (int) $data['score'], $data['feedback'] ?? null, $data['status'] ?? AcademyAssignmentSubmission::STATUS_GRADED)]);
    }
    public function reviews(Request $request): \Illuminate\Http\JsonResponse
    {
        $q = AcademyReview::query()->where('tenant_id', $request->user()->tenant_id)->with('course:id,title,slug');
        if ($request->filled('status')) $q->where('status', $request->query('status'));
        return response()->json($q->orderByDesc('id')->paginate(30));
    }
    public function moderateReview(Request $request, int $review, AcademyReviewService $reviews): \Illuminate\Http\JsonResponse
    {
        $row = AcademyReview::query()->where('tenant_id', $request->user()->tenant_id)->findOrFail($review);
        $data = $request->validate(['status' => 'required|in:pending,approved,spam,trash', 'admin_reply' => 'nullable|string|max:5000']);
        return response()->json(['data' => $reviews->moderate($row, $data['status'], $data['admin_reply'] ?? null)]);
    }
    public function certificates(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json(AcademyCertificate::query()->where('tenant_id', $request->user()->tenant_id)->orderByDesc('id')->paginate(30));
    }
}
