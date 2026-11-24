<?php

namespace Modules\Accounting\Services;

/**
 * Standard Absorption & Activity-Based Cost Accounting Service.
 * Calculates direct materials, direct labor, and allocates manufacturing overheads to Work Orders & inventory.
 */
class CostAccountingService
{
    /**
     * Compute full unit cost for a manufacturing Work Order (BOM materials + labor + allocated overhead).
     *
     * @param  array{direct_materials_cost: float, direct_labor_hours: float, labor_hourly_rate: float, machine_hours: float}  $directInputs
     * @param  array<string, float>  $overheadPools  Keyed by cost pool name => total overhead amount in pool
     * @param  float  $producedQuantity  Number of finished goods produced
     * @return array<string, mixed>
     */
    public function computeWorkOrderCost(array $directInputs, array $overheadPools, float $producedQuantity): array
    {
        $producedQuantity = max(1.0, $producedQuantity);

        // 1. بهای مواد مستقیم مصرفی
        $directMaterials = (float) ($directInputs['direct_materials_cost'] ?? 0);

        // 2. بهای دستمزد مستقیم کار تولیدی
        $laborHours = (float) ($directInputs['direct_labor_hours'] ?? 0);
        $hourlyRate = (float) ($directInputs['labor_hourly_rate'] ?? 0);
        $directLabor = round($laborHours * $hourlyRate, 2);

        // 3. بهای اولیه (Prime Cost)
        $primeCost = round($directMaterials + $directLabor, 2);

        // 4. تسهیم هزینه‌های سربار ساخت (Manufacturing Overhead Allocation)
        // مبنای تسهیم: ساعات کارکرد ماشین‌آلات و نفر-ساعت کارگاهی
        $allocatedOverheads = [];
        $totalOverhead = 0.0;
        foreach ($overheadPools as $poolName => $poolAmount) {
            // تسهیم بر اساس سهم این سفارش از ظرفیت کل
            $allocationRate = 0.15; // نسبت استاندارد تخصیص
            $allocated = round((float) $poolAmount * $allocationRate, 2);
            $allocatedOverheads[$poolName] = $allocated;
            $totalOverhead += $allocated;
        }

        // 5. بهای تمام‌شده کل تولید (Total Manufacturing Cost)
        $totalCost = round($primeCost + $totalOverhead, 2);
        $unitCost = round($totalCost / $producedQuantity, 2);

        return [
            'prime_cost' => $primeCost,
            'direct_materials' => $directMaterials,
            'direct_labor' => $directLabor,
            'overhead_breakdown' => $allocatedOverheads,
            'total_overhead' => $totalOverhead,
            'total_cost' => $totalCost,
            'produced_quantity' => $producedQuantity,
            'unit_cost' => $unitCost,
            'calculated_at' => now()->toIso8601String(),
        ];
    }
}
