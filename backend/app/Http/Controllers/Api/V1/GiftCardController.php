<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\GiftCard;
use App\Services\GiftCards\GiftCardService;
use Illuminate\Http\Request;

/**
 * Admin: issue, list, edit, adjust gift cards. Public: balance check by code.
 */
class GiftCardController extends Controller
{
    use Concerns\ResolvesPublicTenant;

    public function __construct(protected GiftCardService $cards) {}

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $q = GiftCard::query()->where('tenant_id', $tid)->orderByDesc('id');
        if ($s = trim((string) $request->query('search', ''))) {
            $code = GiftCardService::normalizeCode($s);
            $q->where(function ($w) use ($s, $code) {
                $w->where('code', 'like', '%'.$code.'%')
                    ->orWhere('recipient_name', 'like', '%'.$s.'%')
                    ->orWhere('recipient_phone', 'like', '%'.$s.'%');
            });
        }
        if ($status = $request->query('status')) {
            $q->where('status', (string) $status);
        }
        $page = $q->paginate(min(100, max(5, (int) $request->query('per_page', 20))));

        return response()->json([
            'data' => $page->items(),
            'meta' => [
                'total' => $page->total(),
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'balance_total_minor' => (int) GiftCard::query()->where('tenant_id', $tid)->where('status', 'active')->sum('balance_minor'),
            ],
        ]);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $this->validated($request, true);
        $card = $this->cards->issue((int) $request->user()->tenant_id, $data, (int) $request->user()->id);

        return response()->json(['data' => $card], 201);
    }

    public function show(Request $request, int $card): \Illuminate\Http\JsonResponse
    {
        $row = $this->find($request, $card)->load('transactions');

        return response()->json(['data' => $row]);
    }

    public function update(Request $request, int $card): \Illuminate\Http\JsonResponse
    {
        $row = $this->find($request, $card);
        $data = $this->validated($request, false);
        unset($data['amount_minor'], $data['code']);
        $row->fill($data)->save();

        return response()->json(['data' => $row->fresh()]);
    }

    public function adjust(Request $request, int $card): \Illuminate\Http\JsonResponse
    {
        $row = $this->find($request, $card);
        $data = $request->validate([
            'direction' => ['required', 'in:credit,debit'],
            'amount_minor' => ['required', 'integer', 'min:1'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);
        $fresh = $this->cards->adjust($row, $data['direction'], (int) $data['amount_minor'], $data['note'] ?? null, (int) $request->user()->id);

        return response()->json(['data' => $fresh->load('transactions')]);
    }

    public function destroy(Request $request, int $card): \Illuminate\Http\JsonResponse
    {
        $row = $this->find($request, $card);
        $row->update(['status' => 'disabled']);
        $row->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    public function generateCode(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => ['code' => $this->cards->generateCode((int) $request->user()->tenant_id)]]);
    }

    /** POST /public/gift-cards/balance {code} */
    public function publicBalance(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $data = $request->validate(['code' => ['required', 'string', 'max:40']]);
        $card = $this->cards->find($tid, $data['code']);
        if (! $card) {
            return response()->json(['message' => 'کارت هدیه پیدا نشد.'], 404);
        }

        return response()->json(['data' => GiftCardService::publicPayload($card)]);
    }

    protected function find(Request $request, int $id): GiftCard
    {
        return GiftCard::query()->where('tenant_id', (int) $request->user()->tenant_id)->findOrFail($id);
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request, bool $create): array
    {
        $data = $request->validate([
            'code' => ['nullable', 'string', 'max:40'],
            'amount_minor' => [$create ? 'required' : 'nullable', 'integer', 'min:1'],
            'currency' => ['nullable', 'string', 'max:8'],
            'status' => ['nullable', 'in:active,disabled'],
            'user_id' => ['nullable', 'integer'],
            'recipient_name' => ['nullable', 'string', 'max:255'],
            'recipient_phone' => ['nullable', 'string', 'max:32'],
            'recipient_email' => ['nullable', 'email', 'max:255'],
            'message' => ['nullable', 'string', 'max:1000'],
            'note' => ['nullable', 'string', 'max:1000'],
            'expires_at' => ['nullable', 'date'],
        ]);
        if (! empty($data['user_id']) && ! \App\Models\User::query()->where('tenant_id', (int) $request->user()->tenant_id)->whereKey((int) $data['user_id'])->exists()) {
            throw \Illuminate\Validation\ValidationException::withMessages(['user_id' => 'مشتری پیدا نشد.']);
        }

        return $data;
    }
}
