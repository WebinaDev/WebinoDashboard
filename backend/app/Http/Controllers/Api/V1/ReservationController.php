<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\EventBooking;
use App\Models\Reservation;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Modules\Cafe\Entities\CafeEvent;

class ReservationController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;

        $reservations = Reservation::query()
            ->where('tenant_id', $tid)
            ->with('branch')
            ->orderByDesc('reserved_at')
            ->get();

        $events = CafeEvent::query()
            ->where('tenant_id', $tid)
            ->with(['branch', 'bookings'])
            ->orderByDesc('starts_at')
            ->get();

        return response()->json([
            'data' => [
                'reservations' => $reservations,
                'events' => $events,
            ],
        ]);
    }

    /**
     * Advance a reservation through its life: pending → confirmed → seated → completed,
     * with cancelled and no_show as the terminal branches.
     *
     * The foundation migration added `confirmed_at`, `declined_at`, `decline_reason`,
     * `seated_at`, `no_show_at` and `table_id`, and nothing wrote them: a reservation could
     * only be pending, confirmed or cancelled, so the host had no way to record that a guest
     * actually arrived, and "no-show" — the number a restaurant needs to decide whether to
     * keep taking online bookings — did not exist.
     *
     * Timestamps are set on the transition, not by the client, so they cannot disagree with
     * the status they describe.
     */
    public function updateReservation(Request $request, Reservation $reservation): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $reservation->tenant_id, 403);

        $data = $request->validate([
            'status' => ['required', 'string', 'in:pending,confirmed,seated,completed,cancelled,no_show'],
            'notes' => ['sometimes', 'nullable', 'string'],
            // Which table the party was given. Null clears it.
            'table_id' => ['sometimes', 'nullable', 'integer', Rule::exists('cafe_tables', 'id')->where('tenant_id', $reservation->tenant_id)],
            // Required for a decline so a later "why was I refused" has an answer.
            'decline_reason' => ['sometimes', 'nullable', 'string', 'max:300'],
        ]);

        $status = (string) $data['status'];
        $current = (string) $reservation->status;

        // Nothing but a fresh confirmation may move a cancelled booking back to life; doing so
        // silently would resurrect a table someone else has since been given.
        if (in_array($current, ['cancelled', 'no_show', 'completed'], true) && $status !== $current) {
            return response()->json([
                'message' => 'رزرو بسته‌شده را نمی‌توان دوباره باز کرد.',
                'errors' => ['status' => ['closed']],
            ], 422);
        }

        $patch = array_filter([
            'status' => $status,
            'notes' => $data['notes'] ?? null,
            'table_id' => $data['table_id'] ?? null,
        ], fn ($v) => $v !== null);

        // Stamp the edge, once. Re-confirming an already-confirmed booking must not move the
        // clock, because lead times are measured from it.
        if ($status === 'confirmed' && $reservation->confirmed_at === null) {
            $patch['confirmed_at'] = now();
        }
        if ($status === 'seated' && $reservation->seated_at === null) {
            $patch['seated_at'] = now();
        }
        if ($status === 'no_show' && $reservation->no_show_at === null) {
            $patch['no_show_at'] = now();
        }
        if ($status === 'cancelled' && $reservation->declined_at === null) {
            $patch['declined_at'] = now();
            $reason = trim((string) ($data['decline_reason'] ?? ''));
            if ($reason !== '') {
                $patch['decline_reason'] = $reason;
            }
        }

        $reservation->update($patch);

        return response()->json(['data' => $reservation->fresh()->load('branch', 'table')]);
    }

    public function storeEvent(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'branch_id' => ['nullable', 'integer', Rule::exists('cafe_branches', 'id')->where('tenant_id', $tid)],
            'title_fa' => ['required', 'string', 'max:255'],
            'title_en' => ['required', 'string', 'max:255'],
            'description_fa' => ['nullable', 'string'],
            'description_en' => ['nullable', 'string'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
            'capacity' => ['nullable', 'integer', 'min:0'],
            'price_minor' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $event = CafeEvent::query()->create([
            'tenant_id' => $tid,
            ...$data,
            'capacity' => $data['capacity'] ?? 0,
            'price_minor' => $data['price_minor'] ?? 0,
            'is_active' => $data['is_active'] ?? true,
        ]);

        return response()->json(['data' => $event], 201);
    }

    public function updateEvent(Request $request, CafeEvent $event): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $event->tenant_id, 403);

        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'branch_id' => ['sometimes', 'nullable', 'integer', Rule::exists('cafe_branches', 'id')->where('tenant_id', $tid)],
            'title_fa' => ['sometimes', 'string', 'max:255'],
            'title_en' => ['sometimes', 'string', 'max:255'],
            'description_fa' => ['sometimes', 'nullable', 'string'],
            'description_en' => ['sometimes', 'nullable', 'string'],
            'starts_at' => ['sometimes', 'date'],
            'ends_at' => ['sometimes', 'nullable', 'date'],
            'capacity' => ['sometimes', 'integer', 'min:0'],
            'price_minor' => ['sometimes', 'integer', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $event->update($data);

        return response()->json(['data' => $event->fresh()->load(['branch', 'bookings'])]);
    }

    public function updateEventBooking(Request $request, EventBooking $booking): \Illuminate\Http\JsonResponse
    {
        $event = $booking->event;
        abort_if($request->user()->tenant_id !== $event->tenant_id, 403);

        $data = $request->validate([
            'status' => ['required', 'string', 'in:pending,confirmed,cancelled'],
        ]);

        $booking->update($data);

        return response()->json(['data' => $booking->fresh()]);
    }
}
