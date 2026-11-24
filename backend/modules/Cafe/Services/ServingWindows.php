<?php

namespace Modules\Cafe\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * When each item is actually served.
 *
 * A café has one menu and three days: breakfast until eleven, the lunch plates from twelve,
 * and the cake counter all day. Without serving windows the till offers the soup at 8 a.m. and
 * the guest is told no — which is the same as the menu being wrong.
 *
 * A window is either per product or per category, never both, so precedence is unambiguous: a
 * product's own window wins, otherwise its category's, otherwise it is always available.
 *
 * Times are wall-clock in the shop's timezone and may cross midnight (22:00–02:00 is a shisha
 * menu, not an error). A window is compared in minutes-since-midnight, which handles that case
 * without any date arithmetic.
 */
final class ServingWindows
{
    /** @return array<int, array<string, mixed>> */
    public function all(int $tenantId): array
    {
        return DB::table('cafe_serving_windows')
            ->where('tenant_id', $tenantId)
            ->orderBy('start_time')
            ->get()
            ->map(fn ($row): array => $this->shape($row))
            ->all();
    }

    /**
     * Create or update a window.
     *
     * @param  array{label?: string|null, product_id?: int|null, category_id?: int|null, weekdays?: array<int, int>|null, start_time: string, end_time: string, is_active?: bool}  $data
     * @return array<string, mixed>
     */
    public function save(int $tenantId, array $data, ?int $id = null): array
    {
        if (($data['product_id'] ?? null) !== null && ($data['category_id'] ?? null) !== null) {
            throw ValidationException::withMessages(['product_id' => __('api.serving_window_target_conflict')]);
        }

        $start = $this->minutes((string) $data['start_time']);
        $end = $this->minutes((string) $data['end_time']);

        if ($start === null || $end === null) {
            throw ValidationException::withMessages(['start_time' => __('api.serving_window_time_invalid')]);
        }

        if ($start === $end) {
            // A zero-length window would silently hide an item forever, which is never what
            // someone typing "12:00 to 12:00" meant.
            throw ValidationException::withMessages(['end_time' => __('api.serving_window_empty')]);
        }

        $payload = [
            'tenant_id' => $tenantId,
            'label' => $data['label'] ?? null,
            'product_id' => $data['product_id'] ?? null,
            'category_id' => $data['category_id'] ?? null,
            'weekdays' => isset($data['weekdays']) && $data['weekdays'] !== []
                ? json_encode(array_values(array_map('intval', $data['weekdays'])))
                : null,
            'start_time' => $this->normalise((string) $data['start_time']),
            'end_time' => $this->normalise((string) $data['end_time']),
            'is_active' => (bool) ($data['is_active'] ?? true),
            'updated_at' => now(),
        ];

        if ($id === null) {
            $payload['created_at'] = now();
            $id = (int) DB::table('cafe_serving_windows')->insertGetId($payload);
        } else {
            DB::table('cafe_serving_windows')->where('tenant_id', $tenantId)->where('id', $id)->update($payload);
        }

        return $this->shape((object) array_merge($payload, ['id' => $id]));
    }

    public function delete(int $tenantId, int $id): void
    {
        DB::table('cafe_serving_windows')->where('tenant_id', $tenantId)->where('id', $id)->delete();
    }

    /**
     * Whether a product is being served at a given moment.
     *
     * @return array{available: bool, window_id: ?int, label: ?string, next_opens_at: ?string}
     */
    public function statusFor(int $tenantId, int $productId, ?int $categoryId, ?Carbon $at = null): array
    {
        $windows = DB::table('cafe_serving_windows')
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->where(function ($q) use ($productId, $categoryId): void {
                $q->where('product_id', $productId);
                if ($categoryId !== null) {
                    $q->orWhere('category_id', $categoryId);
                }
            })
            ->get();

        if ($windows->isEmpty()) {
            // No window means always available. Making the absence mean "never" would hide the
            // whole menu the moment the feature ships.
            return ['available' => true, 'window_id' => null, 'label' => null, 'next_opens_at' => null];
        }

        $at ??= now();

        // The product's own window outranks its category's.
        $own = $windows->filter(fn ($row) => (int) ($row->product_id ?? 0) === $productId);
        $candidates = $own->isNotEmpty() ? $own : $windows;

        foreach ($candidates as $window) {
            if ($this->covers($window, $at)) {
                return [
                    'available' => true,
                    'window_id' => (int) $window->id,
                    'label' => $window->label,
                    'next_opens_at' => null,
                ];
            }
        }

        $first = $candidates->first();

        return [
            'available' => false,
            'window_id' => (int) $first->id,
            'label' => $first->label,
            'next_opens_at' => $this->nextOpening($candidates, $at),
        ];
    }

