---
name: commit
description: Stage and commit pending changes using conventional commits with no attribution or emojis
---

When the user invokes this skill, follow these steps.

1. Run `git status --short`, `git diff --stat`, and `git log --oneline -5` in parallel to see what's pending and the recent commit-message style on this branch.

2. Group related changes. If multiple distinct concerns are pending (e.g. a schema change plus an unrelated docs tidy), propose a split into multiple commits and ask the user to confirm the split before proceeding. Prefer focused commits over one large blob.

3. For each commit, draft a message. Apply the `editorial` skill to the body before writing it (frame the reader as a teammate reading this commit in six months; cut decoration; concrete over abstract). Mechanical rules:
   - Conventional prefix: one of `feat:` / `fix:` / `refactor:` / `chore:` / `docs:` / `test:` / `style:`
   - Subject line **≤ 50 characters**, capitalised, imperative mood, **no trailing period**
   - Blank line between subject and body
   - Body wrapped at **72 characters**, explaining **what** changed and **why** (not how - the code shows how)
   - **NO** emojis anywhere
   - **NO** "Generated with Claude Code" footer
   - **NO** "Co-Authored-By: Claude" footer

4. Stage files explicitly by name. Never use `git add -A`, `git add .`, or `git add -u` unless every modified file genuinely belongs in the commit and the user has confirmed.

5. Commit using a HEREDOC so the body's wrapping and blank line are preserved:

```bash
git commit -m "$(cat <<'EOF'
type: Subject line capitalised no period

Body paragraph wrapped at 72 characters that explains what
the change does and why it was needed.
EOF
)"
```

6. After each commit, run `git status` to confirm a clean staging area and show the user the new HEAD.

7. Never push to a remote. Never amend an existing commit unless the user explicitly asks for `--amend`. If a pre-commit hook fails, fix the underlying issue and create a NEW commit - do not skip hooks with `--no-verify`.

8. If staged files look like they might contain secrets (`.env`, `credentials.json`, files with `*secret*` / `*token*` / `*key*` in the name), pause and warn the user before committing.