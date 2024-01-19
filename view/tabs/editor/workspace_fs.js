function WorkSpaceFileSystem() {
    const isPrivate = (filename) => filename.startsWith('[private]');

    function select(_name) {
        return localStorage.getObj(path.getFullName(_name));
    }

    function set(key, value) {
        localStorage.setObj(path.getFullName(key), value);
        console.log(path.getFullName(key));
    }

    function selectAllFileName() {
        let files = [];
        for (let i = 0; i < localStorage.length; i++) {
            let f = localStorage.key(i);
            if (!isPrivate(f)) {
                files.push(f);
            }
        }
        return files;
    }

    function _displayAll() {
        for (let i = 0; i < localStorage.length; i++) {
            let name = localStorage.key(i);
            if (!isPrivate(name)) {
                console.log(localStorage.getObj(name));
            }
        }
    }

    async function _generateFile() {
        const local_example_dir = '../../component/assembler.next/examples';
        const local_include_dir = '../../component/assembler.next/include';
        const urls = [
            // Examples
            { name: `/examples/compile.asm`, url: `${local_example_dir}/compile.asm` },
            { name: `/examples/print_a.asm`, url: `${local_example_dir}/print_a.asm` },
            { name: `/examples/print_b.asm`, url: `${local_example_dir}/print_b.asm` },
            { name: `/examples/print_c.asm`, url: `${local_example_dir}/print_c.asm` },
            { name: `/examples/print_d.asm`, url: `${local_example_dir}/print_d.asm` },
            // Zeal-8-bit-OS Headers
            { name: `/include/zos/zos_sys.asm`, url: `${local_include_dir}/zos/zos_sys.asm` },
            { name: `/include/zos/README.md`, url: `${local_include_dir}/zos/README.md` },
        ];
        for (let i in urls) {
            let _volume = await fetch(urls[i].url)
                .then( res => res.text() );
            let file = { name: urls[i].name, volume: _volume, last_modified: new Date(), created: new Date() };
            set(urls[i].name, file);
        }
        setFileView();
    }

    const path = {
        join: function (_this, _target, is_file) {
            if (_target.startsWith("/")) {
                return _target;
            } else {
                _this = _this.split("/");
                _target = _target.split("/");
                if (is_file) _this.pop();
                for (let i in _target) {
                    if (_target[i] === ".") {
                        continue;
                    } else if (_target[i] === "..") {
                        _this.pop();
                    } else {
                        _this.push(_target[i]);
                    }
                }
                _this = _this.join("/");
            }
            return _this;
        },

        endsWith: function (_src, _ends_with) {
            let _file_name = _src;
            if (_src != "") {
                if (!_src.endsWith(_ends_with)) {
                    _file_name += _ends_with;
                }
            }
            return _file_name;
        },

        getShortName: function (_src) {
            if (_src.startsWith("/")) {
                _src = _src.substring(1);
            }
            return _src;
        },

        getFullName: function (_src) {
            if (!_src.startsWith("/")) {
                _src = "/" + _src;
            }
            return _src;
        },

        dirSorter: function (_src) {
            let dirs = [];
            let regx = /\/\w+\//;
            for (i in _src) {
                if (regx.test(_src[i]) === true) {
                    let thisindex = _src[i].split("/");
                    dirs.push(thisindex[0]);
                    this.dirSorter([]);
                } else {
                    continue;
                }
            }
        },

        avilable: function (_src) {
            _src = _src.split("/");
            let res = true;
            let regex = /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)?$/;
            _src.forEach((element) => {
                res = res && regex.test(element);
            });
            if (localStorage.getObj(this.getFullName(_src.join("/")))) {
                res = false;
            }
            console.log(res);
            return res;
        }
    };

    this.select = select;
    this.selectCode = (_name) => select(_name).volume;
    this.set = set;
    this.remove = (_name) => localStorage.removeItem(path.getFullName(_name));
    this.selectAllFileName = selectAllFileName;
    this.removeAll = () => localStorage.clear();
    this._displayAll = _displayAll;
    this._generateFile = _generateFile;
    this.path = path;
}
