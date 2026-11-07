<?php

namespace App\Console\Commands;

use App\Models\ProductAttribute;
use App\Models\ProductAttributeTerm;
use App\Models\Tenant;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * Creates the frame (قاب) variation attributes Ali Khabari asked for:
 * type (with glass / cellophane finishes / chassis), size A5–A3, orientation.
 */
class SeedFrameAttributesCommand extends Command
{
    protected $signature = 'shop:seed-frame-attributes {--tenant= : Tenant id (default: first)} {--replace : Delete existing frame attribute terms first}';

    protected $description = 'Seed قاب product attributes: نوع قاب، سایز، جهت';

    public function handle(): int
    {
        $tenantId = (int) ($this->option('tenant') ?: Tenant::query()->value('id'));
        if ($tenantId < 1) {
            $this->error('No tenant found.');

            return self::FAILURE;
        }

        $defs = [
            'frame-type' => [
                'name' => 'نوع قاب',
                'terms' => [
                    'قاب با شیشه',
                    'قاب بدون شیشه — سلفون مات',
                    'قاب بدون شیشه — سلفون براق',
                    'قاب بدون شیشه — سلفون اکلیلی',
                    'قاب بدون شیشه — سلفون طرح چرم',
                    'شاسی',
                ],
            ],
            'frame-size' => [
                'name' => 'سایز',
                'terms' => ['A5', 'A4', 'A3'],
            ],
            'frame-orientation' => [
                'name' => 'جهت',
                'terms' => ['عمودی', 'افقی'],
            ],
        ];

        foreach ($defs as $slug => $def) {
            $attr = ProductAttribute::query()->firstOrCreate(
                ['tenant_id' => $tenantId, 'slug' => $slug],
                [
                    'name' => $def['name'],
                    'type' => 'select',
                    'order_by' => 'menu_order',
                    'has_archives' => false,
                    'show_swatch_label' => true,
                ]
            );
            $attr->update(['name' => $def['name'], 'type' => 'select']);
            if ($this->option('replace')) {
                ProductAttributeTerm::query()->where('product_attribute_id', $attr->id)->delete();
            }
            $order = 0;
            foreach ($def['terms'] as $termName) {
                $termSlug = Str::slug($termName) ?: ('term-'.(++$order));
                ProductAttributeTerm::query()->updateOrCreate(
                    ['tenant_id' => $tenantId, 'product_attribute_id' => $attr->id, 'slug' => $termSlug],
                    ['name' => $termName, 'menu_order' => $order++]
                );
            }
            $this->info("OK {$attr->name} ({$attr->slug}) — ".count($def['terms']).' terms');
        }

        return self::SUCCESS;
    }
}
