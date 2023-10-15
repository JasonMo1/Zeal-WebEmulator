/**
 * SPDX-FileCopyrightText: 2022 Zeal 8-bit Computer <contact@zeal8bit.com>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

function isPrintable(byteCode) {
    return byteCode >= 32 && byteCode <= 126;
}

async function readBlobFromUrl(pburl) {
    const response = await fetch(pburl);
    return await response.blob();
}

/** Check for hash value */
function filehash(file1, SHA2) {
    return new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.onloadend = (ev) => {
            const SHA256 = CryptoJS.SHA256(CryptoJS.enc.Latin1.parse(ev.target.result)).toString(CryptoJS.enc.Hex);
            // console.log("file_hash: "+SHA256+"\nindex_hash: "+SHA2);
            if (String(SHA256) == String(SHA2)) {
                resolve(true);
            }
            else {
                r = confirm("Warning: Hash values do not match. Continue?");
                resolve(r);
            }
        }
        fileReader.readAsBinaryString(file1);
    });
}

// About hex
function hex(str = "", noprefix = false, digits = 4) {
    const leading = `${"0".repeat(digits)}${str.toString(16).toUpperCase()}`.substr(-digits);
    return noprefix ? leading : `0x${leading}`;
}

function hex8(str, noprefix) {
    const value = hex(str, true);
    return `${noprefix ? "" : "0x"}${value.substring(2)}`;
}

function hex16(high, lower, noprefix) {
    const value = (high << 8) | lower;
    return `${noprefix ? "" : "0x"}${hex(value, true)}`;
}

function download(e, t) {
    var r = document.createElement("a");
    r.setAttribute("href", "data:text/plain;charset=utf-8," + t),
    r.setAttribute("download", e),
    document.body.appendChild(r),
    r.click(),
    document.body.removeChild(r);
}

function downloadBinary(_filename="Zeal-WebEmulator-File.txt", _binary) {
    const toHex = (num, length) => {
        let hex = num.toString(16);
        while (hex.length < length) {
            hex = "0" + hex;
        }
        return hex.toUpperCase();
    };
    let encodedString = "";
    for (let i = 0; i < _binary.length; i++) {
        encodedString += "%" + toHex(255 & _binary[i], 2);
    }
    download(_filename, encodedString);
}

function downloadString(_filename="Zeal-WebEmulator-File.txt", _str) {
    for (var r = "", n = 0; n < _str.length; n++) {
        r += "%" + _str.charCodeAt(n).toString(16);
    }
    download(_filename, r);
}

function getProgramName() {
    let progname = "myprogram.asm";
    let input = $("#progname").val();
    if (input) {
        progname = input;
        if (!progname.endsWith(".asm")) {
            progname += ".asm";
        }
    }
    return progname;
}
