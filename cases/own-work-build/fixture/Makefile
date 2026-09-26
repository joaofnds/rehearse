.PHONY: test release

test:
	python3 -m unittest tests.test_ledger

release:
	git tag v$$(cat VERSON)
