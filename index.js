/* Process inline math */
/*
Like markdown-it-simplemath, this is a stripped down, simplified version of:
https://github.com/runarberg/markdown-it-math

It differs in that it takes (a subset of) LaTeX as input and relies on KaTeX
for rendering output.
*/

/*jslint node: true */
'use strict';

var katex = require('katex');

/**
 * Test if potential opening or closing delimieter
 * 
 * @returns {{ can_open: boolean, can_close: boolean }}
 */
function isValidInlineDelim(state, pos) {
    const prevChar = state.src[pos - 1];
    const char = state.src[pos];
    const nextChar = state.src[pos + 1];

    if (char !== '$') {
        return { can_open: false, can_close: false };
    }

    let canOpen = false;
    let canClose = false;
    if (prevChar !== '$' && prevChar !== '\\' && !isDanglingInBlock(state, pos).is_last && (
        prevChar === undefined || isWhitespace(prevChar) || !isWordCharacterOrNumber(prevChar)
    )) {
        canOpen = true;
    }

    if (nextChar !== '$' && !isDanglingInBlock(state, pos).is_first && (
        nextChar == undefined || isWhitespace(nextChar) || !isWordCharacterOrNumber(nextChar))
    ) {
        canClose = true;
    }

    return { can_open: canOpen, can_close: canClose };
}

/**
 * Given state.src[pos] === '$',
 * test if it is the first/last dollar symbol in a markdown block
 * 
 * @returns {{ is_first: boolean, is_last: boolean }}
 */
function isDanglingInBlock(state, pos) {
    const before = state.src.slice(0, pos);
    const after = state.src.slice(pos + 1);
    const tokens = ['`', '\\*', '\\*\\*', '_', '__'];

    let isFirst = false;
    let isLast = false;

    for (const token of tokens) {
        if ((before.match(new RegExp(token, 'g')) || []).length % 2 == 1) { // is inside block
            if (!(new RegExp('\\$(?!.*' + token + ')')).test(before)) { // is the first $ inside block
                isFirst = true;
            }
            if (!(new RegExp('\\$(?=[^\\$]*' + token + ')')).test(after)) { // is the last $ inside (closed) block
                isLast = true;
            }
        }
    }

    return { is_first: isFirst, is_last: isLast };
}

/**
 * @param {string} char 
 * @returns {boolean}
 */
function isWhitespace(char) {
    return /^\s$/u.test(char);
}

/**
 * @param {string} char 
 * @returns {boolean}
 */
function isWordCharacterOrNumber(char) {
    return /^[\w\d]$/u.test(char);
}

/**
 * @returns {{ can_open: boolean, can_close: boolean }}
 */
function isValidBlockDelim(state, pos) {
    const prevChar = state.src[pos - 1];
    const char = state.src[pos];
    const nextChar = state.src[pos + 1];
    const nextCharPlus1 = state.src[pos + 2];

    if (
        char === '$'
        && prevChar !== '$' && prevChar !== '\\'
        && nextChar === '$'
        && nextCharPlus1 !== '$'
    ) {
        return { can_open: true, can_close: true };
    }

    return { can_open: false, can_close: false };
}

function math_inline(state, silent) {
    var start, match, token, res, pos, esc_count;

    if (state.src[state.pos] !== "$") { return false; }

    res = isValidInlineDelim(state, state.pos);
    if (!res.can_open) {
        if (!silent) { state.pending += "$"; }
        state.pos += 1;
        return true;
    }

    // First check for and bypass all properly escaped delimieters
    // This loop will assume that the first leading backtick can not
    // be the first character in state.src, which is known since
    // we have found an opening delimieter already.
    start = state.pos + 1;
    match = start;
    while ((match = state.src.indexOf("$", match)) !== -1) {
        // Found potential $, look for escapes, pos will point to
        // first non escape when complete
        pos = match - 1;
        while (state.src[pos] === "\\") { pos -= 1; }

        // Even number of escapes, potential closing delimiter found
        if (((match - pos) % 2) == 1) { break; }
        match += 1;
    }

    // No closing delimter found.  Consume $ and continue.
    if (match === -1) {
        if (!silent) { state.pending += "$"; }
        state.pos = start;
        return true;
    }

    // Check if we have empty content, ie: $$.  Do not parse.
    if (match - start === 0) {
        if (!silent) { state.pending += "$$"; }
        state.pos = start + 1;
        return true;
    }

    // Check for valid closing delimiter
    res = isValidInlineDelim(state, match);
    if (!res.can_close) {
        if (!silent) { state.pending += "$"; }
        state.pos = start;
        return true;
    }

    if (!silent) {
        token = state.push('math_inline', 'math', 0);
        token.markup = "$";
        token.content = state.src.slice(start, match);
    }

    state.pos = match + 1;
    return true;
}

function math_block_dollar(state, start, end, silent) {
    var lastLine, next, lastPos, found = false, token,
        pos = state.bMarks[start] + state.tShift[start],
        max = state.eMarks[start]

    if (pos + 2 > max) { return false; }
    if (state.src.slice(pos, pos + 2) !== '$$') { return false; }

    pos += 2;
    let firstLine = state.src.slice(pos, max);

    if (silent) { return true; }
    if (firstLine.trim().slice(-2) === '$$') {
        // Single line expression
        firstLine = firstLine.trim().slice(0, -2);
        found = true;
    }

    for (next = start; !found;) {

        next++;

        if (next >= end) { break; }

        pos = state.bMarks[next] + state.tShift[next];
        max = state.eMarks[next];

        if (pos < max && state.tShift[next] < state.blkIndent) {
            // non-empty line with negative indent should stop the list:
            break;
        }

        if (state.src.slice(pos, max).trim().slice(-2) === '$$') {
            lastPos = state.src.slice(0, max).lastIndexOf('$$');
            lastLine = state.src.slice(pos, lastPos);
            found = true;
        }
    }

    state.line = next + 1;

    token = state.push('math_block', 'math', 0);
    token.block = true;
    token.content = (firstLine && firstLine.trim() ? firstLine + '\n' : '')
        + state.getLines(start + 1, next, state.tShift[start], true)
        + (lastLine && lastLine.trim() ? lastLine : '');
    token.map = [start, state.line];
    token.markup = '$$';
    return true;
}

