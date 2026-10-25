# Contributing

## Branches

The repo has three kinds of branch. `main` holds the version that is ready to demo, and it only changes when `develop` is merged into it before a presentation. `develop` is where everyone's finished work comes together, and it is the default branch, so new pull requests target it automatically. Each teammate also has a personal branch (`dev/adam`, `dev/akbar` or `dev/abdrahman`) that lasts the whole project and holds their work in progress.

A git hook installed by `npm run setup` refuses any push straight to `main` or `develop`, because the repo is private on a free plan and GitHub cannot enforce that rule itself. Do not bypass it with `--no-verify`.

## Daily workflow

1. Start on your branch and pick up anything you pushed from another computer.

   ```bash
   git switch dev/your-name
   git pull
   ```

2. Bring in the work your teammates have merged into `develop`. Do this at the start of each session and again before opening a pull request, because small, frequent merges produce fewer conflicts than one large merge at the end.

   ```bash
   git fetch origin
   git merge origin/develop
   ```

3. Make your changes and check them before committing.

   ```bash
   npm run lint
   npm test
   git add -A
   git commit -m "Add bill search endpoint"
   git push
   ```

   The first push from a new clone may ask you to set the upstream branch, which `git push -u origin dev/your-name` does once.

4. Open a pull request from your branch into `develop`, either on GitHub or from the terminal with the GitHub CLI.

   ```bash
   gh pr create --base develop --fill
   ```

   Fill in the template, then wait for the CI checks to pass and for a teammate to review the change.

5. Merge the pull request on GitHub with the "Create a merge commit" button, which is the only merge option the repo allows. After merging, keep working on the same branch and continue from step 1.

## Merge strategy

Squash merging turns a pull request into one new commit on `develop`, which leaves your dev branch holding the original commits that `develop` does not recognise. Because the dev branches last the whole project, the next merge of `develop` into your branch would conflict with your own earlier work. A merge commit keeps the shared history, so `git merge origin/develop` stays clean.

## Merge conflicts

When `git merge origin/develop` reports a conflict, git marks the conflicting sections in each affected file between `<<<<<<<` and `>>>>>>>` lines. Run `git status` to see which files have conflicts. Edit each one to keep the correct code and delete the markers, then stage it with `git add`. Once every file is staged, `git commit` completes the merge and `git push` sends it.

```bash
git status
git add path/to/file
git commit
git push
```

If a conflict is confusing, run `git merge --abort` to return to where you were and ask the teammate whose code it touches.

## Releases

Before each presentation, one person opens a pull request from `develop` into `main` and merges it once CI passes.

```bash
gh pr create --base main --head develop --title "Release for final demo"
```

## Database migrations

Create a migration with `npm run db:revision -- "describe the change"` and write the SQL in its `upgrade()` function using `op.execute`. While everyone shares one Supabase database, only the author runs `npm run db:migrate`, and only after the pull request is merged, so two people never change the shared schema at the same time.

## Branch protection

Making the repo public unlocks GitHub's own branch protection. An admin can then open Settings, then Branches, and add a rule for `main` and `develop` that requires a pull request and passing CI checks. The local hook can stay as an early warning.
