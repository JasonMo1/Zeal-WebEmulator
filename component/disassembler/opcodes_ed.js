/**
 * @brief This file contains all Z80 0xED instructions disassembly.
 */

/**
 * @brief Get the string equivalent of the given opcode (which is preceded by 0xED)
 *
 * @param snd Opcode, located after 0xED, to disassemble
 *
 * @returns Object of the form:
 *          { text: <disassembled_instruction>, size: 2 }
 */
function opcode_ED_x(snd, third, fourth) {
    const ed_opcodes = {
        0x57: "LD     A, I",
        0x5f: "LD     A, R",
        0x47: "LD     I, A",
        0x4f: "LD     R, A",
        0x4a: "ADC    HL, BC",
        0x5a: "ADC    HL, DE",
        0x6a: "ADC    HL, HL",
        0x7a: "ADC    HL, SP",
        0x42: "SBC    HL, BC",
        0x52: "SBC    HL, DE",
        0x62: "SBC    HL, HL",
        0x72: "SBC    HL, SP",
        0x6f: "RLD",
        0x4d: "RETI",
        0x45: "RETN",
        0x67: "RRD",
        0x44: "NEG",
        0x46: "IM 0",
        0x56: "IM 1",
        0x5e: "IM 2",
        0xa0: "LDI",
        0xb0: "LDIR",
        0xa8: "LDIR",
        0xb8: "LDDR",
        0xa1: "CPI",
        0xb1: "CPIR",
        0xa9: "CPD",
        0xb9: "CPDR",
        /* IN-related */
        0x40: "IN     B, (C)",
        0x48: "IN     C, (C)",
        0x50: "IN     D, (C)",
        0x58: "IN     E, (C)",
        0x60: "IN     H, (C)",
        0x68: "IN     L, (C)",
        0x70: "ILL",
        0x78: "IN     A, (C)",
        0xa2: "INI",
        0xb2: "INIR",
        0xaa: "IND",
        0xba: "INDR",
        /* OUT-related */
        0x41: "OUT    (C), B",
        0x49: "OUT    (C), C",
        0x51: "OUT    (C), D",
        0x59: "OUT    (C), E",
        0x61: "OUT    (C), H",
        0x69: "OUT    (C), L",
        0x71: "ILL",
        0x79: "OUT    (C), A",
        0xa3: "OUTI",
        0xb3: "OTIR",
        0xab: "OUTD",
        0xbb: "OTDR",
    };

    /* Index of each 16-bit pair for 16-bit LD loads */
    const regs_16 = ["BC", "DE", "HL", "SP"];

    /* Return the opcode from the table above, or 'ILL' if it doesn't exist */
    const text = ed_opcodes[snd] || "ILL";

    if (text != "ILL") {
        return { text, size: 2 };
    } else if ((snd & 0x4b) == 0x4b) {
        /* Special case for LD dd, (nn) */
        const reg_idx = (snd >> 4) & 3;
        const regs = regs_16[reg_idx];
        const nn = (fourth << 8) | third;
        return { text: `LD     ${regs}, (${nn})`, size: 4 };
    } else if ((snd & 0x43) == 0x43) {
        /* Special case for LD (nn), dd */
        const reg_idx = (snd >> 4) & 3;
        const regs = regs_16[reg_idx];
        const nn = (fourth << 8) | third;
        return { text: `LD     (${nn}), ${regs}`, size: 4 };
    }

    /* Return 'ILL' opcode */
    return { text, size: 2 };
}
