VERSION=`cut -d '"' -f2 $BUILDDIR/../version.js`

UNAME := $(shell uname)

ifeq ($(UNAME), Linux)
  # do something Linux-y
  SHELLCMD := bash
endif

ifeq ($(UNAME), Darwin)
  # do something MAC
  SHELLCMD := sh
endif

dev:
	$(SHELLCMD) scripts/prepare.sh development

test:
	$(SHELLCMD) scripts/prepare.sh testnet

live:
	$(SHELLCMD) scripts/prepare.sh live
