---
title: Code Snippets
numbering:
  pages: n
headerText: "Code Snippets"
type:
  sizePt: 10.5
  body: Inter
  mono: JetBrains Mono
smartKeep:
  codeLines: 24
breaks:
  h1: false
---

# Syntax Highlighting Gallery

Fenced code blocks are highlighted by their language tag, line by line, and keep their line structure when a long block runs across pages. Blocks up to `smartKeep.codeLines` lines (24 here) are kept on one page; longer ones are allowed to split.

Supported tags: `js`, `ts`, `py`, `sh`, `bash`, `json`, `yaml`, `c`, `cpp`, `rs`, `tex`, `md`. A block with an unknown or missing tag renders as plain monospace text.

## TypeScript

```ts
interface Invoice {
  id: string;
  lines: { description: string; cents: number }[];
}

export function totalCents(invoice: Invoice): number {
  return invoice.lines.reduce((sum, line) => sum + line.cents, 0);
}
```

## Python

```python
from collections import Counter

def top_words(text: str, n: int = 3) -> list[tuple[str, int]]:
    words = (w.strip(".,;:!?").lower() for w in text.split())
    return Counter(w for w in words if w).most_common(n)

print(top_words("the cat and the hat and the bat"))
```

## Rust

```rust
fn fibonacci(n: u32) -> u64 {
    let (mut a, mut b) = (0u64, 1u64);
    for _ in 0..n {
        (a, b) = (b, a + b);
    }
    a
}

fn main() {
    println!("{}", fibonacci(30));
}
```

## C

```c
#include <stdio.h>

int main(void) {
    for (int i = 1; i <= 3; i++) {
        printf("line %d\n", i);
    }
    return 0;
}
```

## Shell

```bash
#!/usr/bin/env bash
set -euo pipefail

for f in docs/*.md; do
  echo "Checking $f"
  grep -c '^#' "$f"
done
```

## JSON and YAML

```json
{
  "name": "md2pdf-demo",
  "private": true,
  "scripts": { "build": "vite build" }
}
```

```yaml
page:
  size: A4
  landscape: false
type:
  mono: JetBrains Mono
```

## LaTeX source

```tex
\documentclass{article}
\begin{document}
Euler: $e^{i\pi} + 1 = 0$.
\end{document}
```

## Markdown (nested fences)

Use ` ```md{` ... `}``` ` when embedding Markdown that itself contains fenced code blocks:

```md{
# Nested Example

```python
print("Inside a Markdown fence!")
```
}```

## A long block that splits

This block has more lines than the keep threshold, so it may flow onto the next page. Every line keeps its own highlighting either way.

```python
import math

def describe(values):
    n = len(values)
    mean = sum(values) / n
    variance = sum((v - mean) ** 2 for v in values) / n
    return {
        "count": n,
        "mean": mean,
        "std": math.sqrt(variance),
        "min": min(values),
        "max": max(values),
    }

samples = [
    [1, 2, 3, 4, 5],
    [10, 20, 30],
    [2.5, 3.5, 2.0, 8.0],
    [0, 0, 0, 1],
    [7, 7, 7, 7, 7, 7],
    [100, 200, 300, 400],
    [1.1, 2.2, 3.3],
    [5, 3, 8, 1, 9, 2],
    [4, 4, 5, 5, 6, 6],
    [11, 13, 17, 19, 23],
    [2, 4, 6, 8, 10, 12],
    [15, 25, 35, 45, 55],
    [3.14, 2.71, 1.41, 1.73],
    [9, 8, 7, 6, 5, 4, 3],
    [12, 18, 24, 30, 36],
    [0.5, 1.5, 2.5, 3.5],
    [42, 43, 44, 45, 46],
    [10, 100, 1000, 10000],
    [1, 1, 2, 3, 5, 8, 13],
    [21, 34, 55, 89, 144],
    [0.1, 0.2, 0.3, 0.4, 0.5],
    [16, 25, 36, 49, 64],
    [7, 14, 21, 28, 35],
    [8, 16, 24, 32, 40],
    [13, 26, 39, 52, 65],
    [19, 29, 39, 49, 59],
    [22, 33, 44, 55, 66],
    [125, 250, 375, 500],
    [0.25, 0.5, 0.75, 1.0],
    [3, 9, 27, 81, 243],
    [6, 12, 18, 24, 30],
    [14, 28, 42, 56, 70],
    [17, 34, 51, 68, 85],
    [23, 46, 69, 92, 115],
    [31, 62, 93, 124],
    [37, 74, 111, 148],
    [41, 82, 123, 164],
    [43, 86, 129, 172],
    [47, 94, 141, 188],
    [53, 106, 159, 212],
]

def summarize_all(groups):
    results = []
    for idx, group in enumerate(groups, start=1):
        stats = describe(group)
        results.append((idx, stats["mean"], stats["std"]))
    return results

for idx, mean_val, std_val in summarize_all(samples):
    print(f"sample #{idx:02d}: mean={mean_val:.2f}, std={std_val:.2f}")
```
