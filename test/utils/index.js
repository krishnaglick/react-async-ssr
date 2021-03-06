/* --------------------
 * react-async-ssr module
 * Tests utility functions
 * ------------------*/

'use strict';

// Modules
const React = require('react'),
	ReactDOMServer = require('react-dom/server'),
	ssr = require('../../index'),
	{NO_SSR, ABORT, ON_MOUNT} = require('../../symbols');

// Imports
const {TEST_LAZY} = require('./symbols');

// Extend expect with `.toBeMounted()` etc
const expectExtensions = require('./expectExtensions');

expect.extend(expectExtensions);

// Throw any unhandled promise rejections
process.on('unhandledRejection', (err) => {
	console.log('Unhandled rejection'); // eslint-disable-line no-console
	throw err;
});

// Exports
module.exports = {
	itRenders: wrapMethod(itRenders),
	itRendersWithSyncCompare: wrapMethod(itRendersWithSyncCompare),
	lazy,
	removeSpacing,
	preventUnhandledRejection
};

/*
 * Run provided test function with both `.renderToStringAsync()` and `.renderToStaticMarkupAsync()`
 *
 * Injected args:
 *  - `method`: Method under test i.e. `renderToStringAsync` or `renderToStaticMarkupAsync`
 *  - `openTag`: When method is `renderToStringAsync`, `openTag` is ' data-reactroot=""'
 *  - `isStatic`: `true` if method is `renderToStaticMarkupAsync`
 */
function itRenders(testName, fn, options, describe) {
	const fallbackFast = options ? options.fallbackFast : undefined;
	// eslint-disable-next-line jest/valid-describe
	describe(testName, () => {
		// eslint-disable-next-line no-shadow
		runGroups(({testName, method, openTag, isStatic, fallbackFast}) => {
			// eslint-disable-next-line jest/expect-expect
			it(testName, () => fn({render: method, openTag, isStatic, fallbackFast}));
		}, fallbackFast);
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

function itRendersWithSyncCompare(testName, fn, options, describe) {
	// eslint-disable-next-line jest/valid-describe
	describe(testName, () => {
		// eslint-disable-next-line no-shadow
		runGroups(({testName, method, methodSync, methodNameSync, openTag, isStatic, fallbackFast}) => {
			// eslint-disable-next-line jest/valid-describe
			describe(testName, () => {
				// eslint-disable-next-line jest/expect-expect
				it('renders expected HTML', () => fn({
					render: method,
					Suspense: React.Suspense,
					Fallback: React.Suspense,
					lazy,
					openTag,
					isStatic,
					fallbackFast
				}));

				// eslint-disable-next-line jest/expect-expect
				it(`renders same HTML as ReactDOM.${methodNameSync}`, () => fn({
					render: methodSync,
					Suspense: Passthrough,
					Fallback: SuspenseFallback,
					lazy: lazySync,
					openTag,
					isStatic,
					fallbackFast
				}));
			});
		});
	});
}

function Passthrough(props) {
	return props.children || null;
}

function SuspenseFallback(props) {
	const {fallback} = props;
	if (fallback === undefined) return null;
	return fallback;
}

function runGroups(fn, fallbackFast) {
	const groups = [];

	// renderToString groups
	const groupNonStatic = {
		testName: 'with renderToStringAsync',
		methodNameSync: 'renderToString',
		method: ssr.renderToStringAsync,
		methodSync: e => Promise.resolve(ReactDOMServer.renderToString(e)),
		openTag: ' data-reactroot=""',
		isStatic: false,
		fallbackFast: false
	};

	if (fallbackFast == null || !fallbackFast) groups.push(groupNonStatic);

	if (fallbackFast == null || fallbackFast) {
		groups.push(Object.assign({}, groupNonStatic, {
			testName: 'with renderToStringAsync in fallbackFast mode',
			fallbackFast: true,
			method: e => ssr.renderToStringAsync(e, {fallbackFast: true})
		}));
	}

	// renderToStaticMarkup groups
	const groupStatic = {
		testName: 'with renderToStaticMarkupAsync',
		methodNameSync: 'renderToStaticMarkup',
		method: ssr.renderToStaticMarkupAsync,
		methodSync: e => Promise.resolve(ReactDOMServer.renderToStaticMarkup(e)),
		openTag: '',
		isStatic: true,
		fallbackFast: false
	};

	if (fallbackFast == null || !fallbackFast) groups.push(groupStatic);

	if (fallbackFast == null || fallbackFast) {
		groups.push(Object.assign({}, groupStatic, {
			testName: 'with renderToStaticMarkupAsync in fallbackFast mode',
			fallbackFast: true,
			method: e => ssr.renderToStaticMarkupAsync(e, {fallbackFast: true})
		}));
	}

	for (const group of groups) {
		fn(group);
	}
}

/*
 * Wrap a test group method (`itRenders` / `itRendersWithSyncCompare`) to add
 * `.skip()` and `.only` variations to it.
 */
function wrapMethod(method) {
	const methodWrapped = (testName, fn, options) => method(testName, fn, options, describe);
	methodWrapped.only = (testName, fn, options) => method(testName, fn, options, describe.only);
	methodWrapped.skip = (testName, fn, options) => method(testName, fn, options, describe.skip);
	return methodWrapped;
}

/**
 * Function to simulate lazy components.
 * Returns a component which throws a promise when first rendered,
 * and if re-rendered after promise has resolved, returns an element made from
 * the provided component.
 * If `.noSsr` option set, throws a promise with `[NO_SSR]` property.
 *
 * @param {Function} component - Component to render
 * @param {Object} [options] - Options object
 * @param {boolean} [options.noSsr=false] - If `true`, throws promise with `[NO_SSR]` property
 * @param {boolean} [options.noResolve=false] - If `true`, throws promise that never resolves
 * @param {number} [options.delay=undefined] - If provided, throws promise that delays
 *   provided number of ms before resolving
 * @returns {Function} - React component
 */
function lazy(component, options) {
	if (!options) options = {};

	let loaded = false,
		promise;
	let Lazy = function LazyComponent(props) {
		if (loaded) return React.createElement(component, props);

		if (!promise) {
			if (options.noSsr) {
				promise = new Promise(() => {});
				promise[NO_SSR] = true;
			} else if (options.noResolve) {
				promise = new Promise(() => {});
			} else if (options.delay != null) {
				promise = new Promise((resolve) => {
					setTimeout(() => {
						loaded = true;
						resolve();
					}, options.delay);
				});
			} else {
				promise = new Promise((resolve) => {
					loaded = true;
					resolve();
				});
			}

			promise[ABORT] = jest.fn(); // Spy
			promise[ON_MOUNT] = jest.fn(); // Spy
			Lazy.promise = promise;
		}

		throw promise;
	};

	Lazy = jest.fn(Lazy); // Spy
	Lazy.displayName = 'Lazy';

	Lazy[TEST_LAZY] = true;

	return Lazy;
}

function lazySync(component) {
	return function Lazy(props) {
		return React.createElement(component, props);
	};
}

/*
 * Utility functions used in individual tests
 */
function removeSpacing(text) {
	return text.replace(/\s*(?:\r?\n|^|$)\s*/g, '');
}

function preventUnhandledRejection(promise) {
	promise.catch(() => {});
}
