<?php

return [
    // Generate a WebP copy of raster uploads and serve it by default (original kept).
    'webp_on_upload' => env('MEDIA_WEBP_ON_UPLOAD', true),
    'webp_quality' => (int) env('MEDIA_WEBP_QUALITY', 80),
    'webp_max_width' => (int) env('MEDIA_WEBP_MAX_WIDTH', 2000),
    // Media library max upload size in KB (audio/video). Keep ≤ nginx client_max_body_size / PHP limits.
    'max_upload_kb' => (int) env('MEDIA_MAX_UPLOAD_KB', 65536),
];
