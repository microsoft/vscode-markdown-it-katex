const path = require('path');
const tape = require('tape');
const testLoad = require('markdown-it-testgen').load;
const mdk = require('../dist/index').default;
const mdIt = require('markdown-it');

/**
 * @param {string} fixturePath
 * @param {mdIt} md
 */
function runTest(fixturePath, md) {
	testLoad(fixturePath, (/** @type {{ fixtures: any[]; }} */ data) => {
		data.fixtures.forEach((fixture) => {

			// generic test definition code using tape
			tape(fixture.header, (t) => {
				t.plan(1);

				// Replace nbps with actual space
				const expected = normalizeWithStub(fixture.second.text).normalize().replaceAll('\u00A0', ' ');
				const actual = normalizeWithStub(md.render(fixture.first.text)).normalize().replaceAll('\u00A0', ' ');

				t.equals(actual, expected);
			});
		});
	});
}

/**
 * Replace differences between OS (Linux vs Windows) with stubs as we are not testing those specific 
 * values for these tests.
 * 
 * @param {string} text
 */
function normalizeWithStub(text) {
	// ex: style="height:1.6667em;..." => style=""
	text = text.replaceAll(/style=\".*?\"/g, "style=\"\"");

	// ex: rowspacing="0.1600em" => rowspacing="1.0em"
	text = text.replaceAll(/=\"\d+\.?\d*em\"/g, "=\"1.0em\"");

	// ex: <svg...></svg> => <svg></svg>
	text = text.replaceAll(/<svg[\s\S]*?><\/svg>/gm, "<svg></svg>");
	return text;
}


runTest(path.join(__dirname, 'fixtures', 'default.txt'), mdIt({ html: true }).use(mdk,));

runTest(path.join(__dirname, 'fixtures', 'bare.txt'), mdIt().use(mdk, { enableBareBlocks: true }));

runTest(path.join(__dirname, 'fixtures', 'math-in-html.txt'), mdIt({ html: true }).use(mdk, { enableMathBlockInHtml: true, enableMathInlineInHtml: true }));
