; SPDX-FileCopyrightText: 2023 JasonMo <jasonmo2009@hotmail.com>
; SPDX-License-Identifier: Apache-2.0

; Print "Hello!" on the screen, with macro support on asm80

ORG 0x4000

.MACRO SYSCALL
    rst 0x8
.ENDM

.MACRO WRITE
    ld l, 1
    SYSCALL
.ENDM

.MACRO S_WRITE3, dev, str, len
    ld h, dev
    ld de, str
    ld bc, len
    WRITE
.ENDM

.MACRO EXIT
    ld l, 15
    SYSCALL
.ENDM

S_WRITE3 0, message, 7
EXIT
ret
message: db "Hello!\n"