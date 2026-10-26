"""Port a bespoke mockup <style> into a scoped stylesheet: every selector is prefixed with the theme root
class, html/body/:root map to the root, and the mockup orange (#e8502a / #ff7a4d / #ff8a5c) becomes var(--acc)."""
import re, sys
src, scope, out = sys.argv[1], sys.argv[2], sys.argv[3]
css = re.search(r"<style>(.*?)</style>", open(src).read(), re.S).group(1)
def alpha(m):
    return f"color-mix(in srgb,var(--acc) {round(int(m.group(1),16)/255*100)}%,transparent)"
css = re.sub(r"#e8502a([0-9a-fA-F]{2})\b", alpha, css)
css = re.sub(r"#e8502a\b", "var(--acc)", css, flags=re.I)
css = re.sub(r"#(ff7a4d|ff8a5c|ffb08f)\b", "var(--acc2)", css, flags=re.I)
css = re.sub(r"#(c23a16|c7381a|b8321a|9b2a10)\b", "color-mix(in srgb,var(--acc) 78%,#000)", css, flags=re.I)
css = re.sub(r"#(ff6a3d)\b", "color-mix(in srgb,var(--acc) 85%,#fff)", css, flags=re.I)
css = re.sub(r"#(5a1405|7a1d08)\b", "color-mix(in srgb,var(--acc) 35%,#000)", css, flags=re.I)
def scope_sel(sel):
    sel = sel.strip()
    if not sel or sel.startswith(("from", "to")) or re.match(r"^\d+%$", sel): return sel
    sel = re.sub(r"^\*$", f"{scope} *", sel)
    sel = re.sub(r"^(html|body|:root)$", scope, sel)
    sel = re.sub(r"^html\[dir=(\w+)\]\s*body\b", rf"{scope}[dir=\1]", sel)
    sel = re.sub(r"^html\[dir=(\w+)\]\s*", rf"{scope}[dir=\1] ", sel)
    if sel.startswith(scope): return sel
    return f"{scope} {sel}"
outp = []; i = 0
def walk(s):
    res = []; pos = 0
    while pos < len(s):
        j = s.find("{", pos)
        if j < 0: break
        head = s[pos:j].strip()
        if head.startswith("@media") or head.startswith("@supports"):
            depth = 1; k = j + 1
            while depth:
                if s[k] == "{": depth += 1
                elif s[k] == "}": depth -= 1
                k += 1
            res.append(head + "{" + walk(s[j+1:k-1]) + "}"); pos = k; continue
        if head.startswith("@keyframes"):
            depth = 1; k = j + 1
            while depth:
                if s[k] == "{": depth += 1
                elif s[k] == "}": depth -= 1
                k += 1
            name = head.split()[1]
            res.append(head.replace(name, scope.strip('.').replace('-', '_') + '_' + name) + s[j:k]); pos = k; continue
        k = s.find("}", j)
        body = s[j+1:k]
        res.append(",".join(scope_sel(x) for x in head.split(",")) + "{" + body + "}"); pos = k + 1
    return "\n".join(res)
scoped = walk(css)
# rename animation references to the scoped keyframes
for name in set(re.findall(r"@keyframes\s+(\w+)", css)):
    scoped = re.sub(rf"(animation:\s*){name}\b", rf"\g<1>{scope.strip('.').replace('-', '_')}_{name}", scoped)
open(out, "w").write(f"/* Generated from {src.split('/')[-1]} by scripts/resume/scope_css.py, then hand-tuned below. */\n" + scoped + "\n")
