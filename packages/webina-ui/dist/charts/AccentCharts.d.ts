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
export declare function AccentBarChart({ data, height, }: {
    data: MetricBarPoint[];
    height?: number;
}): import("react").JSX.Element;
export type DonutSegment = {
    label: string;
    value: number;
    color?: string;
};
export declare function AccentDonutChart({ segments, height, }: {
    segments: DonutSegment[];
    height?: number;
}): import("react").JSX.Element;
export declare function AccentGaugeChart({ label, percent, height, }: {
    label: string;
    percent?: number;
    height?: number;
}): import("react").JSX.Element;
