/**
 * SPDX-FileCopyrightText: 2023 Zeal 8-bit Computer <contact@zeal8bit.com>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// Init window
initTheme();
const left_panel_height = $("#debug").height();
$("#rightpanel").css('min-height', left_panel_height);

const KB = 1024;
/* 10MHz frequency */
const CPUFREQ = 10000000;
const TSTATES_US = 1/CPUFREQ * 1000000;

function us_to_tstates(us) {
    return Math.floor(us / TSTATES_US);
}

var terminal = new Terminal();
terminal.open(document.getElementById('terminal'));

// Init shortcut key
document.addEventListener('keydown', function(event) {
    const binding = {'F9': zealcom.cont, 'F10': zealcom.step, 'F11': zealcom.step_over};
    if (binding[event.key]) {
        binding[event.key]();
    }
});

// Init Emulated hardware
var zealcom = new Zeal8bitComputer();
const assembler = new Assembler();
const disassembler = new Disassembler();
const popup = new Popup();

var editor = CodeMirror.fromTextArea(document.getElementById("code"), {
    mode: "text/x-z80",
    mode: "text/x-csrc",
    matchBrackets: true,
    lineNumbers: true,
    theme: "darcula",
    lineWrapping: true,
    foldGutter: true,
    gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
    styleActiveLine: true,
    autoRefresh: true,
    extraKeys: { "Ctrl-Space" : "autocomplete" }
});

editor.refresh();

const wfs = new WorkSpaceFileSystem();
