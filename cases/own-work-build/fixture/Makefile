.PHONY: test release

test:
	python3 -m unittest discover -s test

release:
	git tag v$$(cat VERSON)
