<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\CafeEvent;
use App\Models\EventBooking;
use App\Models\Reservation;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PublicReservationController extends Controller
{
    use ResolvesPublicTenant;

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);

        $data = $request->validate([
            'guest_name' => ['required', 'string', 'max:255'],
            'guest_phone' => ['required', 'string', 'max:32'],
            'party_size' => ['required', 'integer', 'min:1', 'max:50'],
            'reserved_at' => ['required', 'date', 'after:now'],
            'branch_id' => ['nullable', 'integer', Rule::exists('cafe_branches', 'id')->where('tenant_id', $tid)],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $reservation = Reservation::query()->create([
            'tenant_id' => $tid,
            'branch_id' => $data['branch_id'] ?? null,
            'guest_name' => $data['guest_name'],
            'guest_phone' => $data['guest_phone'],
            'party_size' => $data['party_size'],
            'reserved_at' => $data['reserved_at'],
            'notes' => $data['notes'] ?? null,
            'status' => 'pending',
        ]);

        return response()->json(['data' => $reservation], 201);
    }

    public function bookEvent(Request $request, CafeEvent $event): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        abort_if($event->tenant_id !== $tid || ! $event->is_active, 404);

        $data = $request->validate([
            'guest_name' => ['required', 'string', 'max:255'],
            'guest_phone' => ['required', 'string', 'max:32'],
            'seats' => ['required', 'integer', 'min:1', 'max:20'],
        ]);

        if ($event->capacity > 0) {
            $booked = EventBooking::query()
                ->where('event_id', $event->id)
                ->where('status', '!=', 'cancelled')
                ->sum('seats');
            abort_if($booked + $data['seats'] > $event->capacity, 422, __('api.event_full'));
        }

        $booking = EventBooking::query()->create([
            'event_id' => $event->id,
            'guest_name' => $data['guest_name'],
            'guest_phone' => $data['guest_phone'],
            'seats' => $data['seats'],
            'status' => 'pending',
        ]);

        return response()->json(['data' => $booking], 201);
    }

    public function events(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);

        $events = CafeEvent::query()
            ->where('tenant_id', $tid)
            ->where('is_active', true)
            ->where('starts_at', '>=', now())
            ->orderBy('starts_at')
            ->get();

        return response()->json(['data' => $events])
            ->header('Cache-Control', 'public, max-age=60, s-maxage=120');
    }
}
