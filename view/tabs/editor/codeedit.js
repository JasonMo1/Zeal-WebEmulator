function openFile(_filename) {
    if (onblock === false) {
        editor.latestfile = editor.thisfile;
        editor.thisfile = _filename;
        $("#filenametab").html(editor.thisfile);
        editor.setValue(wfs.selectCode(_filename));
    }
}

function saveFile(_filename, _code) {
    onblock = true;
    if (_filename === "") {
        popup.error("No filename inputted");
    }
    else if (!wfs.path.avilable(_filename)) {
        popup.error("Unavilable filename");
    }
    else {
        wfs.set(_filename, { name: _filename, volume: _code, last_modified: new Date(), created: new Date() });
        setFileView();
        popup.log("Saved " + _filename);
    }
    onblock = false;
}

function deleteFile(_filename) {
    onblock = true;
    editor.thisfile = null;
    wfs.remove(_filename);
    popup.log("Deleted " + _filename);
    setFileView();
    onblock = false;
}

function downloadFile(_filename) {
    onblock = true;
    if (editor.thisfile === _filename) {
        downloadString(editor.thisfile, editor.getValue());
    } else {
        downloadString(_filename, wfs.selectCode(_filename));
    }
    onblock = false;
}

function compileFile(_filename) {
    assembler.compile(0, wfs.selectCode(_filename), _filename.split(".")[0]);
}

function loadFile(_filename) {
    onblock = true;
    let bin = assembler.compile(3, wfs.selectCode(_filename), _filename.split(".")[0]);
    if (bin.length > 16384) {
        popup.error("Your binary is too big to load");
    } else {
        // Please use \r (ascii 13) instead of \n (ascii 10)
        zealcom.keyboard.str_press("LOAD " + bin.length + "\r");
        setTimeout(function () {
            zealcom.uart.send_binary_array(bin);
        }, 10);
    }
    onblock = false;
}

function setFileView() {
    onblock = false;
    let files = wfs.selectAllFileName();
    let result = "";
    result += '<section class="files">';
    for (var i in files) {
        let filename = files[i];
        result += `
        <div class="file" data-filename="${filename}">
          <div>${filename}</div>
        </div>`;
    }
    result += "</section>";

    $("#code-files").html(result);

    $(".file").on("click", function () {
        openFile($(this).data("filename"));
    });
}

$("#downasm").on("click", function () {
    downloadFile(editor.thisfile);
});

$("#savecode").on("click", function () {
    let _filename = wfs.path.endsWith($("#progname").val(), ".asm") ?? editor.thisfile;
    saveFile(_filename, editor.getValue());
    editor.thisfile = _filename;
    $("#filenametab").html(editor.thisfile);
});

$("#delcode").on("click", function () {
    deleteFile(editor.thisfile);
    editor.setValue("");
    $("#filenametab").html("No file opened");
});

$("#asmcode").on("click", function () {
    compileFile(editor.thisfile);
});

$("#loadcode").on("click", function () {
    loadFile(editor.thisfile);
});

$(document).ready(setFileView);
