<?php

namespace Tests\Feature;

use App\Models\AcademyAssignment;
use App\Models\AcademyCourse;
use App\Models\AcademyEnrollment;
use App\Models\AcademyLesson;
use App\Models\AcademyQuiz;
use App\Models\AcademyQuizQuestion;
use App\Models\AcademyReview;
use App\Models\DashboardModule;
use App\Models\MediaAsset;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\TenantModule;
use App\Models\User;
use App\Services\Academy\AcademyEnrollmentService;
use App\Services\Orders\OrderStatusService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AcademyLmsFullTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $student;

    protected function setUp(): void
    {
        parent::setUp();
        $tenant = $this->createTenant(['slug' => 'acad-lms', 'domain' => 'acad-lms.test']);
        DashboardModule::query()->create([
            'slug' => 'academy',
            'requires_license' => false,
            'git_repo' => null,
            'default_version' => '0.1.0',
        ]);
        TenantModule::query()->create([
            'tenant_id' => $tenant->id,
            'module_slug' => 'academy',
            'enabled' => true,
            'licensed' => true,
            'installed_version' => '0.1.0',
        ]);
        $this->enableSubmodule($tenant->id, 'academy', 'courses');

        $this->admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);
        $this->student = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'customer',
        ]);
    }

    public function test_public_lists_courses_as_array_under_data(): void
    {
        AcademyCourse::query()->create([
            'tenant_id' => $this->admin->tenant_id,
            'slug' => 'spoken',
            'title' => 'مکالمه',
            'published' => true,
            'sort_order' => 1,
            'is_free' => true,
        ]);

        $this->getJson('/api/v1/public/academy', [
            'X-Tenant-Domain' => 'acad-lms.test',
        ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.0.slug', 'spoken')
            ->assertJsonPath('data.0.cover_url', null)
            ->assertJsonPath('data.0.price_minor', 0)
            ->assertJsonPath('data.0.sale_price_minor', null)
            ->assertJsonPath('data.0.regular', true)
            ->assertJsonPath('data.0.on_sale', false)
            ->assertJsonPath('data.0.level', null)
            ->assertJsonPath('data.0.level_label', null)
            ->assertJsonPath('data.0.lessons_count', 0)
            ->assertJsonPath('data.0.currency_display.currency', 'IRT');
    }

    public function test_admin_can_build_curriculum_with_quiz_and_assignment(): void
    {
        $course = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/v1/academy/courses', [
                'title' => 'آیلتس',
                'slug' => 'ielts',
                'published' => true,
                'is_free' => true,
            ])
            ->assertCreated()
            ->json('data');

        $section = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/v1/academy/courses/'.$course['id'].'/sections', [
                'title' => 'هفته ۱',
                'sort_order' => 1,
            ])
            ->assertCreated()
            ->json('data');

        $lesson = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/v1/academy/courses/'.$course['id'].'/lessons', [
                'title' => 'آزمون نمونه',
                'slug' => 'quiz-1',
                'section_id' => $section['id'],
                'type' => 'quiz',
                'published' => true,
                'is_preview' => false,
                'quiz' => [
                    'pass_mark' => 50,
                    'max_attempts' => 3,
                    'questions' => [
                        [
                            'type' => 'single',
                            'prompt' => '۲+۲؟',
                            'options' => ['a' => '۳', 'b' => '۴'],
                            'correct' => ['value' => 'b'],
                            'points' => 1,
                        ],
                    ],
                ],
            ])
            ->assertCreated()
            ->json('data');

        $this->assertSame('quiz', $lesson['type']);
        $this->assertNotEmpty($lesson['quiz']['questions'] ?? null);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/v1/academy/courses/'.$course['id'].'/lessons', [
                'title' => 'تکلیف',
                'slug' => 'hw-1',
                'section_id' => $section['id'],
                'type' => 'assignment',
                'published' => true,
                'assignment' => [
                    'instructions' => 'یک پاراگراف بنویسید',
                    'max_score' => 20,
                    'allow_file' => true,
                    'allow_text' => true,
                ],
            ])
            ->assertCreated();
    }

    public function test_free_enroll_progress_certificate_and_locked_lessons(): void
    {
        Storage::fake('public');
        $course = AcademyCourse::query()->create([
            'tenant_id' => $this->admin->tenant_id,
            'slug' => 'free-course',
            'title' => 'دوره رایگان',
            'published' => true,
            'is_free' => true,
            'certificate_enabled' => true,
        ]);
        $preview = AcademyLesson::query()->create([
            'course_id' => $course->id,
            'slug' => 'intro',
            'title' => 'معرفی',
            'type' => 'text',
            'content' => 'پیش‌نمایش',
            'published' => true,
            'is_preview' => true,
            'sort_order' => 1,
        ]);
        $locked = AcademyLesson::query()->create([
            'course_id' => $course->id,
            'slug' => 'main',
            'title' => 'درس اصلی',
            'type' => 'text',
            'content' => 'محتوای قفل',
            'published' => true,
            'is_preview' => false,
            'sort_order' => 2,
        ]);

        $guest = $this->getJson('/api/v1/public/academy/free-course', [
            'X-Tenant-Domain' => 'acad-lms.test',
        ])->assertOk();
        $lessons = collect($guest->json('data.lessons'));
        $this->assertFalse((bool) $lessons->firstWhere('slug', 'intro')['locked']);
        $this->assertTrue((bool) $lessons->firstWhere('slug', 'main')['locked']);

        $this->actingAs($this->student, 'sanctum')
            ->postJson('/api/v1/public/academy/free-course/enroll', [], [
                'X-Tenant-Domain' => 'acad-lms.test',
            ])
            ->assertCreated();

        $this->actingAs($this->student, 'sanctum')
            ->postJson('/api/v1/account/academy/courses/'.$course->id.'/lessons/'.$locked->id.'/progress', [
                'complete' => true,
            ])
            ->assertOk();

        $this->actingAs($this->student, 'sanctum')
            ->postJson('/api/v1/account/academy/courses/'.$course->id.'/lessons/'.$preview->id.'/progress', [
                'complete' => true,
            ])
            ->assertOk();

        $enrollment = AcademyEnrollment::query()->where('course_id', $course->id)->where('user_id', $this->student->id)->first();
        $this->assertNotNull($enrollment);
        $this->assertSame(100, (int) $enrollment->fresh()->progress_percent);
        $this->assertSame(AcademyEnrollment::STATUS_COMPLETED, $enrollment->fresh()->status);
        $this->assertNotNull($enrollment->fresh()->certificate);

        $this->getJson('/api/v1/public/academy/certificates/'.$enrollment->fresh()->certificate->serial, [
            'X-Tenant-Domain' => 'acad-lms.test',
        ])
            ->assertOk()
            ->assertJsonPath('data.valid', true);
    }

    public function test_paid_order_enrolls_via_product_link(): void
    {
        $product = Product::query()->create([
            'tenant_id' => $this->admin->tenant_id,
            'name' => 'Course product',
            'slug' => 'course-product',
            'status' => 'publish',
            'price_minor' => 100000,
            'stock' => 10,
            'manage_stock' => false,
        ]);
        $course = AcademyCourse::query()->create([
            'tenant_id' => $this->admin->tenant_id,
            'slug' => 'paid-course',
            'title' => 'دوره پولی',
            'published' => true,
            'is_free' => false,
            'price_minor' => 100000,
            'product_id' => $product->id,
            'certificate_enabled' => false,
        ]);

        $order = Order::query()->create([
            'tenant_id' => $this->admin->tenant_id,
            'user_id' => $this->student->id,
            'number' => 'A-100',
            'status' => 'awaiting_gateway',
            'currency' => 'IRR',
            'total_minor' => 100000,
            'customer_name' => 'Student',
            'customer_email' => $this->student->email,
        ]);
        OrderItem::query()->create([
            'order_id' => $order->id,
            'product_id' => $product->id,
            'product_name' => $product->name,
            'quantity' => 1,
            'unit_price_minor' => 100000,
            'purchase_type' => 'cash',
        ]);

        $ok = app(OrderStatusService::class)->apply($order, 'paid', ['amount_paid_minor' => 100000]);
        $this->assertTrue($ok);

        $this->assertTrue(
            AcademyEnrollment::query()
                ->where('course_id', $course->id)
                ->where('user_id', $this->student->id)
                ->exists()
        );
    }

    public function test_quiz_auto_grades_and_assignment_grading_queue(): void
    {
        Storage::fake('public');
        $course = AcademyCourse::query()->create([
            'tenant_id' => $this->admin->tenant_id,
            'slug' => 'quiz-course',
            'title' => 'کوییز',
            'published' => true,
            'is_free' => true,
        ]);
        app(AcademyEnrollmentService::class)->enrollFree($course, $this->student);

        $lesson = AcademyLesson::query()->create([
            'course_id' => $course->id,
            'slug' => 'q',
            'title' => 'Q',
            'type' => 'quiz',
            'published' => true,
        ]);
        $quiz = AcademyQuiz::query()->create([
            'lesson_id' => $lesson->id,
            'pass_mark' => 50,
            'max_attempts' => 2,
        ]);
        $question = AcademyQuizQuestion::query()->create([
            'quiz_id' => $quiz->id,
            'type' => 'single',
            'prompt' => '؟',
            'options' => ['a' => '1', 'b' => '2'],
            'correct' => ['value' => 'b'],
            'points' => 1,
            'sort_order' => 0,
        ]);

        $attempt = $this->actingAs($this->student, 'sanctum')
            ->postJson('/api/v1/account/academy/quizzes/'.$quiz->id.'/attempts')
            ->assertCreated()
            ->json('data');

        $this->actingAs($this->student, 'sanctum')
            ->postJson('/api/v1/account/academy/quiz-attempts/'.$attempt['id'].'/submit', [
                'answers' => [$question->id => 'b'],
            ])
            ->assertOk()
            ->assertJsonPath('data.passed', true);

        $hwLesson = AcademyLesson::query()->create([
            'course_id' => $course->id,
            'slug' => 'hw',
            'title' => 'HW',
            'type' => 'assignment',
            'published' => true,
        ]);
        $assignment = AcademyAssignment::query()->create([
            'lesson_id' => $hwLesson->id,
            'instructions' => 'بنویس',
            'max_score' => 10,
            'allow_file' => true,
            'allow_text' => true,
        ]);

        $this->actingAs($this->student, 'sanctum')
            ->postJson('/api/v1/account/academy/assignments/'.$assignment->id.'/submissions', [
                'body' => 'پاسخ من',
            ])
            ->assertCreated();

        $queue = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/v1/academy/grading-queue')
            ->assertOk();
        $payload = $queue->json('data');
        $items = is_array($payload) && array_is_list($payload) ? $payload : ($payload['data'] ?? []);
        $this->assertGreaterThanOrEqual(1, count($items));
    }

    public function test_review_moderation_updates_course_rating(): void
    {
        $course = AcademyCourse::query()->create([
            'tenant_id' => $this->admin->tenant_id,
            'slug' => 'rated',
            'title' => 'امتیازی',
            'published' => true,
            'is_free' => true,
        ]);

        $created = $this->postJson('/api/v1/public/academy/rated/reviews', [
            'rating' => 5,
            'body' => 'عالی بود',
            'author_name' => 'مینا',
        ], [
            'X-Tenant-Domain' => 'acad-lms.test',
        ])->assertCreated()->json('data');

        $this->actingAs($this->admin, 'sanctum')
            ->patchJson('/api/v1/academy/reviews/'.$created['id'], [
                'status' => AcademyReview::STATUS_APPROVED,
            ])
            ->assertOk();

        $this->assertSame(5.0, (float) $course->fresh()->rating_avg);
        $this->assertSame(1, (int) $course->fresh()->rating_count);
    }

    public function test_list_rows_include_absolute_cover_price_level_and_currency(): void
    {
        $tid = $this->admin->tenant_id;
        $media = MediaAsset::query()->create([
            'tenant_id' => $tid,
            'path' => 'academy/covers/spoken.jpg',
            'disk' => 'local',
            'mime' => 'image/jpeg',
        ]);
        $product = Product::query()->create([
            'tenant_id' => $tid,
            'name' => 'آیلتس محصول',
            'slug' => 'ielts-product',
            'status' => 'publish',
            'price_minor' => 2000000,
            'sale_price_minor' => 1500000,
            'cover_image_url' => '/storage/products/ielts-fallback.jpg',
            'stock' => 10,
            'manage_stock' => false,
        ]);

        $withMedia = AcademyCourse::query()->create([
            'tenant_id' => $tid,
            'slug' => 'spoken-media',
            'title' => 'مکالمه با کاور',
            'published' => true,
            'sort_order' => 1,
            'is_free' => true,
            'cover_url' => (string) $media->id,
            'level' => 'beginner',
            'duration_minutes' => 90,
            'students_count' => 7,
        ]);
        AcademyLesson::query()->create([
            'course_id' => $withMedia->id, 'slug' => 'one', 'title' => '۱',
            'type' => 'text', 'published' => true, 'sort_order' => 1,
        ]);
        AcademyLesson::query()->create([
            'course_id' => $withMedia->id, 'slug' => 'two', 'title' => '۲',
            'type' => 'text', 'published' => true, 'sort_order' => 2,
        ]);
        AcademyLesson::query()->create([
            'course_id' => $withMedia->id, 'slug' => 'draft', 'title' => 'پیش‌نویس',
            'type' => 'text', 'published' => false, 'sort_order' => 3,
        ]);

        AcademyCourse::query()->create([
            'tenant_id' => $tid,
            'slug' => 'ielts-paid',
            'title' => 'آیلتس',
            'published' => true,
            'sort_order' => 2,
            'is_free' => false,
            'cover_url' => 'academy/covers/ielts.jpg',
            'level' => 'advanced',
            'product_id' => $product->id,
            // price comes from the linked product
        ]);

        AcademyCourse::query()->create([
            'tenant_id' => $tid,
            'slug' => 'cdn-cover',
            'title' => 'کاور مطلق',
            'published' => true,
            'sort_order' => 3,
            'is_free' => false,
            'price_minor' => 800000,
            'cover_url' => 'https://cdn.example.com/courses/toefl.jpg',
            'level' => 'متوسط',
        ]);

        $public = $this->getJson('/api/v1/public/academy?per_page=12', [
            'X-Tenant-Domain' => 'acad-lms.test',
        ])->assertOk();
        $rows = collect($public->json('data'));
        $this->assertCount(3, $rows);

        $spoken = $rows->firstWhere('slug', 'spoken-media');
        $this->assertSame('https://acad-lms.test/storage/academy/covers/spoken.jpg', $spoken['cover_url']);
        $this->assertSame(0, $spoken['price_minor']);
        $this->assertNull($spoken['sale_price_minor']);
        $this->assertTrue($spoken['regular']);
        $this->assertFalse($spoken['on_sale']);
        $this->assertSame('beginner', $spoken['level']);
        $this->assertSame('مقدماتی', $spoken['level_label']);
        $this->assertSame(90, $spoken['duration_minutes']);
        $this->assertSame(7, $spoken['students_count']);
        $this->assertSame(2, $spoken['lessons_count']);
        $this->assertSame('IRT', $spoken['currency_display']['currency']);
        $this->assertSame('rial-1', $spoken['currency_display']['currency_symbol']);
        $this->assertArrayHasKey('thousand_separator', $spoken['currency_display']);

        $ielts = $rows->firstWhere('slug', 'ielts-paid');
        $this->assertSame('https://acad-lms.test/storage/academy/covers/ielts.jpg', $ielts['cover_url']);
        $this->assertSame(2000000, $ielts['price_minor']);
        $this->assertSame(1500000, $ielts['sale_price_minor']);
        $this->assertFalse($ielts['regular']);
        $this->assertTrue($ielts['on_sale']);
        $this->assertSame('advanced', $ielts['level']);
        $this->assertSame('پیشرفته', $ielts['level_label']);

        $cdn = $rows->firstWhere('slug', 'cdn-cover');
        $this->assertSame('https://cdn.example.com/courses/toefl.jpg', $cdn['cover_url']);
        $this->assertSame(800000, $cdn['price_minor']);
        $this->assertNull($cdn['sale_price_minor']);
        $this->assertTrue($cdn['regular']);
        $this->assertFalse($cdn['on_sale']);
        $this->assertSame('متوسط', $cdn['level']);
        $this->assertSame('متوسط', $cdn['level_label']);

        $admin = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/v1/academy/courses')
            ->assertOk();
        $adminRows = collect($admin->json('data'));
        if ($adminRows->isEmpty() || ! isset($adminRows[0]['slug'])) {
            $adminRows = collect($admin->json('data.data'));
        }
        $adminSpoken = $adminRows->firstWhere('slug', 'spoken-media');
        $this->assertNotNull($adminSpoken);
        $this->assertSame('https://acad-lms.test/storage/academy/covers/spoken.jpg', $adminSpoken['cover_url']);
        $this->assertSame('مقدماتی', $adminSpoken['level_label']);
        $this->assertSame(3, $adminSpoken['lessons_count']);
        $this->assertTrue($adminSpoken['regular']);
        $this->assertArrayHasKey('currency_display', $adminSpoken);
        $adminIelts = $adminRows->firstWhere('slug', 'ielts-paid');
        $this->assertTrue($adminIelts['on_sale']);
        $this->assertSame(1500000, $adminIelts['sale_price_minor']);

        app(AcademyEnrollmentService::class)->enrollFree($withMedia, $this->student);
        $mine = $this->actingAs($this->student, 'sanctum')
            ->getJson('/api/v1/account/academy/my-courses')
            ->assertOk();
        $enrollments = collect($mine->json('data'));
        if ($enrollments->isEmpty() || ! isset($enrollments[0]['course'])) {
            $enrollments = collect($mine->json('data.data'));
        }
        $course = $enrollments->pluck('course')->first();
        $this->assertIsArray($course);
        $this->assertSame('spoken-media', $course['slug']);
        $this->assertSame('https://acad-lms.test/storage/academy/covers/spoken.jpg', $course['cover_url']);
        $this->assertSame('beginner', $course['level']);
        $this->assertSame('مقدماتی', $course['level_label']);
        $this->assertSame(3, $course['lessons_count']);
        $this->assertArrayHasKey('currency_display', $course);
    }

    public function test_list_cover_stays_null_when_missing_and_product_fallback_fills_it(): void
    {
        $tid = $this->admin->tenant_id;
        $product = Product::query()->create([
            'tenant_id' => $tid,
            'name' => 'با کاور محصول',
            'slug' => 'with-product-cover',
            'status' => 'publish',
            'price_minor' => 500000,
            'cover_image_url' => 'products/course-cover.jpg',
            'stock' => 1,
            'manage_stock' => false,
        ]);
        AcademyCourse::query()->create([
            'tenant_id' => $tid,
            'slug' => 'from-product',
            'title' => 'از محصول',
            'published' => true,
            'is_free' => false,
            'product_id' => $product->id,
        ]);

        $row = $this->getJson('/api/v1/public/academy', [
            'X-Tenant-Domain' => 'acad-lms.test',
        ])->assertOk()->json('data.0');

        $this->assertSame('https://acad-lms.test/storage/products/course-cover.jpg', $row['cover_url']);
        $this->assertSame(500000, $row['price_minor']);
        $this->assertFalse($row['on_sale']);
        $this->assertTrue($row['regular']);
        $this->assertNull($row['level']);
        $this->assertNull($row['level_label']);
    }
}
