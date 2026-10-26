# arsalanarghavan.ir — resume seed

Site-specific content for the generic Resume module (nothing here is used by other tenants).

- `resume.json` — data (fa default + en) built from the LinkedIn PDF; `is_placeholder: true` rows show «نمونه» and are hidden on the site by default.
- `overlay.json` — this site's choices: theme **story**, accent `#e8502a`, dark, default language **fa**; `avatar.jpg` + `cutout.png` (transparent portrait used by Story / Webina OS).

Rebuild after `data.json` changes: `python3 scripts/resume/build_site_seed.py <data.json> deploy/sites/arsalanarghavan.ir/resume`

Load into the tenant (on the server, by an operator — **not run automatically**):

```bash
php artisan resume:import arsalanarghavan.ir /path/to/deploy/sites/arsalanarghavan.ir/resume/resume.json --replace --theme=story --locale=fa
```

`--theme=story` writes the builder pages `home` (fa) and `en` (en, same translation group → hreflang); the previous builder documents are kept as revisions («resume-theme»). The resume module (`resume.profile` submodule) must be enabled for the tenant.
