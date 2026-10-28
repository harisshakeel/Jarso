# Lessons

Patterns learned from corrections. Review at session start.

- Use Biome for lint + format, not ESLint/Prettier.
- Structure must be production-grade and scalable: feature modules, thin route layer, typed boundaries.
- Use index barrels for every module; keep server-only exports in a separate `server/index.ts` barrel.
- Exclude `*.md` from Biome — it reformatted a user-provided doc.
- Check for incoming remote changes before finishing (`git fetch`); REQUIREMENTS.md arrived mid-task.
