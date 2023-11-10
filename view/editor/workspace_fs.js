function WorkSpaceFileSystem() {
    function set(_name, _code) {
        localStorage.setItem(_name, _code);
    }

    function selectAllFileName() {
        let files = [];
        for (let i = 0; i < localStorage.length; i++) {
            files.push(localStorage.key(i));
        }
        return files;
    }

    function _displayAll() {
        for (let i = 0; i < localStorage.length; i++) {
            console.log(localStorage.getItem(localStorage.key(i)));
        }
    }

    async function _generateFile() {
        let urls = [
            { name: "print_a.asm", url: "../../component/assembler.next/examples/print_a.asm" },
            { name: "print_b.asm", url: "../../component/assembler.next/examples/print_b.asm" },
            { name: "print_c.asm", url: "../../component/assembler.next/examples/print_c.asm" },
            { name: "print_d.asm", url: "../../component/assembler.next/examples/print_d.asm" },
            { name: "compile.asm", url: "../../component/assembler.next/examples/compile.asm" },
            { name: "zos_err.asm", url: "../../component/assembler.next/include/zos_err.asm" },
            { name: "zos_sys.asm", url: "../../component/assembler.next/include/zos_sys.asm" },
            { name: "zos_video.asm", url: "../../component/assembler.next/include/zos_video.asm" },
            { name: "zos_keyboard.asm", url: "../../component/assembler.next/include/zos_keyboard.asm" },
        ];
        for (let icbf in urls) {
            set(urls[icbf].name, await fetch(urls[icbf].url).then((response) => response.text()));
        }
        setFileView();
    }


    this.select = (_name) => localStorage.getItem(_name);
    this.set = set;
    this.remove = (_name) => localStorage.removeItem(_name);
    this.selectAllFileName = selectAllFileName;
    this.removeAll = () => localStorage.clear();
    this._displayAll = _displayAll;
    this._generateFile = _generateFile;
}