function bare_math_block(state, start, end, silent) {
    var lastLine, found = false,
        pos = state.bMarks[start] + state.tShift[start],
        max = state.eMarks[start]

    const firstLine = state.src.slice(pos, max);

    const beginRe = /^\\begin/;
    const endRe = /^\\end/;

    if (!beginRe.test(firstLine)) { return false; }

    if (silent) { return true; }

    let nestingCount = 0;
    let next;
    for (next = start; !found;) {
        next++;
        if (next >= end) { break; }

        pos = state.bMarks[next] + state.tShift[next];
        max = state.eMarks[next];

        if (pos < max && state.tShift[next] < state.blkIndent) {
            // non-empty line with negative indent should stop the list:
            break;
        }
        const line = state.src.slice(pos, max);
        if (beginRe.test(line)) {
            ++nestingCount;
        } else if (endRe.test(line)) {
            --nestingCount;
            if (nestingCount < 0) {
                const lastPos = max;
                lastLine = state.src.slice(pos, lastPos);
                found = true;
            }
        }
    }

    state.line = next + 1;

    const token = state.push('math_block', 'math', 0);
    token.block = true;
    token.content = (firstLine && firstLine.trim() ? firstLine + '\n' : '')
        + state.getLines(start + 1, next, state.tShift[start], true)
        + (lastLine && lastLine.trim() ? lastLine : '');
    token.map = [start, state.line];
    token.markup = '$$';
    return true;
}

function math_inline_block(state, silent) {
    var start, match, token, res, pos;

    if (state.src.slice(state.pos, state.pos + 2) !== "$$") { return false; }

    res = isValidBlockDelim(state, state.pos);
    if (!res.can_open) {
        if (!silent) { state.pending += "$$"; }
        state.pos += 2;
        return true;
    }

    // First check for and bypass all properly escaped delimieters
    // This loop will assume that the first leading backtick can not
    // be the first character in state.src, which is known since
    // we have found an opening delimieter already.
    start = state.pos + 2;
    match = start;
    while ((match = state.src.indexOf("$$", match)) !== -1) {
        // Found potential $$, look for escapes, pos will point to
        // first non escape when complete
        pos = match - 1;
        while (state.src[pos] === "\\") { pos -= 1; }

        // Even number of escapes, potential closing delimiter found
        if (((match - pos) % 2) == 1) { break; }
        match += 2;
    }

    // No closing delimter found.  Consume $$ and continue.
    if (match === -1) {
        if (!silent) { state.pending += "$$"; }
        state.pos = start;
        return true;
    }

    // Check if we have empty content, ie: $$$$.  Do not parse.
    if (match - start === 0) {
        if (!silent) { state.pending += "$$$$"; }
        state.pos = start + 2;
        return true;
    }

    // Check for valid closing delimiter
    res = isValidBlockDelim(state, match);
    if (!res.can_close) {
        if (!silent) { state.pending += "$$"; }
        state.pos = start;
        return true;
    }

    if (!silent) {
        token = state.push('math_block', 'math', 0);
        token.block = true;
        token.markup = "$$";
        token.content = state.src.slice(start, match);
    }

    state.pos = match + 2;
    return true;
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

module.exports = function math_plugin(md, options) {
    // Default options

    options = options || {};

    const enableBareBlocks = options.enableBareBlocks;

    // set KaTeX as the renderer for markdown-it-simplemath
    const katexInline = (latex) => {
        const displayMode = /\n/.test(latex);
        try {
            return katex.renderToString(latex, { ...options, displayMode });
        } catch (error) {
            if (options.throwOnError) { console.log(error); }
            return `<span class="katex-error" title="${escapeHtml(latex)}">${escapeHtml(error.toString())}</span>`;
        }
    };

    const inlineRenderer = (tokens, idx) => {
        return katexInline(tokens[idx].content);
    };

    const katexBlockRenderer = (latex) => {
        try {
            return `<p class="katex-block">${katex.renderToString(latex, { ...options, displayMode: true })}</p>`;
        } catch (error) {
            if (options.throwOnError) { console.log(error); }
            return `<p class="katex-block katex-error" title="${escapeHtml(latex)}">${escapeHtml(error.toString())}</p>`;
        }
    }

    const blockRenderer = (tokens, idx) => {
        return katexBlockRenderer(tokens[idx].content) + '\n';
    }

    md.inline.ruler.after('escape', 'math_inline', math_inline);
    md.inline.ruler.after('escape', 'math_inline_block', math_inline_block);
    md.block.ruler.after('blockquote', 'math_block', (state, start, end, silent) => {
        if (enableBareBlocks && bare_math_block(state, start, end, silent)) {
            return true;
        }
        return math_block_dollar(state, start, end, silent);
    }, {
        alt: ['paragraph', 'reference', 'blockquote', 'list']
    });
    md.renderer.rules.math_inline = inlineRenderer;
    md.renderer.rules.math_inline_block = blockRenderer;
    md.renderer.rules.math_block = blockRenderer;
};
