# Assembly header file for z88dk's z80asm assembler

> [!WARNING]
> The headers in this directory are not complete. They are only a starting point for the assembler, only `.MACRO` are supported.

In this directory, you will find some assembly file, that acts as an header file. Indeed, it shall be included by any assembly project targeting Zeal 8-bit OS.

This file is fairly simple, it contains macros for all the syscalls available in Zeal 8-bit OS kernel. For more info about each of them, check the header file directly.

## Usage

The following line needs be added at the top of the assembly file using Zeal 8-bit OS syscalls:

```assembly
    .INCLUDE "headers/zos/zos_sys.asm"
```
