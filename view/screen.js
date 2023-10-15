/**
 * SPDX-FileCopyrightText: 2022 Zeal 8-bit Computer <contact@zeal8bit.com>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

$("#screen").on('touchstart', function(e){
    if(isIos){
        e.preventDefault();
        e.stopPropagation();
        $("#input-container").focus()
    }
});

$("#screen").on("click", function() {
    $("#input-container").focus();
});

$("#input-container").on("keydown", function(e) {
    const handled = zealcom.KeyboardKeyPressed(e.keyCode);

    if (handled) {
        e.preventDefault();
    }
});

$("#input-container").on("keyup", function(e) {
    const handled = zealcom.KeyboardKeyReleased(e.keyCode);

    if (handled) {
        e.preventDefault();
    }
});
