<?php

return [

    'server' => env('OCTANE_SERVER', 'frankenphp'),

    'https' => env('OCTANE_HTTPS', false),

    'listeners' => [
        Laravel\Octane\Events\WorkerStarting::class => [
            Laravel\Octane\Listeners\EnsureUploadedFilesAreValid::class,
            Laravel\Octane\Listeners\EnsureUploadedFilesCanBeMoved::class,
        ],
        Laravel\Octane\Events\RequestReceived::class => [
            Laravel\Octane\Listeners\FlushUploadedFiles::class,
        ],
        Laravel\Octane\Events\OperationTerminated::class => [
            Laravel\Octane\Listeners\FlushTemporaryContainerInstances::class,
        ],
        Laravel\Octane\Events\WorkerErrorOccurred::class => [
            Laravel\Octane\Listeners\ReportException::class,
            Laravel\Octane\Listeners\StopWorkerIfNecessary::class,
        ],
        Laravel\Octane\Events\WorkerStopping::class => [],
    ],

    'warm' => [],

    'flush' => [],

    'cache' => [
        'rows' => 1000,
        'bytes' => 10000,
    ],

    'tables' => [],

    'garbage' => 50,

    'max_execution_time' => 30,

];
