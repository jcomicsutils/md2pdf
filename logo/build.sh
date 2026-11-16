#!/usr/bin/env bash
# Builds logo-*, icon-* (mark only) and lockup-* (mark + name); requires xelatex
set -e
build() { # name flags
  xelatex -interaction=nonstopmode -halt-on-error -jobname="$1" "$2\\input{logo.tex}" >/dev/null
  pdftocairo -svg "$1.pdf" "$1.svg"
  pdftocairo -png -transp -singlefile -r 600 "$1.pdf" "$1"
  rm -f "$1.aux" "$1.log" "$1.pdf"
}
build logo-dark  '\def\DARK{}'
build logo-light ''
build icon-dark  '\def\DARK{}\def\ICON{}'
build icon-light '\def\ICON{}'
build lockup-dark  '\def\DARK{}\def\WORD{}'
build lockup-light '\def\WORD{}'