    /** Product ids currently out of their window, for filtering a menu in one query. */
    public function unavailableProductIds(int $tenantId, ?Carbon $at = null): array
    {
        $at ??= now();

        $windows = DB::table('cafe_serving_windows')
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->get();

        if ($windows->isEmpty()) {
            return [];
        }

        $byProduct = [];
        $byCategory = [];

        foreach ($windows as $window) {
            if ($this->covers($window, $at)) {
                continue;
            }
            if ($window->product_id !== null) {
                $byProduct[(int) $window->product_id] = true;
            } elseif ($window->category_id !== null) {
                $byCategory[(int) $window->category_id] = true;
            }
        }

        $blocked = array_keys($byProduct);

        if ($byCategory !== []) {
            $inClosedCategories = DB::table('products')
                ->where('tenant_id', $tenantId)
                ->whereIn('category_id', array_keys($byCategory))
                ->pluck('id')
                ->map(fn ($id): int => (int) $id)
                ->all();

            $blocked = array_values(array_unique(array_merge($blocked, $inClosedCategories)));
        }

        // A product with an open window of its own is served even if its category is closed.
        $open = [];

        foreach ($windows as $window) {
            if ($this->covers($window, $at) && $window->product_id !== null) {
                $open[(int) $window->product_id] = true;
            }
        }

        return array_values(array_filter($blocked, fn (int $id): bool => ! isset($open[$id])));
    }

    // ------------------------------------------------------------------ internals ---

    private function shape(object $row): array
    {
        $weekdays = $row->weekdays ?? null;
        $decoded = is_string($weekdays) ? json_decode($weekdays, true) : null;

        return [
            'id' => (int) $row->id,
            'label' => $row->label ?? null,
            'product_id' => $row->product_id === null ? null : (int) $row->product_id,
            'category_id' => $row->category_id === null ? null : (int) $row->category_id,
            'weekdays' => is_array($decoded) ? array_map('intval', $decoded) : null,
            'start_time' => substr((string) $row->start_time, 0, 5),
            'end_time' => substr((string) $row->end_time, 0, 5),
            'is_active' => (bool) ($row->is_active ?? true),
            // Stated so the screen does not have to repeat the arithmetic.
            'crosses_midnight' => $this->minutes(substr((string) $row->start_time, 0, 5))
                > $this->minutes(substr((string) $row->end_time, 0, 5)),
        ];
    }

    private function covers(object $window, Carbon $at): bool
    {
        $weekdays = $window->weekdays ?? null;
        $decoded = is_string($weekdays) ? json_decode($weekdays, true) : null;

        if (is_array($decoded) && $decoded !== []) {
            // Carbon: 0 = Sunday. The window uses 0 = Monday, because a Persian week reads
            // Saturday→Friday and 0-as-Sunday would put the weekend in the middle of the list.
            $iso = (int) $at->dayOfWeekIso - 1;
            if (! in_array($iso, array_map('intval', $decoded), true)) {
                return false;
            }
        }

        $start = $this->minutes(substr((string) $window->start_time, 0, 5));
        $end = $this->minutes(substr((string) $window->end_time, 0, 5));
        $now = $at->hour * 60 + $at->minute;

        if ($start === null || $end === null) {
            return true;
        }

        if ($start < $end) {
            return $now >= $start && $now < $end;
        }

        // Crossing midnight: 22:00–02:00 is two intervals that must both be checked, and the
        // weekday check above already applies to the evening it started.
        return $now >= $start || $now < $end;
    }

    /** @param  \Illuminate\Support\Collection<int, object>  $windows */
    private function nextOpening($windows, Carbon $at): ?string
    {
        $today = (int) $at->dayOfWeekIso - 1;
        $best = null;

        for ($offset = 0; $offset < 7; $offset++) {
            $day = ($today + $offset) % 7;

            foreach ($windows as $window) {
                $weekdays = $window->weekdays ?? null;
                $decoded = is_string($weekdays) ? json_decode($weekdays, true) : null;

                if (is_array($decoded) && $decoded !== [] && ! in_array($day, array_map('intval', $decoded), true)) {
                    continue;
                }

                $start = $this->minutes(substr((string) $window->start_time, 0, 5));
                if ($start === null) {
                    continue;
                }

                if ($offset === 0 && ($at->hour * 60 + $at->minute) >= $start) {
                    continue;
                }

                $candidate = $at->copy()->addDays($offset)->setTime(intdiv($start, 60), $start % 60);

                if ($best === null || $candidate->lessThan($best)) {
                    $best = $candidate;
                }
            }

            if ($best !== null) {
                return $best->toIso8601String();
            }
        }

        return null;
    }

    private function minutes(string $time): ?int
    {
        if (! preg_match('/^(\d{1,2}):(\d{2})/', $time, $m)) {
            return null;
        }

        $hours = (int) $m[1];
        $mins = (int) $m[2];

        if ($hours > 23 || $mins > 59) {
            return null;
        }

        return $hours * 60 + $mins;
    }

    private function normalise(string $time): string
    {
        $minutes = (int) $this->minutes($time);

        return sprintf('%02d:%02d:00', intdiv($minutes, 60), $minutes % 60);
    }
}
