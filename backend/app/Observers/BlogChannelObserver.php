<?php

namespace App\Observers;

use App\Models\BlogPost;
use App\Services\Bots\Engine\ChannelPublisher;

class BlogChannelObserver
{
    public function saved(BlogPost $post): void
    {
        ChannelPublisher::onBlogPostSaved($post);
    }
}
