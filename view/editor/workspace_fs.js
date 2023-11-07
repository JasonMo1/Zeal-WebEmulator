function WorkSpaceFileSystem() {
    const set = (_filename, _code) => localStorage.setItem(path.getFullName(_filename), _code);

    function selectAll() {
        let files = [];
        for (let i = 0; i < localStorage.length; i++) {
            files.push({
                filename: localStorage.key(i), 
                code: localStorage.getItem(localStorage.key(i))
            });
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
            { name: "wfs://printadis.asm",      url: "../../component/assembler.next/examples/printadis.asm"},
            { name: "wfs://printzeal.asm",      url: "../../component/assembler.next/examples/printzeal.asm"},
            { name: "wfs://compilable.asm",     url: "../../component/assembler.next/examples/compilable.asm"},
            { name: "wfs://zos_err.asm",        url: "../../component/assembler.next/include/zos_err.asm"},
            { name: "wfs://zos_keyboard.asm",   url: "../../component/assembler.next/include/zos_keyboard.asm"},
            { name: "wfs://zos_sys.asm",        url: "../../component/assembler.next/include/zos_sys.asm"},
            { name: "wfs://zos_video.asm",      url: "../../component/assembler.next/include/zos_video.asm"}
        ]
        for (var icbf in urls) {
            set(urls[icbf].name, await fetch(urls[icbf].url).then(response => response.text()));
        }
        setFileView();
    }

    const path = {
        join: function(_this, _target, is_file) {
            if (_target.startsWith("wfs://")) {
                return _target;
            }
            else {
                _this = _this.split("/");
                _target = _target.split("/");
                if (is_file) _this.pop();
                for (var i in _target) {
                    if (_target[i] === ".") {
                        continue;
                    } 
                    else if (_target[i] === "..") {
                        _this.pop();
                    } 
                    else {
                        _this.push(_target[i]);
                    }
                }
                _this = _this.join("/");
            }
            return _this;
        },

        endsWith: function(_src, _ends_with, _if_src_empty=null) {
            let _file_name = _src;
            if (_src != "") {
                if (!_src.endsWith(_ends_with)) {
                    _file_name += _ends_with;
                }
            }
            else if (_src === "") {
                if (_if_src_empty != null) {
                    _file_name = _if_src_empty;
                }
                else {
                    popup.error("Do not allow empty filename");
                }
            }
            return _file_name;
        },

        getShortName: function(_src) {
            if (_src.startsWith("wfs://")) {
                _src = _src.substring(6);
            }
            return _src;
        },

        getFullName: function(_src) {
            if (!_src.startsWith("wfs://")) {
                _src = "wfs://" + _src;
            }
            return _src;
        }
    }
    
    this.select = (_filename) => localStorage.getItem(path.getFullName(_filename));
    this.set = set;
    this.remove = (_filename) => localStorage.removeItem(path.getFullName(_filename));
    this.selectAll = selectAll;
    this.removeAll = () => localStorage.clear();
    this._displayAll = _displayAll;
    this._generateFile = _generateFile;
    this.path = path;
}
