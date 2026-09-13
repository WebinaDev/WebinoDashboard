<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ResumeProfile;
use Illuminate\Http\Request;

class ResumeProfileController extends Controller
{
    public function show(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = ResumeProfile::query()->firstOrCreate(
            ['tenant_id' => $tid],
            [
                'full_name' => '',
                'published' => false,
                'experience' => [],
                'education' => [],
                'skills' => [],
                'projects' => [],
                'social_links' => [],
            ]
        );

        return response()->json(['data' => $row]);
    }

    public function update(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'full_name' => 'nullable|string|max:255',
            'headline' => 'nullable|string|max:255',
            'summary' => 'nullable|string',
            'photo_url' => 'nullable|string|max:500',
            'email' => 'nullable|string|max:255',
            'phone' => 'nullable|string|max:64',
            'location' => 'nullable|string|max:255',
            'experience' => 'nullable|array',
            'education' => 'nullable|array',
            'skills' => 'nullable|array',
            'projects' => 'nullable|array',
            'social_links' => 'nullable|array',
            'published' => 'boolean',
        ]);

        $row = ResumeProfile::query()->firstOrCreate(
            ['tenant_id' => $tid],
            ['full_name' => '', 'published' => false]
        );
        $row->update($data);

        return response()->json(['data' => $row->fresh()]);
    }
}
