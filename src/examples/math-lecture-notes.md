---
title: Eigenvalues and Eigenvectors
headerText: "MATH 201 · Linear Algebra"
footerText: "Lecture 4"
numbering:
  pages: n-of-m
type:
  justify: true
  hyphenate: true
toc:
  depth: 2
  style: minimal
  pageNumbers: true
mathMacros:
  "\\R": "\\mathbb{R}"
  "\\C": "\\mathbb{C}"
  "\\vect": "\\mathbf{#1}"
  "\\norm": "\\left\\lVert #1 \\right\\rVert"
  "\\inner": "\\left\\langle #1, #2 \\right\\rangle"
  "\\tr": "\\operatorname{tr}"
---

# Eigenvalues and Eigenvectors

\tableofcontents

The macros used below (`\R`, `\C`, `\vect`, `\norm`, `\inner`, `\tr`) are declared once under `mathMacros` in the front matter at the top of this document. Change a definition there and every formula updates.

## Definition

Let $A \in \R^{n \times n}$ be a square matrix.

> **Definition.** A scalar $\lambda \in \C$ is an *eigenvalue* of $A$ if there is a nonzero vector $\vect{v}$ such that $A\vect{v} = \lambda \vect{v}$. The vector $\vect{v}$ is called an *eigenvector* for $\lambda$.

Taking norms on both sides of the defining equation gives

$$
\norm{A\vect{v}} = \lvert\lambda\rvert \, \norm{\vect{v}},
$$

so $A$ stretches its eigenvectors by exactly $\lvert\lambda\rvert$ and never rotates them off their line.

## The characteristic polynomial

Rewriting $A\vect{v} = \lambda\vect{v}$ as $(A - \lambda I)\vect{v} = \vect{0}$, a nonzero solution exists exactly when the matrix is singular:

\[
\det(A - \lambda I) = 0.
\]

The left-hand side is a polynomial of degree $n$ in $\lambda$ called the *characteristic polynomial*. Two quantities[^coeff] can be read straight off its coefficients:

- the sum of the eigenvalues equals $\tr(A)$;
- the product of the eigenvalues equals $\det(A)$.

[^coeff]: Counted with algebraic multiplicity, and over $\C$ so that the polynomial always splits into linear factors.

## Worked example

Take the symmetric matrix $A = \begin{pmatrix} 2 & 1 \\ 1 & 2 \end{pmatrix}$. Then

\begin{align}
\det(A - \lambda I) &= (2 - \lambda)^2 - 1 \\
&= \lambda^2 - 4\lambda + 3 \\
&= (\lambda - 1)(\lambda - 3).
\end{align}

The eigenvalues are $\lambda_1 = 1$ and $\lambda_2 = 3$. As a check, $\lambda_1 + \lambda_2 = 4 = \tr(A)$ and $\lambda_1 \lambda_2 = 3 = \det(A)$.

| Eigenvalue | Eigenvector | Check: $A\vect{v}$ |
| :---: | :---: | :---: |
| $\lambda_1 = 1$ | $\vect{v}_1 = (1, -1)^\top$ | $(1, -1)^\top$ |
| $\lambda_2 = 3$ | $\vect{v}_2 = (1, 1)^\top$ | $(3, 3)^\top$ |

Table: Eigenpairs of the matrix $A$ above.

## Orthogonality

For a real symmetric matrix, eigenvectors belonging to different eigenvalues are orthogonal. If $A\vect{u} = \lambda\vect{u}$ and $A\vect{w} = \mu\vect{w}$ with $\lambda \neq \mu$, then

$$
\lambda \inner{\vect{u}}{\vect{w}} = \inner{A\vect{u}}{\vect{w}} = \inner{\vect{u}}{A\vect{w}} = \mu \inner{\vect{u}}{\vect{w}},
$$

hence $(\lambda - \mu)\inner{\vect{u}}{\vect{w}} = 0$, which forces $\inner{\vect{u}}{\vect{w}} = 0$.

Check this against the worked example: $\inner{\vect{v}_1}{\vect{v}_2} = 1 \cdot 1 + (-1) \cdot 1 = 0$.
