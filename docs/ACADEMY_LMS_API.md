# Academy LMS API (for Webino frontend)

Base: `/api/v1`. Public routes need tenant host / `X-Tenant-Domain`. Student routes need Sanctum. Admin routes need staff + `module:academy` + `content.manage`.

## Public
- `GET /public/academy` — course list (`data` = array of course cards; `meta` pagination)
- `GET /public/academy/{slug}` — course detail: curriculum sections, locked/unlocked lessons, instructor, reviews, stats, enrolled flag
- `POST /public/academy/{slug}/enroll` — free enroll (auth)
- `POST /public/academy/{slug}/reviews` — submit review (pending moderation)
- `GET /public/academy/certificates/{serial}` — verify certificate
- `GET /public/academy/certificates/{serial}/download` — PDF/HTML download

## Student (auth, prefix `/account`)
- `GET /account/academy/my-courses`
- `GET /account/academy/my-certificates`
- `GET /account/academy/my-submissions`
- `GET /account/academy/courses/{course}/lessons/{lesson}` — unlocked lesson payload (+ quiz without answers / assignment meta)
- `GET /account/academy/courses/{course}/lessons/{lesson}/file` — download lesson file
- `POST /account/academy/courses/{course}/lessons/{lesson}/progress` — `{ percent?, complete? }`
- `POST /account/academy/quizzes/{quiz}/attempts`
- `POST /account/academy/quiz-attempts/{attempt}/submit` — `{ answers: { questionId: value } }`
- `POST /account/academy/assignments/{assignment}/submissions` — multipart `body` + optional `file`

## Admin
- Courses CRUD: `GET|POST /academy/courses`, `GET|PATCH|DELETE /academy/courses/{id}`
- Sections: `POST /academy/courses/{id}/sections`, `PATCH|DELETE .../sections/{section}`
- Lessons: `POST /academy/courses/{id}/lessons`, `PATCH|DELETE .../lessons/{lesson}`, `POST .../lessons/{lesson}/file`
  - Lesson body may include nested `quiz` or `assignment` objects
- `GET /academy/enrollments`
- `GET /academy/grading-queue`
- `POST /academy/submissions/{id}/grade` — `{ score, feedback?, status? }`
- `GET /academy/reviews`, `PATCH /academy/reviews/{id}` — `{ status, admin_reply? }`
- `GET /academy/certificates`

## Commerce link
Set `academy_courses.product_id` to a shop product (or order item meta `academy_course_id`). On order status `paid`, students auto-enroll.

## Reuse existing modules
Coupons/wallet/SMS OTP/tickets/protected product downloads stay on existing shop/support endpoints; tickets can carry course context in form_values/tags.
