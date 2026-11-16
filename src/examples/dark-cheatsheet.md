---
title: Git Cheat Sheet
docTheme: catppuccin-mocha
page:
  size: A4
  landscape: true
  marginMm:
    t: 14
    r: 14
    b: 16
    l: 14
numbering:
  pages: none
breaks:
  h1: false
type:
  body: Inter
  sizePt: 9.5
  leading: 1.35
smartKeep:
  codeLines: 20
  tableRows: 12
---

# Git Cheat Sheet

A dark, landscape reference sheet. The theme (`docTheme`), orientation (`page.landscape`), tight margins and smaller type all come from the front matter; page numbers are switched off with `numbering.pages: none`. Export with **Margins: None** so the dark background fills the whole sheet.

## Everyday commands

| Command | What it does |
| :--- | :--- |
| `git status -sb` | Short status with branch and tracking info |
| `git add -p` | Stage changes hunk by hunk |
| `git commit -m "msg"` | Commit the staged changes |
| `git commit --amend --no-edit` | Fold staged changes into the last commit |
| `git diff --staged` | Show what is about to be committed |
| `git log --oneline --graph` | Compact history with branch topology |
| `git restore <file>` | Discard unstaged changes in a file |
| `git restore --staged <file>` | Unstage a file, keeping the changes |

## Branches

| Command | What it does |
| :--- | :--- |
| `git switch -c <name>` | Create a branch and switch to it |
| `git switch -` | Jump back to the previous branch |
| `git branch -vv` | List branches with upstream and last commit |
| `git branch -d <name>` | Delete a merged branch |
| `git merge --no-ff <name>` | Merge and always create a merge commit |
| `git rebase -i HEAD~5` | Reorder, squash or edit the last five commits |

## Working with remotes

```bash
git clone --depth 1 <url>        # shallow clone, latest snapshot only
git fetch --all --prune          # update every remote, drop stale branches
git pull --rebase                # replay local commits on top of upstream
git push -u origin <branch>      # first push, sets the upstream
git push --force-with-lease      # safer force push
```

## Undo and recover

```bash
git reset --soft HEAD~1          # undo the commit, keep changes staged
git reset --hard origin/main     # match the remote exactly (destructive)
git revert <sha>                 # new commit that undoes <sha>
git reflog                       # every place HEAD has been; find lost work
git stash push -u -m "wip"       # shelve changes, including untracked files
git stash pop                    # bring the latest stash back
```

> **Tip.** `git reflog` keeps lost commits reachable for weeks. Before assuming something is gone, look there first.
