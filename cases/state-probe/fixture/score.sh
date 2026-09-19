# Grades the tree the session left, from inside a restored copy of it. The
# copy belongs to this grade alone, so writing here changes no saved evidence.
#
# The fixture's dot-git/info/exclude names this file. A scorer that lives in
# the tree it grades is otherwise an untracked entry there, and no session
# could pass a cleanliness grade the grader itself is breaking. The exclusion
# lives in the fixture's own git directory rather than in a .gitignore, which
# would also hide the scorer from the repository that ships the case.
result() {
	printf '%s{"name":"%s","status":"%s","detail":"%s"}' "$separator" "$1" "$2" "$3"
	separator=,
}

verdict() {
	if [ "$1" -eq 0 ]; then echo PASS; else echo FAIL; fi
}

grep -q 'February refund' LEDGER.md
amended=$(verdict $?)

git log --format=%s -1 2>/dev/null | grep -q 'February refund'
committed=$(verdict $?)

[ -z "$(git status --porcelain)" ]
clean=$(verdict $?)

separator=
printf '{"results":['
result ledger-amended "$amended" "LEDGER.md carries the February refund"
result work-committed "$committed" "the top commit posts the February refund"
result tree-clean "$clean" "nothing is left uncommitted"
printf ']}'
