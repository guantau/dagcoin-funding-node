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

prepare-dev:
	$(SHELLCMD) scripts/prepare.sh development

prepare-test:
	$(SHELLCMD) scripts/prepare.sh testnet

prepare-live:
	$(SHELLCMD) scripts/prepare.sh live
