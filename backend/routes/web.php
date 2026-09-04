<?php

use Illuminate\Support\Facades\Route;

Route::get('/up', fn () => response('ok', 200));

Route::get('/', function () {
    return view('welcome');
});
