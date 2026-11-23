const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');
const plugin = require('../dist/index').default;

const md = MarkdownIt().use(plugin, { enableLatexInlineDelimiters: true });
const normal = MarkdownIt().use(plugin);

assert.equal(md.render('Text \\(\\hat u\\) and \\(r\\), then $x^2$.'), normal.render('Text $\\hat u$ and $r$, then $x^2$.'));
assert.equal(md.render('[\\(x_i\\)](/math)'), normal.render('[$x_i$](/math)'));
assert.equal(md.render('An unmatched \\(, then \\(x^2\\).'), normal.render('An unmatched \\(, then $x^2$.'));
assert.equal(md.render('\\(a\\\\)b\\)'), normal.render('$a\\\\)b$'));

for (const source of [
	'\\(',
	'\\( \\)',
	'\\\\(x^2\\)',
	'\\(x^2\\\\)',
	'`\\(x^2\\)`',
	'```\n\\(x^2\\)\n```',
]) {
	assert.equal(md.render(source), normal.render(source), source);
}

assert.equal(normal.render('\\(x^2\\)'), '<p>(x^2)</p>\n');
