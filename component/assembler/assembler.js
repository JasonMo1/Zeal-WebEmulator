function Assembler() {
    /**
        Compile modes:
        - 0         Make BIN binary(ZOS use this type of binaries)
        - 1         Make SNA binary
        - 2         Make TAP binary
        - 3         Return Array of BIN binary
        - 4         Return Array of SNA binary
        - 5         Return Array of TAP binary
        - "debug"   Log compile result on the console
    */
    const compile = function (mode, src) {
        let filename = getProgramName().split(".")[0];
        let asm80obj = compile_obj(src, Z80ASM);
        if (!src) {
            popup.error("Please save your program before assemble");
        } else {
            switch (asm80obj[0]) {
                case undefined:
                    popup.error("Internal error - " + asm80obj[0]);
                    break;
                case null:
                    var opcodes = asm80obj[1];
                    switch (mode) {
                        case 0:
                            downloadBinary(
                                filename + ".bin",
                                make_bin(opcodes[0]),
                            );
                            break;
                        case 1:
                            downloadBinary(
                                filename + ".sna",
                                make_sna(opcodes[0]),
                            );
                            break;
                        case 2:
                            downloadBinary(
                                filename + ".tap",
                                make_tap(opcodes[0]),
                            );
                            break;
                        case 3:
                            return make_bin(opcodes[0]);
                        case 4:
                            return make_sna(opcodes[0]);
                        case 5:
                            return make_tap(opcodes[0]);
                        case "debug":
                            console.log(opcodes);
                            break;
                    }
                    break;
                default:
                    popup.error(
                        asm80obj[0].msg + "\nLine: " + asm80obj[0].s.numline,
                    );
            }
        }
    };

    const compile_obj = function (src, cpu) {
        return ASM.compile(src, cpu);
    };

    const make_sna = function (asm80obj) {
        return makeSNA(asm80obj);
    };

    const make_tap = function (asm80obj) {
        return makeTAP(asm80obj);
    };

    const make_bin = function (asm80obj) {
        return ASM.buff(asm80obj);
    };

    this.compile = compile;
    this.compile_obj = compile_obj;
    this.make_sna = make_sna;
    this.make_tap = make_tap;
    this.make_bin = make_bin;
}
