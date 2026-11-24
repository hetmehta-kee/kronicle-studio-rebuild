# REA pass — Kronicle client bundles

- Evidence ID: `ev_a2f61e1a62a310c2e9c5e94e14ab08dbc691eaf4c64cb034935a7f80e03a4291`
- Operation: `analyze_javascript_application`
- Target: 43 downloaded Next.js/Turbopack chunks (2,052,987 text bytes, 437,489 AST nodes)
- Format: REA JavaScript application evidence (197 MB JSON: `rea-js-analysis.json`)
- Statistics: 43 parsed files, 868 findings, 0 parse failures; graph coverage partial
- Route inventory: 13 route patterns / 46 occurrences (`rea-routes.txt`)

## Routes observed by REA
```
/
/home
/home/pick-director
/home/pick-look
/home/pick-models
/home/script-split
/home/settings/{billing,general,team,usage}
/home/shows
/platform
/platform/workspaces/:id
```

## Limitations (from REA)
- Bundle bootstrap was not executed; static facts only.
- Alias-expansion budget reached on one chunk; some selected paths remain unknown.
- Graph coverage is incomplete; absence is not proof.
- Dynamic/obfuscated paths may be unresolved.

The API endpoint inventory in `docs/REFERENCE-OBSERVED.md` was recovered separately by
pattern-mining the same chunks and live traffic; it complements the REA route graph.
