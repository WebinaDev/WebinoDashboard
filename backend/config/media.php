<?php

return [
    // Generate a WebP copy of raster uploads and serve it by default (original kept).
    'webp_on_upload' => env('MEDIA_WEBP_ON_UPLOAD', true),
    'webp_quality' => (int) env('MEDIA_WEBP_QUALITY', 80),
    'webp_max_width' => (int) env('MEDIA_WEBP_MAX_WIDTH', 2000),
];
