/* --------------------
 * react-async-ssr module
 * Tests utility functions
 * ------------------*/

'use strict';

// Modules
const React = require('react'),
	ReactDOM = require('react-dom/server'),
	ssr = require('../index');

// Throw any unhandled promise rejections
process.on('unhandledRejection', err => {
	throw err;
});

// Exports
module.exports = {
	itRenders: wrapMethod(itRenders),
	itRendersWithSyncCompare: wrapMethod(itRendersWithSyncCompare),
	lazy,
	removeSpacing
};

/*
 * Run provided test function with both `.renderToStringAsync()` and `.renderToStaticMarkupAsync()`
 *
 * Injected args:
 *  - `method`: Method under test i.e. `renderToStringAsync` or `renderToStaticMarkupAsync`
 *  - `openTag`: When method is `renderToStringAsync`, `openTag` is ' data-reactroot=""'
 *  - `isStatic`: `true` if method is `renderToStaticMarkupAsync`
 */
function itRenders(testName, fn, describe) {
	// eslint-disable-next-line jest/valid-describe
	describe(testName, () => {
		runGroups(({testName, method, openTag, isStatic}) => {
			// eslint-disable-next-line jest/expect-expect
			it(testName, () => {
				// eslint-disable-next-line jest/no-test-return-statement
				return fn({render: method, openTag, isStatic});
			});
		});
	});
}

/*
 * Run provided test function with both `.renderToStringAsync()` and `.renderToStaticMarkupAsync()`
 * and with additional test for each method that output is identical as for the synchronous
 * counterpart method i.e. `ReactDOM.renderToString()` / `ReactDOM.renderToStaticMarkup()`
 *
 * Injected args:
 *  - all of the ones listed for `itRenders()` above plus...
 *  - `Suspense`: If an async method `React.Suspense`; if sync method then the dummy `Passthrough`
 */

function itRendersWithSyncCompare(testName, fn, describe) {
	// eslint-disable-next-line jest/valid-describe
	describe(testName, () => {
		runGroups(({testName, method, methodSync, methodNameSync, openTag, isStatic}) => {
			// eslint-disable-next-line jest/valid-describe
			describe(testName, () => {
				// eslint-disable-next-line jest/expect-expect
				it('renders expected HTML', () => {
					// eslint-disable-next-line jest/no-test-return-statement
					return fn({render: method, Suspense: React.Suspense, openTag, isStatic});
				});

				// eslint-disable-next-line jest/expect-expect
				it(`renders same HTML as ReactDOM.${methodNameSync}`, () => {
					// eslint-disable-next-line jest/no-test-return-statement
					return fn({render: methodSync, Suspense: Passthrough, openTag, isStatic});
				});
			});
		});
	});
}

function Passthrough(props) {
	return props.children || null;
}

function runGroups(fn) {
	fn({
		testName: 'with renderToStringAsync',
		methodNameSync: 'renderToString',
		method: ssr.renderToStringAsync,
		methodSync: e => Promise.resolve(ReactDOM.renderToString(e)),
		openTag: ' data-reactroot=""',
		isStatic: false
	});

	fn({
		testName: 'with renderToStaticMarkupAsync',
		methodNameSync: 'renderToStaticMarkup',
		method: ssr.renderToStaticMarkupAsync,
		methodSync: e => Promise.resolve(ReactDOM.renderToStaticMarkup(e)),
		openTag: '',
		isStatic: true
	});
}

/*
 * Wrap a test group method (`itRenders` / `itRendersWithSyncCompare`) to add
 * `.skip()` and `.only` variations to it.
 */
function wrapMethod(method) {
	const methodWrapped = (testName, fn) => method(testName, fn, describe);
	methodWrapped.only = (testName, fn) => method(testName, fn, describe.only);
	methodWrapped.skip = (testName, fn) => method(testName, fn, describe.skip);
	return methodWrapped;
}

/*
 * Function to simulate lazy components.
 * Returns a component which throws a promise when first rendered,
 * and if re-rendered after promise has resolved, returns an element made from
 * the provided component.
 * If `.noSsr` option set, throws a promise with `.noSsr` property.
 */
function lazy(component, options) {
	if (!options) options = {};
	const noSsr = !!options.noSsr;

	let loaded = false, promise;
	return function Lazy(props) {
		if (!loaded) {
			if (!promise) {
				if (noSsr) {
					promise = new Promise(() => {});
					promise.noSsr = true;
				} else {
					promise = new Promise(resolve => setTimeout(() => {
						loaded = true;
						resolve();
					}));
				}
			}

			throw promise;
		}

		return React.createElement(component, props);
	};
}

/*
 * Utility functions used in individual tests
 */
function removeSpacing(text) {
	return text.replace(/\s*(?:\r?\n|^|$)\s*/g, '');
}
