function openFile(_filename) {
    if (file_blocking === false) {
        editor.latestfile = editor.thisfile;
        editor.thisfile = _filename;
        $('#filenametab').html(editor.thisfile);
        editor.setValue(wfs.select(_filename));
    }
}

function saveFile(_filename, _code) {
    file_blocking = true;
    wfs.set(_filename, _code);
    setFileView();
    popup.log('Saved ' + _filename);
    file_blocking = false;
}

function deleteFile(_filename) {
    file_blocking = true;
    editor.thisfile = null;
    wfs.remove(_filename);
    popup.log("Deleted " + _filename);
    setFileView();
    file_blocking = false;
}

function downloadFile(_filename) {
    file_blocking = true;
    if (editor.thisfile === _filename) {
        downloadString(editor.thisfile, editor.getValue());
    }
    else {
        downloadString(_filename, wfs.select(_filename));
    }
    file_blocking = false;
}

function compileFile(_filename) {
    assembler.compile(0, wfs.select(_filename), _filename.split(".")[0]);
}

function loadFile(_filename) {
    file_blocking = true;
    let bin = assembler.compile(3, wfs.select(_filename), _filename.split(".")[0]);
    if (bin.length > 16384) {
        popup.error("Your binary is too big to load");
    }
    else {
        // Please use \r (ascii 13) instead of \n (ascii 10)
        zealcom.keyboard.str_press("LOAD " + bin.length + "\r");
        setTimeout(function() {
            zealcom.uart.send_binary_array(bin);
        }, 10);
    }
    file_blocking = false;
}

function setFileView() {
    file_blocking = false;
    let files = wfs.selectAll();
    let result = "";
    result += '<section class="files">';
    for (var i in files) {
        let filename = wfs.path.getShortName(files[i].filename);
        result += `
        <div class="file" data-filename="${filename}">
          <div>${filename}</div>
        </div>`;
    }
    result += "</section>";

    $("#code-files").html(result);

    $(".file").on("click", function() {
        openFile($(this).data("filename"));
    });
}

$("#downasm").on("click", function() {
    downloadFile(editor.thisfile);
});

$("#savecode").on("click", function() {
    let _filename = wfs.path.endsWith($("#progname").val(), ".asm", editor.thisfile);
    saveFile(_filename, editor.getValue());
    editor.thisfile = _filename;
    $('#filenametab').html(editor.thisfile);
});

$("#delcode").on("click", function() {
    deleteFile(editor.thisfile);
    editor.setValue('');
    $('#filenametab').html("No file opened");
});

$("#asmcode").on("click", function() {
    compileFile(editor.thisfile);
});

$("#loadcode").on("click", function() {
    loadFile(editor.thisfile);
});

$(document).ready(setFileView);
