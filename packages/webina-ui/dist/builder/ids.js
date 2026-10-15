export function uid(prefix) {
    const rand = Math.random().toString(36).slice(2, 8);
    const time = Date.now().toString(36).slice(-4);
    return `${prefix}_${rand}${time}`;
}
export function safeClass(id) {
    const clean = id.replace(/[^a-zA-Z0-9_-]/g, "");
    return `wb-${clean || "node"}`;
}
