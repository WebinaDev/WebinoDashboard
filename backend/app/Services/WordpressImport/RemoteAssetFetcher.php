<?php

namespace App\Services\WordpressImport;

interface RemoteAssetFetcher
{
    /**
     * @param  list<string>  $allowedHosts
     */
    public function fetch(string $url, array $allowedHosts, int $maxBytes = 8388608): FetchedAsset;
}
