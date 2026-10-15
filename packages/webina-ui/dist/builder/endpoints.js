export function publicFormEndpoints(apiBase, prefix = "/v1/public/forms") {
    const base = `${apiBase.replace(/\/+$/, "")}${prefix}`;
    const key = (k) => `${base}/${encodeURIComponent(k)}`;
    return { definition: key, submit: key, upload: (k) => `${key(k)}/upload` };
}
