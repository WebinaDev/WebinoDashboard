"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, } from "recharts";
export function useChartColors() {
    return useMemo(() => {
        if (typeof window === "undefined") {
            return {
                primary: "hsl(240 5.9% 10%)",
                muted: "hsl(240 4.8% 95.9%)",
                foreground: "hsl(240 10% 3.9%)",
                border: "hsl(240 5.9% 90%)",
            };
        }
        const styles = getComputedStyle(document.documentElement);
        const read = (name, fallback) => {
            const raw = styles.getPropertyValue(name).trim();
            return raw ? `hsl(${raw})` : fallback;
        };
        return {
            primary: read("--primary", "hsl(240 5.9% 10%)"),
            muted: read("--muted", "hsl(240 4.8% 95.9%)"),
            foreground: read("--foreground", "hsl(240 10% 3.9%)"),
            border: read("--border", "hsl(240 5.9% 90%)"),
        };
    }, []);
}
export function AccentBarChart({ data, height = 220, }) {
    const colors = useChartColors();
    return (_jsx("div", { style: { width: "100%", height }, children: _jsx(ResponsiveContainer, { children: _jsxs(BarChart, { data: data, margin: { top: 8, right: 8, left: 0, bottom: 8 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: colors.border, vertical: false }), _jsx(XAxis, { dataKey: "label", tick: { fill: colors.foreground, fontSize: 12 }, axisLine: { stroke: colors.border }, tickLine: false }), _jsx(YAxis, { tick: { fill: colors.foreground, fontSize: 12 }, axisLine: false, tickLine: false, width: 40 }), _jsx(Tooltip, { contentStyle: {
                            background: colors.muted,
                            border: `1px solid ${colors.border}`,
                            borderRadius: 8,
                            color: colors.foreground,
                        } }), _jsx(Bar, { dataKey: "value", fill: colors.primary, radius: [6, 6, 0, 0] })] }) }) }));
}
export function AccentDonutChart({ segments, height = 220, }) {
    const colors = useChartColors();
    const data = segments.filter((s) => s.value > 0);
    return (_jsx("div", { style: { width: "100%", height }, children: _jsx(ResponsiveContainer, { children: _jsxs(PieChart, { children: [_jsx(Pie, { data: data, dataKey: "value", nameKey: "label", innerRadius: "55%", outerRadius: "80%", paddingAngle: 2, children: data.map((entry) => (_jsx(Cell, { fill: entry.color ?? colors.primary, stroke: "transparent" }, entry.label))) }), _jsx(Tooltip, { contentStyle: {
                            background: colors.muted,
                            border: `1px solid ${colors.border}`,
                            borderRadius: 8,
                            color: colors.foreground,
                        } })] }) }) }));
}
export function AccentGaugeChart({ label, percent = 0, height = 180, }) {
    const colors = useChartColors();
    const value = Math.min(100, Math.max(0, percent ?? 0));
    const data = [{ name: label, value, fill: colors.primary }];
    return (_jsxs("div", { className: "flex flex-col items-center gap-2", style: { width: "100%", height }, children: [_jsx(ResponsiveContainer, { width: "100%", height: height - 28, children: _jsx(RadialBarChart, { innerRadius: "70%", outerRadius: "100%", data: data, startAngle: 180, endAngle: 0, children: _jsx(RadialBar, { background: true, dataKey: "value", cornerRadius: 8 }) }) }), _jsxs("div", { className: "text-center text-sm", children: [_jsx("div", { className: "text-muted-foreground", children: label }), _jsxs("div", { className: "text-2xl font-semibold tabular-nums", children: [Math.round(value), "%"] })] })] }));
}
