<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('academy_courses', function (Blueprint $table) {
            if (! Schema::hasColumn('academy_courses', 'product_id')) {
                $table->foreignId('product_id')->nullable()->after('tenant_id')->constrained('products')->nullOnDelete();
            }
            if (! Schema::hasColumn('academy_courses', 'is_free')) {
                $table->boolean('is_free')->default(false)->after('published');
            }
            if (! Schema::hasColumn('academy_courses', 'price_minor')) {
                $table->unsignedBigInteger('price_minor')->nullable()->after('is_free');
            }
            if (! Schema::hasColumn('academy_courses', 'level')) {
                $table->string('level', 64)->nullable()->after('price_minor');
            }
            if (! Schema::hasColumn('academy_courses', 'duration_minutes')) {
                $table->unsignedInteger('duration_minutes')->nullable()->after('level');
            }
            if (! Schema::hasColumn('academy_courses', 'instructor_name')) {
                $table->string('instructor_name')->nullable()->after('duration_minutes');
            }
            if (! Schema::hasColumn('academy_courses', 'instructor_bio')) {
                $table->text('instructor_bio')->nullable()->after('instructor_name');
            }
            if (! Schema::hasColumn('academy_courses', 'instructor_avatar_url')) {
                $table->string('instructor_avatar_url', 500)->nullable()->after('instructor_bio');
            }
            if (! Schema::hasColumn('academy_courses', 'certificate_enabled')) {
                $table->boolean('certificate_enabled')->default(true)->after('instructor_avatar_url');
            }
            if (! Schema::hasColumn('academy_courses', 'certificate_title')) {
                $table->string('certificate_title')->nullable()->after('certificate_enabled');
            }
            if (! Schema::hasColumn('academy_courses', 'drip_enabled')) {
                $table->boolean('drip_enabled')->default(false)->after('certificate_title');
            }
            if (! Schema::hasColumn('academy_courses', 'students_count')) {
                $table->unsignedInteger('students_count')->default(0)->after('drip_enabled');
            }
            if (! Schema::hasColumn('academy_courses', 'rating_avg')) {
                $table->decimal('rating_avg', 3, 2)->nullable()->after('students_count');
            }
            if (! Schema::hasColumn('academy_courses', 'rating_count')) {
                $table->unsignedInteger('rating_count')->default(0)->after('rating_avg');
            }
            if (! Schema::hasColumn('academy_courses', 'meta')) {
                $table->json('meta')->nullable()->after('rating_count');
            }
        });

        Schema::table('academy_lessons', function (Blueprint $table) {
            if (! Schema::hasColumn('academy_lessons', 'section_id')) {
                $table->unsignedBigInteger('section_id')->nullable()->after('course_id');
            }
            if (! Schema::hasColumn('academy_lessons', 'type')) {
                $table->string('type', 32)->default('text')->after('title');
            }
            if (! Schema::hasColumn('academy_lessons', 'audio_url')) {
                $table->string('audio_url', 500)->nullable()->after('video_url');
            }
            if (! Schema::hasColumn('academy_lessons', 'file_path')) {
                $table->string('file_path', 500)->nullable()->after('audio_url');
            }
            if (! Schema::hasColumn('academy_lessons', 'file_name')) {
                $table->string('file_name')->nullable()->after('file_path');
            }
            if (! Schema::hasColumn('academy_lessons', 'duration_seconds')) {
                $table->unsignedInteger('duration_seconds')->nullable()->after('file_name');
            }
            if (! Schema::hasColumn('academy_lessons', 'is_preview')) {
                $table->boolean('is_preview')->default(false)->after('published');
            }
            if (! Schema::hasColumn('academy_lessons', 'drip_days')) {
                $table->unsignedInteger('drip_days')->nullable()->after('is_preview');
            }
            if (! Schema::hasColumn('academy_lessons', 'requires_pass_lesson_id')) {
                $table->unsignedBigInteger('requires_pass_lesson_id')->nullable()->after('drip_days');
            }
            if (! Schema::hasColumn('academy_lessons', 'meta')) {
                $table->json('meta')->nullable()->after('requires_pass_lesson_id');
            }
        });

        if (! Schema::hasTable('academy_sections')) {
            Schema::create('academy_sections', function (Blueprint $table) {
                $table->id();
                $table->foreignId('course_id')->constrained('academy_courses')->cascadeOnDelete();
                $table->string('title');
                $table->text('description')->nullable();
                $table->unsignedInteger('sort_order')->default(0);
                $table->timestamps();
            });
        }
        if (! Schema::hasTable('academy_quizzes')) {
            Schema::create('academy_quizzes', function (Blueprint $table) {
                $table->id();
                $table->foreignId('lesson_id')->constrained('academy_lessons')->cascadeOnDelete();
                $table->unsignedTinyInteger('pass_mark')->default(70);
                $table->unsignedSmallInteger('max_attempts')->nullable();
                $table->unsignedInteger('time_limit_seconds')->nullable();
                $table->boolean('shuffle_questions')->default(false);
                $table->timestamps();
            });
        }
        if (! Schema::hasTable('academy_quiz_questions')) {
            Schema::create('academy_quiz_questions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('quiz_id')->constrained('academy_quizzes')->cascadeOnDelete();
                $table->string('type', 32);
                $table->text('prompt');
                $table->json('options')->nullable();
                $table->json('correct')->nullable();
                $table->unsignedSmallInteger('points')->default(1);
                $table->unsignedInteger('sort_order')->default(0);
                $table->timestamps();
            });
        }
        if (! Schema::hasTable('academy_quiz_attempts')) {
            Schema::create('academy_quiz_attempts', function (Blueprint $table) {
                $table->id();
                $table->foreignId('quiz_id')->constrained('academy_quizzes')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->unsignedInteger('score')->default(0);
                $table->unsignedInteger('max_score')->default(0);
                $table->boolean('passed')->default(false);
                $table->json('answers')->nullable();
                $table->timestamp('started_at')->nullable();
                $table->timestamp('finished_at')->nullable();
                $table->timestamps();
                $table->index(['quiz_id', 'user_id']);
            });
        }
        if (! Schema::hasTable('academy_assignments')) {
            Schema::create('academy_assignments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('lesson_id')->constrained('academy_lessons')->cascadeOnDelete();
                $table->text('instructions')->nullable();
                $table->unsignedInteger('max_score')->default(100);
                $table->boolean('allow_file')->default(true);
                $table->boolean('allow_text')->default(true);
                $table->timestamp('due_at')->nullable();
                $table->timestamps();
            });
        }
        if (! Schema::hasTable('academy_assignment_submissions')) {
            Schema::create('academy_assignment_submissions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('assignment_id')->constrained('academy_assignments')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
                $table->text('body')->nullable();
                $table->string('file_path', 500)->nullable();
                $table->string('file_name')->nullable();
                $table->string('status', 32)->default('submitted');
                $table->unsignedInteger('score')->nullable();
                $table->text('feedback')->nullable();
                $table->foreignId('graded_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('graded_at')->nullable();
                $table->timestamps();
                $table->unique(['assignment_id', 'user_id']);
            });
        }
        if (! Schema::hasTable('academy_enrollments')) {
            Schema::create('academy_enrollments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
                $table->foreignId('course_id')->constrained('academy_courses')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
                $table->string('status', 32)->default('active');
                $table->timestamp('enrolled_at')->nullable();
                $table->timestamp('completed_at')->nullable();
                $table->unsignedTinyInteger('progress_percent')->default(0);
                $table->timestamps();
                $table->unique(['course_id', 'user_id']);
                $table->index(['tenant_id', 'user_id']);
            });
        }
        if (! Schema::hasTable('academy_lesson_progress')) {
            Schema::create('academy_lesson_progress', function (Blueprint $table) {
                $table->id();
                $table->foreignId('enrollment_id')->constrained('academy_enrollments')->cascadeOnDelete();
                $table->foreignId('lesson_id')->constrained('academy_lessons')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->string('status', 32)->default('started');
                $table->unsignedTinyInteger('percent')->default(0);
                $table->timestamp('started_at')->nullable();
                $table->timestamp('completed_at')->nullable();
                $table->timestamps();
                $table->unique(['enrollment_id', 'lesson_id']);
            });
        }
        if (! Schema::hasTable('academy_certificates')) {
            Schema::create('academy_certificates', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
                $table->foreignId('course_id')->constrained('academy_courses')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('enrollment_id')->constrained('academy_enrollments')->cascadeOnDelete();
                $table->string('serial', 64);
                $table->string('student_name');
                $table->string('course_title');
                $table->string('pdf_path', 500)->nullable();
                $table->timestamp('issued_at')->nullable();
                $table->timestamp('emailed_at')->nullable();
                $table->timestamps();
                $table->unique(['tenant_id', 'serial']);
                $table->unique(['enrollment_id']);
            });
        }
        if (! Schema::hasTable('academy_reviews')) {
            Schema::create('academy_reviews', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
                $table->foreignId('course_id')->constrained('academy_courses')->cascadeOnDelete();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->unsignedTinyInteger('rating');
                $table->text('body')->nullable();
                $table->string('author_name')->nullable();
                $table->string('status', 32)->default('pending');
                $table->text('admin_reply')->nullable();
                $table->timestamps();
                $table->index(['course_id', 'status']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('academy_reviews');
        Schema::dropIfExists('academy_certificates');
        Schema::dropIfExists('academy_lesson_progress');
        Schema::dropIfExists('academy_enrollments');
        Schema::dropIfExists('academy_assignment_submissions');
        Schema::dropIfExists('academy_assignments');
        Schema::dropIfExists('academy_quiz_attempts');
        Schema::dropIfExists('academy_quiz_questions');
        Schema::dropIfExists('academy_quizzes');
        Schema::dropIfExists('academy_sections');
    }
};
