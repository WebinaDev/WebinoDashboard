export declare function useChartColors(): {
    primary: string;
    muted: string;
    foreground: string;
    border: string;
};
export type MetricBarPoint = {
    label: string;
    value: number;
};
export declare function AccentBarChart({ data, height, locale, }: {
    data: MetricBarPoint[];
    height?: number;
    locale?: string | null;
}): import("react").JSX.Element;
export type DonutSegment = {
    label: string;
    value: number;
    color?: string;
};
export declare function AccentDonutChart({ segments, height, locale, }: {
    segments: DonutSegment[];
    height?: number;
    locale?: string | null;
}): import("react").JSX.Element;
export declare function AccentGaugeChart({ label, percent, height, locale, }: {
    label: string;
    percent?: number;
    height?: number;
    locale?: string | null;
}): import("react").JSX.Element;
//# sourceMappingURL=AccentCharts.d.ts.map