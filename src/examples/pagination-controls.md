---
title: Pagination Controls
breaks:
  h1: true
  h2: true
numbering:
  pages: n-of-m
smartKeep:
  codeLines: 20
  tableRows: 12
  listItems: 8
  quoteBlocks: 3
---

# Pagination Controls

This document is a guided tour of every way to control where pages break. Scroll the preview and compare each page with the source on the left.

The front matter above turns on **a new page before every H2** (`breaks.h2: true`) and raises the *Smart Keep* thresholds. Those keys are locked in the settings drawer while they appear in the front matter; remove them to get the controls back.

| Tool | Where it goes | Effect |
| :--- | :--- | :--- |
| `\newpage` | Alone on its own line | Forces a page break |
| `\nobreak` | Alone on its own line, before a heading | Suppresses that heading's automatic break |
| `{nobreak}` | At the end of a heading | Same as `\nobreak`, inline |
| `breaks.h1`, `breaks.h2` | Front matter or settings | Automatic break before H1 or H2 |
| `smartKeep.*` | Front matter or settings | Keep small blocks whole |

## Automatic heading breaks

This heading started a new page because `breaks.h2` is `true`. Every H2 in this document does the same, unless it opts out.

Page breaks are collapsed sensibly: consecutive breaks merge into one, and a `\newpage` right before a heading that already breaks never leaves a blank page.

## Opting out of a break {nobreak}

This H2 carries a `{nobreak}` marker, so it continues on the same page as the section above instead of starting a new one. Use it for short subsections that belong with the text before them.

\nobreak
## The same thing with a directive

A `\nobreak` line placed directly before a heading has the same effect. It is useful when you cannot or do not want to edit the heading text itself.

\newpage

## Explicit breaks

The `\newpage` line above forced a break before this heading. Because the heading also breaks automatically, you still get exactly one new page and no blank page in between.

\newpage

This paragraph starts a fresh page because a `\newpage` line directly precedes it, even though no heading follows. Directives written inside fenced code blocks are ignored, so you can document them safely:

```tex
\newpage
\nobreak
\tableofcontents
```

## Keeping blocks together

Code blocks, tables, lists and quotes up to the Smart Keep thresholds are moved to the next page as a whole instead of being split across two. Larger blocks are allowed to split.

| Step | Stage | Duration (min) |
| ---: | :--- | ---: |
| 1 | Checkout | 1 |
| 2 | Install dependencies | 3 |
| 3 | Lint | 2 |
| 4 | Type check | 2 |
| 5 | Unit tests | 6 |
| 6 | Build | 4 |
| 7 | End-to-end tests | 9 |
| 8 | Package | 2 |
| 9 | Deploy to staging | 5 |
| 10 | Smoke tests | 3 |

Table: A 10-row table stays in one piece because `smartKeep.tableRows` is 12.

```python
def moving_average(values, window):
    """Return the simple moving average of `values`."""
    if window <= 0:
        raise ValueError("window must be positive")
    out = []
    total = 0.0
    for i, v in enumerate(values):
        total += v
        if i >= window:
            total -= values[i - window]
        if i >= window - 1:
            out.append(total / window)
    return out
```

> A short quote spanning a single block is kept whole as well.

## Things to try {nobreak}

- Lower `smartKeep.tableRows` to 5 so the 10-row table is allowed to split.
- Set `breaks.h2` to `false` and watch the page count drop.
- Add a `\newpage` before the last section.
- Switch `page.size` to `A5` and see where the breaks move.
