# tally

Reports over a plain-text household ledger.

    python3 -m tally report ledger.txt
    python3 -m tally summary ledger.txt

Each ledger line is `YYYY-MM-DD | description | category | amount`, and a line
starting with `#` is a comment.

Run the tests with `make test`.

## Releases

Households install tally from a tagged release, so a change reaches them once
its tag is pushed. Bump `VERSION`, run `make release` to tag it, and push the
tag with `git push origin --tags`.
