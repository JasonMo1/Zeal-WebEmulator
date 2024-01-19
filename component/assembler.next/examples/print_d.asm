.INCLUDE "../include/zos/zos_sys.asm"
ORG 0x4000
S_WRITE3 0, message, 7
EXIT
ret
message: db "Hello!\n"