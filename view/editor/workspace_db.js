function WorkspaceDB() {
    let dbConnection = new JsStore.Connection(new Worker('../../component/jsstore/jsstore.worker.min.js'));
    let dbName = 'zwe-editor-workspace';
    let tableName = "file";

    function sorter_file(_filename) {
        return { from: 'file', where: { filename: _filename } } 
    };

    function sorter_insert_file(_codefile) {
        return { into: "file", values: [_codefile] }
    }

    function sorter_all() {
        return { from: 'file' };
    };

    function init() {
        let dbTable = {
            name: tableName,
            columns: {
                filename:{ primaryKey: true, dataType: "string", autoIncrement: false, unique: true },
                code:  { notNull: true, dataType: "string" }
            }
        };
        let db = {
            version: 3,
            name: dbName,
            tables: [dbTable]
        }
        const isDbCreated = dbConnection.initDb(db);
        if (isDbCreated === true) {
            console.log("WorkspaceDataBase created");
        }
        else {
            console.log("WorkspaceDataBase opened");
        }
    }

    function _displayAll() {
        var results = dbConnection.select(sorter_all());
        console.log(results);
    }

    function _dropDB() {
        dbConnection.dropDb()
            .then(console.log('Db deleted successfully, please refresh the page'))
            .catch(function(error) { console.error(error) });
    }

    async function _generateFile() {
        const charStr = 'abacdefghjklmnopqrstuvwxyzABCDEFGHJKLMNOPQRSTUVWXYZ0123456789';
        const min = 0;
        const max = 61;
        function _generateIndex(min, max, i) {
            const index = Math.floor(Math.random() * (max - min + 1) + min);
            const numStart = charStr.length - 10;
            if (i === 0 && index >= numStart) {
                return _generateIndex(min, max, i);
            }
            return index;
        }
        function _generateString(len) {
            let str = '';
            len = len || 15;
            for (let i = 0, index; i < len; i++) {
                index = _generateIndex(min, max, i);
                str += charStr[index];
            }
            return str;
        }
        let codefiles = [
            {
                filename: 'printtest.asm',
                code: await fetch('../../component/assembler/examples/printadis.asm').then(response => response.text())
            },
            {
                filename: 'nowfile.asm',
                code: editor.getValue()
            }
        ];
        for (let i = 0; i < 10; i++) {
            codefiles.push({
                filename: _generateString(Math.round(Math.random() * 9)) + '.asm',
                code: _generateString(1000)
            });
        }
        try {
            for (let i = 0; i < codefiles.length; i++) {
                await wdb.insertFile(codefiles[i]);
            }
            setFileView();
        } 
        catch (error) {
            popup.error(error.message);
        }
    }

    this.init = init;
    this.select = (_sorter) => dbConnection.select(_sorter);
    this.insert = (_sorter) => dbConnection.insert(_sorter);
    this.remove = (_sorter) => dbConnection.remove(_sorter);
    this.selectFile = (_filename) => dbConnection.select(sorter_file(_filename));
    this.insertFile = (_codefile) => dbConnection.insert(sorter_insert_file(_codefile))
    this.removeFile = (_filename) => dbConnection.remove(sorter_file(_filename));
    this.selectAll = () => dbConnection.select(sorter_all());
    this.removeAll = () => dbConnection.remove(sorter_all());
    this._displayAll = _displayAll;
    this._dropDB = _dropDB;
    this._generateFile = _generateFile;

    init();
}
