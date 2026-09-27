<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Users\UserAdminService;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function __construct(protected UserAdminService $users) {}

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json($this->users->index($request, ['customer']));
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $request->validate([
            'name' => 'required_without_all:first_name,last_name|string|max:120',
            'email' => 'required|email|max:255',
        ]);

        $user = $this->users->store($request, 'customer');

        return response()->json(['data' => $user], 201);
    }

    public function update(Request $request, int $customer): \Illuminate\Http\JsonResponse
    {
        $user = $this->users->update($request, $customer, ['customer']);

        return response()->json(['data' => $user]);
    }
}
