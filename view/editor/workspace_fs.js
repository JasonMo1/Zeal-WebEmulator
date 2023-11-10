function WorkSpaceFileSystem() {
    /**
     * MOVED TO: https://github.com/iFind/html5MultidimensionalStorage
     *
     * This methods extends the default HTML5 Storage object and add support
     * to set and get multidimensional data
     *
     * @example Storage.setObj('users.albums.sexPistols',"blah");
     * @example Storage.setObj('users.albums.sexPistols',{ sid : "My Way", nancy : "Bitch" });
     * @example Storage.setObj('users.albums.sexPistols.sid',"Other songs");
     *
     * @example Storage.getObj('users');
     * @example Storage.getObj('users.albums');
     * @example Storage.getObj('users.albums.sexPistols');
     * @example Storage.getObj('users.albums.sexPistols.sid');
     * @example Storage.getObj('users.albums.sexPistols.nancy');
     *
     * This is just a prototype and is not recommended to use at production apps
     * USE AT YOUR OWN RISK
     *
     * @author Klederson Bueno <klederson@klederson.com>
     * @author Gabor Zsoter <helo@zsitro.com>
     **/
    function patch_localStorage() {
        Storage.prototype.__walker = function (path, o) {
            // Validate if path is an object otherwise returns false
            if (typeof path !== "object") return undefined;

            if (path.length === 0) {
                return o;
            }

            for (var i in path) {
                var prop = path[i];
                // Check if path step exists
                if (o.hasOwnProperty(prop)) {
                    var val = o[prop];
                    if (typeof val == "object") {
                        path.splice(0, 1);
                        return this.__walker(path, val);
                    } else {
                        return val;
                    }
                }
            }
        };

        Storage.prototype.setObj = function (key, value, walk=true) {
            var path = walk ? key.split(".") : [key];

            // First level is always the localStorage key pair item
            var _key = path[0];
            var os = this.getItem(_key) !== null ? JSON.parse(this.getItem(_key)) : null; //general storage key pair element
            path.splice(0, 1);

            if (os === null) {
                os = {};
                this.setItem(_key, JSON.stringify(os));
            }

            var innerWalker = function (path, o) {
                // Validate if path is an object otherwise returns false
                if (typeof path !== "object") return undefined;

                if (path.length == 1) {
                    o[path[0]] = value;
                    return o;
                } else if (path.length === 0) {
                    os = value;
                    return os;
                }

                var val = null;

                for (var i in path) {
                    var prop = path[i];
                    // Check if path step exists
                    if (o.hasOwnProperty(prop)) {
                        val = o[prop];
                        if (typeof val == "object") {
                            path.splice(0, 1);
                            return innerWalker(path, val);
                        }
                    } else {
                        //create depth
                        o[prop] = {};
                        val = o[prop];
                        path.splice(0, 1);
                        return innerWalker(path, val);
                    }
                }
            };

            innerWalker(path, os);

            this.setItem(_key, JSON.stringify(os));
        };

        Storage.prototype.getObj = function (key, walk=true) {
            key = walk ? key.split("."): [key];

            //First level is always the localStorage key pair item
            var _key = key[0];
            var o = this.getItem(_key) ? JSON.parse(this.getItem(_key)) : null;

            if (o === null) return undefined;

            key.splice(0, 1);

            return this.__walker(key, o);
        };
    }

    function select(_name, walk=true) {
        return localStorage.getObj(path.getFullName(_name), walk);
    }

    /**
     *
     * @param {*} _name
     * @param {*} _type
     * @param {*} _code
     * @param {*} _index
     */
    function set(_name, _type, _code = null, _index = null) {
        localStorage.setObj(path.getFullName(_name), { type: _type, code: _code, index: _index }, false);
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
            console.log(localStorage.getObj(localStorage.key(i)));
        }
    }

    async function _generateFile() {
        let urls = [
            { name: "/examples/print_a.asm", url: "../../component/assembler.next/examples/print_a.asm" },
            { name: "/examples/print_b.asm", url: "../../component/assembler.next/examples/print_b.asm" },
            { name: "/examples/print_c.asm", url: "../../component/assembler.next/examples/print_c.asm" },
            { name: "/examples/print_d.asm", url: "../../component/assembler.next/examples/print_d.asm" },
            { name: "/examples/compile.asm", url: "../../component/assembler.next/examples/compile.asm" },
            { name: "/include/zos/zos_err.asm", url: "../../component/assembler.next/include/zos_err.asm" },
            { name: "/include/zos/zos_sys.asm", url: "../../component/assembler.next/include/zos_sys.asm" },
            { name: "/include/zos/zos_video.asm", url: "../../component/assembler.next/include/zos_video.asm" },
            { name: "/include/zos/zos_keyboard.asm", url: "../../component/assembler.next/include/zos_keyboard.asm" },
        ];
        for (let icbf in urls) {
            set(
                urls[icbf].name,
                await fetch(urls[icbf].url)
                    .then((response) => response.text())
                    .catch((error) => popup.error(error)),
            );
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
    };

    patch_localStorage();
    this.select = select;
    this.selectCode = (_name) => select(_name, false).code;
    this.set = set;
    this.remove = (_name) => localStorage.removeItem(path.getFullName(_name));
    this.selectAllFileName = selectAllFileName;
    this.removeAll = () => localStorage.clear();
    this._displayAll = _displayAll;
    this._generateFile = _generateFile;
    this.path = path;
}
