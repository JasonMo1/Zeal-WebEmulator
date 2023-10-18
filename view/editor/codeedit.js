async function openFile(_filename) {
    if (dontOpen === false) {
        editor.latestfile = editor.thisfile;
        editor.thisfile = _filename;
        $('#filenametab').html(editor.thisfile);
        let file = await wdb.selectFile(_filename);
        editor.setValue(file[0].code);
    }
}

async function saveFile(_filename, _code) {
    dontOpen = true;
    try {
        const codefile = { filename: _filename, code: _code };
        let isSaved = await wdb.selectFile(_filename);
        if (isSaved.length > 0) {
            insertreq = await wdb.updateFile(codefile);
        }
        else {
            insertreq = await wdb.insertFile(codefile);
        }

        if (insertreq > 0) {
            popup.log('Saved '+codefile.filename);
            setFileView();
        }
    }
    catch (error) {
        popup.error(error.message);
    }
    dontOpen = false;
}

async function deleteFile(_filename) {
    dontOpen = true;
    editor.thisfile = editor.latestfile;
    let result = await wdb.removeFile(_filename);
    if (result > 0) {
        popup.log("Deleted " + _filename);
        setFileView();
    }
    dontOpen = false;
}

async function downloadFile(_filename) {
    if (editor.thisfile === _filename) {
        downloadString(editor.thisfile, editor.getValue());
    }
    else {
        let file = await wdb.selectFile(_filename);
        downloadString(file[0].filename, file[0].code);
    }
}

async function compileFile(_filename) {
    let file = await wdb.selectFile(_filename);
    assembler.compile(0, file[0].code, _filename.split(".")[0]);
}

async function loadFile(_filename) {
    let file = await wdb.selectFile(_filename);
    let bin = assembler.compile(3, file[0].code, _filename.split(".")[0]);
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
}

