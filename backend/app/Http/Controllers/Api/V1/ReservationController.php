<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CafeEvent;
use App\Models\EventBooking;
use App\Models\Reservation;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

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

    public function updateReservation(Request $request, Reservation $reservation): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $reservation->tenant_id, 403);

        $data = $request->validate([
            'status' => ['required', 'string', 'in:pending,confirmed,cancelled'],
            'notes' => ['sometimes', 'nullable', 'string'],
        ]);

        $reservation->update($data);

        return response()->json(['data' => $reservation->fresh()->load('branch')]);
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