async function setFileView() {
    dontOpen = false;
    let buttons = [
        {
            name: "save",
            short: "save",
            svgpath: `<path d="M3 5.75A2.75 2.75 0 0 1 5.75 3h9.964a3.25 3.25 0 0 1 2.299.952l2.035 2.035c.61.61.952 1.437.952 2.299v9.964A2.75 2.75 0 0 1 18.25 21H5.75A2.75 2.75 0 0 1 3 18.25V5.75ZM5.75 4.5c-.69 0-1.25.56-1.25 1.25v12.5c0 .69.56 1.25 1.25 1.25H6v-5.25A2.25 2.25 0 0 1 8.25 12h7.5A2.25 2.25 0 0 1 18 14.25v5.25h.25c.69 0 1.25-.56 1.25-1.25V8.286c0-.465-.184-.91-.513-1.238l-2.035-2.035a1.75 1.75 0 0 0-.952-.49V7.25a2.25 2.25 0 0 1-2.25 2.25h-4.5A2.25 2.25 0 0 1 7 7.25V4.5H5.75Zm10.75 15v-5.25a.75.75 0 0 0-.75-.75h-7.5a.75.75 0 0 0-.75.75v5.25h9Zm-8-15v2.75c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75V4.5h-6Z" fill="#fff"/>`  
        },
        { 
            name: "delete", 
            short: "del",
            svgpath: `<path d="M12 1.75a3.25 3.25 0 0 1 3.245 3.066L15.25 5h5.25a.75.75 0 0 1 .102 1.493L20.5 6.5h-.796l-1.28 13.02a2.75 2.75 0 0 1-2.561 2.474l-.176.006H8.313a2.75 2.75 0 0 1-2.714-2.307l-.023-.174L4.295 6.5H3.5a.75.75 0 0 1-.743-.648L2.75 5.75a.75.75 0 0 1 .648-.743L3.5 5h5.25A3.25 3.25 0 0 1 12 1.75Zm6.197 4.75H5.802l1.267 12.872a1.25 1.25 0 0 0 1.117 1.122l.127.006h7.374c.6 0 1.109-.425 1.225-1.002l.02-.126L18.196 6.5ZM13.75 9.25a.75.75 0 0 1 .743.648L14.5 10v7a.75.75 0 0 1-1.493.102L13 17v-7a.75.75 0 0 1 .75-.75Zm-3.5 0a.75.75 0 0 1 .743.648L11 10v7a.75.75 0 0 1-1.493.102L9.5 17v-7a.75.75 0 0 1 .75-.75Zm1.75-6a1.75 1.75 0 0 0-1.744 1.606L10.25 5h3.5A1.75 1.75 0 0 0 12 3.25Z" fill="#fff"/>`
        },
        {
            name: "download",
            short: "down",
            svgpath: `<path d="M18.25 20.5a.75.75 0 1 1 0 1.5l-13 .004a.75.75 0 1 1 0-1.5l13-.004ZM11.648 2.012l.102-.007a.75.75 0 0 1 .743.648l.007.102-.001 13.685 3.722-3.72a.75.75 0 0 1 .976-.073l.085.073a.75.75 0 0 1 .072.976l-.073.084-4.997 4.997a.75.75 0 0 1-.976.073l-.085-.073-5.003-4.996a.75.75 0 0 1 .976-1.134l.084.072 3.719 3.714L11 2.755a.75.75 0 0 1 .648-.743l.102-.007-.102.007Z" fill="#fff"/>`
        },
        {
            name: "build",
            short: "bld",
            svgpath: `<path d="M20.026 12.192a2.002 2.002 0 0 1-.577.598l-6.05 4.084a2.5 2.5 0 0 1-2.798 0l-6.05-4.084a2 2 0 0 1-.779-2.29l6.841 4.56a2.5 2.5 0 0 0 2.613.098l.16-.098 6.841-4.56a1.996 1.996 0 0 1-.201 1.692Zm.201 1.558a1.996 1.996 0 0 1-.778 2.29l-6.05 4.084a2.5 2.5 0 0 1-2.798 0l-6.05-4.084a2 2 0 0 1-.779-2.29l6.841 4.56a2.5 2.5 0 0 0 2.613.098l.16-.098 6.841-4.56Zm-6.84-10.325 6.365 4.243a1 1 0 0 1 0 1.664l-6.365 4.244a2.5 2.5 0 0 1-2.774 0L4.248 9.332a1 1 0 0 1 0-1.664l6.365-4.243a2.5 2.5 0 0 1 2.774 0ZM11.56 4.606l-.116.067L5.705 8.5l5.74 3.828a1 1 0 0 0 .994.066l.116-.066L18.294 8.5l-5.74-3.827a1 1 0 0 0-.993-.067Z" fill="#fff"/>`
        },
        {
            name: "send to uart",
            short: "snd",
            svgpath: `<path d="M18.25 3.509a.75.75 0 1 0 0-1.5l-13-.004a.75.75 0 1 0 0 1.5l13 .004Zm-6.602 18.488.102.007a.75.75 0 0 0 .743-.649l.007-.101-.001-13.685 3.722 3.72a.75.75 0 0 0 .976.072l.085-.072a.75.75 0 0 0 .072-.977l-.073-.084-4.997-4.996a.75.75 0 0 0-.976-.073l-.085.072-5.003 4.997a.75.75 0 0 0 .976 1.134l.084-.073 3.719-3.713L11 21.254c0 .38.282.693.648.743Z" fill="#fff"/>`
        }
    ];
    let files = await wdb.selectAll();
    let result = "";
    result += '<section class="files">';
    for (var i in files) {
        let filename = files[i].filename;

        result += `
        <div class="file" data-filename="${filename}">
          <div>${filename}</div>
          <section class="filepanel">`;
        for (var j in buttons) {
            let bname = buttons[j].name;
            let bshort = buttons[j].short;
            let bsvg = buttons[j].svgpath;
            result += `
            <svg class="${bshort}file" data-filename="${filename}" 
            title="${bname} ${filename}" alt="${bname}"
            width="20" height="20" fill:"none"
            viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              ${bsvg}
            </svg>`;
        }

        result += `
          </section>
        </div>`;
    }
    result += "</section>";

    $("#code-files").html(result);

    $(".file").on("click", async function() {
        await openFile($(this).data("filename"));
    });

    $(".savefile").on("click", async function() {
        await saveFile($(this).data("filename"), editor.getValue());
    });

    $(".delfile").on("click", async function() {
        await deleteFile($(this).data("filename"));
    });
    
    $(".downfile").on("click", async function() {
        await downloadFile($(this).data("filename"));
    });

    $(".bldfile").on("click", async function(){
        await compileFile($(this).data("filename"));
    });

    $(".sndfile").on("click", async function() {
        await loadFile($(this).data("filename"));
    });
}

$("#downasm").on("click", async function() {
    await downloadFile(editor.thisfile);
});

$("#savecode").on("click", async function() {
    await saveFile(editor.thisfile, editor.getValue());
});

$("#asmcode").on("click", async function() {
    await compileFile(editor.thisfile);
});

$("#loadcode").on("click", async function() {
    await loadFile(editor.thisfile);
});

$(document).ready(setFileView);
