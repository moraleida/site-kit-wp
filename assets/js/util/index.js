/**
 * Utility functions.
 *
 * Site Kit by Google, Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * External dependencies
 */
import {
	map,
	isNull,
	isUndefined,
	unescape,
	deburr,
	toLower,
	trim,
	trimEnd,
} from 'lodash';
import data, { TYPE_CORE } from 'GoogleComponents/data';
import SvgIcon from 'GoogleUtil/svg-icon';
import React from 'react';

/**
 * WordPress dependencies
 */
import apiFetch from '@wordpress/api-fetch';
import {
	addFilter,
	applyFilters,
} from '@wordpress/hooks';
import {
	__,
	_n,
	sprintf,
} from '@wordpress/i18n';
import { addQueryArgs, getQueryString } from '@wordpress/url';

export * from './storage';

/**
 * Remove a parameter from a URL string.
 *
 * Fallback for when URL is unable to handle this.
 *
 * @param {string} url       The URL to process.
 * @param {string} parameter The URL parameter to remove.
 */
const removeURLFallBack = ( url, parameter ) => {
	const urlparts = url.split( '?' );
	if ( 2 <= urlparts.length ) {
		const prefix = encodeURIComponent( parameter ) + '=';
		const pars = urlparts[ 1 ].split( /[&;]/g );

		//reverse iteration as may be destructive
		const newPars = pars.filter( ( param ) => {
			return -1 === param.lastIndexOf( prefix, 0 );
		} );

		url = urlparts[ 0 ] + '/' + ( 0 < newPars.length ? '?' + newPars.join( '&' ) : '' );
		return url;
	}
	return url;
};

/**
 * Remove a parameter from a URL string.
 *
 * Leverages the URL object internally.
 *
 * @param {string} url       The URL to process.
 * @param {string} parameter The URL parameter to remove.
 */
export const removeURLParameter = ( url, parameter ) => {
	const parsedURL = new URL( url );

	// If the URL implementation doesn't support ! parsedURL.searchParams, use the fallback handler.
	if ( ! parsedURL.searchParams || ! parsedURL.searchParams.delete ) {
		return removeURLFallBack( url, parameter );
	}
	parsedURL.searchParams.delete( parameter );
	return parsedURL.href;
};

/**
 * Format a large number for shortened display.
 *
 * @param {number}         number       The large number to format.
 * @param {string|boolean} currencyCode Optional currency code to format as amount.
 *
 * @return {string} The formatted number.
 */
export const readableLargeNumber = ( number, currencyCode = false ) => {
	let readableNumber;

	// Handle passed data undefined.
	if ( isUndefined( number ) ) {
		readableNumber = 0;
	} else if ( 1000000 < number ) {
		number = number / 1000000;
		readableNumber = number.toFixed( 1 ) + 'M';
	} else if ( 1000 < number ) {
		number = number / 1000;
		if ( 99 < number ) {
			readableNumber = Math.round( number ) + 'K';
		} else {
			readableNumber = number.toFixed( 1 ) + 'K';
		}
	} else {
		readableNumber = number;
	}

	// Handle errors after calculations.
	if ( isNull( number ) || isUndefined( number ) || isNaN( number ) ) {
		readableNumber = '';
		number = 0;
	}

	if ( 0 === number ) {
		readableNumber = '0.00';
		return currencyCode ?
			new Intl.NumberFormat( navigator.language, { style: 'currency', currency: currencyCode } ).format( number ) :
			number;
	}

	// Format as amount if currencyCode is passed.
	if ( false !== currencyCode && '' !== readableNumber ) {
		const formatedParts = new Intl.NumberFormat( navigator.language, { style: 'currency', currency: currencyCode } ).formatToParts( number );

		const decimal = formatedParts.find( ( part ) => 'decimal' === part.type );
		if ( ! isUndefined( decimal ) && ! isUndefined( decimal.value ) && 1000 > number ) {
			readableNumber = Number.isInteger( number ) ? number : number.replace( '.', decimal.value );
		}

		const currencyFound = formatedParts.find( ( part ) => 'currency' === part.type );
		const currency = currencyFound ? currencyFound.value : '';

		return `${ currency }${ readableNumber }`;
	}

	return readableNumber.toString();
};

/**
 * Internationalization Number Format.
 *
 * @param {number} number The number to format.
 * @param {string} locale Optional, locale to format as amount, default to Browser's locale.
 *
 * @return {string} The formatted number.
 */
export const numberFormat = ( number, locale = '' ) => {
	if ( ! locale ) {
		locale = navigator.language;
	}

	// This line to make sure we use lower case local format, ex: en-us.
	locale = locale.replace( '_', '-' ).toLocaleLowerCase();

	return new Intl.NumberFormat( locale ).format( number );
};

/**
 * Transform a period string into a number of seconds.
 *
 * @param {string} period The period to transform.
 *
 * @return {number} The number of seconds
 */
export const getTimeInSeconds = ( period ) => {
	const minute = 60;
	const hour = minute * 60;
	const day = hour * 24;
	const week = day * 7;
	const month = day * 30;
	const year = day * 365;
	switch ( period ) {
		case 'minute':
			return minute;

		case 'hour':
			return hour;

		case 'day':
			return day;

		case 'week':
			return week;

		case 'month':
			return month;

		case 'year':
			return year;
	}
};

/**
 * Converts seconds to a display ready string indicating
 * the number of hours, minutes and seconds that have elapsed.
 *
 * For example, passing 65 returns '1m 5s'.
 *
 * @param {number} seconds The number of seconds.
 */
export const prepareSecondsForDisplay = ( seconds ) => {
	seconds = parseInt( seconds, 10 );

	if ( isNaN( seconds ) || 0 === seconds ) {
		return '0.0s';
	}
	const results = {};
	results.hours = Math.floor( seconds / 60 / 60 );
	results.minutes = Math.floor( ( seconds / 60 ) % 60 );
	results.seconds = Math.floor( seconds % 60 );

	const returnString =
		( results.hours ? results.hours + 'h ' : '' ) +
		( results.minutes ? results.minutes + 'm ' : '' ) +
		( results.seconds ? results.seconds + 's ' : '' );

	return returnString.trim();
};

/**
 * Retrieve number of days between 2 dates.
 *
 * @param {Object} dateStart
 * @param {Object} dateEnd
 *
 * @return {number} The number of days.
 */
export const getDaysBetweenDates = ( dateStart, dateEnd ) => {
	const dayMs = 1000 * getTimeInSeconds( 'day' );
	const dateStartMs = dateStart.getTime();
	const dateEndMs = dateEnd.getTime();

	return Math.round( Math.abs( dateStartMs - dateEndMs ) / dayMs );
};

/**
 * Calculate the percent change between two values.
 *
 * @param {number} previous The previous value.
 * @param {number} current  The current value.
 *
 * @return {number|string} The percent change.
 */
export const changeToPercent = ( previous, current ) => {
	// Prevent divide by zero errors.
	if ( '0' === previous || 0 === previous || isNaN( previous ) ) {
		return '';
	}
	const change = ( ( current - previous ) / previous * 100 ).toFixed( 1 );

	// Avoid NaN at all costs.
	if ( isNaN( change ) || 'Infinity' === change ) {
		return '';
	}

	return change;
};

/**
 * Fallback helper to get a query parameter from the current URL.
 *
 * Used when URL.searchParams is unavailable.
 *
 * @param {string} name Query param to search for.
 * @return {string}
 */
const fallbackGetQueryParamater = ( name ) => {
	const queries = location.search.substr( 1 ).split( '&' );
	const queryDict = {};

	for ( let i = 0; i < queries.length; i++ ) {
		queryDict[ queries[ i ].split( '=' )[ 0 ] ] = decodeURIComponent( queries[ i ].split( '=' )[ 1 ] );
	}

	// If the name is specified, return that specific get parameter
	if ( name ) {
		return queryDict.hasOwnProperty( name ) ? decodeURIComponent( queryDict[ name ].replace( /\+/g, ' ' ) ) : '';
	}

	return queryDict;
};

/**
 * Get query parameter from the current URL.
 *
 * @param  {string} name      Query param to search for.
 * @param  {Object} _location Global `location` variable; used for DI-testing.
 * @return {string}           Value of the query param.
 */
export const getQueryParameter = ( name, _location = location ) => {
	const url = new URL( _location.href );
	if ( name ) {
		if ( ! url.searchParams || ! url.searchParams.get ) {
			return fallbackGetQueryParamater( name );
		}
		return url.searchParams.get( name );
	}
	const query = {};
	for ( const [ key, value ] of url.searchParams.entries() ) {
		query[ key ] = value;
	}
	return query;
};

/**
 * Extract a single column of data for a sparkline from a dataset prepared for google charts.
 *
 * @param {Array}  rowData   An array of google charts row data.
 * @param {number} column The column to extract for the sparkline.
 */
export const extractForSparkline = ( rowData, column ) => {
	return map( rowData, ( row, i ) => {
		return [
			row[ 0 ], // row[0] always contains the x axis value (typically date).
			row[ column ] || ( 0 === i ? '' : 0 ), // the data for the sparkline.
		];
	} );
};

export const refreshAuthentication = async () => {
	try {
		const response = await data.get( TYPE_CORE, 'user', 'authentication' );

		const requiredAndGrantedScopes = response.grantedScopes.filter( ( scope ) => {
			return -1 !== response.requiredScopes.indexOf( scope );
		} );

		// We should really be using state management. This is terrible.
		window.googlesitekit.setup = window.googlesitekit.setup || {};
		window.googlesitekit.setup.isAuthenticated = response.isAuthenticated;
		window.googlesitekit.setup.requiredScopes = response.requiredScopes;
		window.googlesitekit.setup.grantedScopes = response.grantedScopes;
		window.googlesitekit.setup.needReauthenticate = requiredAndGrantedScopes.length < response.requiredScopes.length;
	} catch ( e ) { // eslint-disable-line no-empty
	}
};

/**
 * Get the URL needed to initiate a reAuth flow.
 *
 * @param {string}  slug   The module slug. If included redirect URL will include page: page={ `googlesitekit-${slug}`}.
 * @param {boolean} status The module activation status.
 * @param {Object}  _googlesitekit googlesitekit global; can be replaced for testing.
 * @return {string} Authentication URL
 */
export const getReAuthURL = ( slug, status, _googlesitekit = googlesitekit ) => {
	const {
		connectURL,
		adminRoot,
	} = _googlesitekit.admin;

	const { needReauthenticate } = _googlesitekit.setup;

	const { screenID } = _googlesitekit.modules[ slug ];

	// Special case handling for PageSpeed Insights.
	// TODO: Refactor this out.
	const pageSpeedQueryArgs = 'pagespeed-insights' === slug ? {
		notification: 'authentication_success',
		reAuth: undefined,
	} : {};

	let redirect = addQueryArgs(
		adminRoot, {
			// If the module has a submenu page, and is being activated, redirect back to the module page.
			page: ( slug && status && screenID ) ? screenID : 'googlesitekit-dashboard',
			slug,
			reAuth: status,
			...pageSpeedQueryArgs,
		}
	);

	if ( ! needReauthenticate ) {
		return redirect;
	}

	// Encodes the query string to ensure the redirect url is not messing up with the main url.
	const queryString = encodeURIComponent( getQueryString( redirect ) );

	// Rebuild the redirect url.
	redirect = adminRoot + '?' + queryString;

	return addQueryArgs(
		connectURL, {
			redirect,
			status,
		}
	);
};

/**
 * Replace a filtered component with the passed component and merge their props.
 *
 * Components wrapped in the 'withFilters' higher order component have a filter applied to them (wp.hooks.applyFilters).
 * This helper is used to replace (or "Fill") a filtered component with a passed component. To use, pass as the third
 * argument to an addFilter call, eg:
 *
 * 	addFilter( `googlesitekit.ModuleSettingsDetails-${slug}`,
 * 		'googlesitekit.AdSenseModuleSettingsDetails',
 * 		fillFilterWithComponent( AdSenseSettings, {
 * 			onSettingsPage: true,
 * 		} ) );
 *
 * @param {Component} NewComponent The component to render in place of the filtered component.
 * @param {Object}    newProps     The props to pass down to the new component.
 */
export const fillFilterWithComponent = ( NewComponent, newProps ) => {
	return ( OriginalComponent ) => {
		return function InnerComponent( props ) {
			return (
				<NewComponent { ...props } { ...newProps } OriginalComponent={ OriginalComponent } />
			);
		};
	};
};

/**
 * Get Site Kit Admin URL Helper
 *
 * @param { string } page The page slug. Optional. Default is 'googlesitekit-dashboard'.
 * @param { Object } args Optional. Object of argiments to add to the URL.
 *
 * @return string
 */
export const getSiteKitAdminURL = ( page, args ) => {
	const { adminRoot } = googlesitekit.admin;

	if ( ! page ) {
		page = 'googlesitekit-dashboard';
	}

	args = { page, ...args };
	return addQueryArgs( adminRoot, args );
};

/**
 * Verifies whether JSON is valid.
 *
 * @param { string } stringToValidate The string to validate.
 *
 * @return boolean Whether JSON is valid.
 */
export const validateJSON = ( stringToValidate ) => {
	try {
		return ( JSON.parse( stringToValidate ) && !! stringToValidate );
	} catch ( e ) {
		return false;
	}
};

/**
 * Verifies Optimize ID
 *
 * @param { string } stringToValidate The string to validate.
 *
 * @return boolean
 */
export const validateOptimizeID = ( stringToValidate ) => {
	return ( stringToValidate.match( /^GTM-[a-zA-Z\d]{7}$/ ) );
};

/**
 * Appends a notification count icon to the Site Kit dashboard menu/admin bar when
 * user is outside the Site Kit app.
 *
 * Retrieves the number from local storage previously stored by NotificationCounter
 * used in googlesitekit-admin.js
 */
export const appendNotificationsCount = ( count = 0 ) => {
	let menuSelector = null;
	let adminbarSelector = null;

	const counterMenu = document.querySelector( '#toplevel_page_googlesitekit-dashboard #googlesitekit-notifications-counter' );
	const counterAdminbar = document.querySelector( '#wp-admin-bar-google-site-kit #googlesitekit-notifications-counter' );

	if ( counterMenu && counterAdminbar ) {
		return false;
	}

	menuSelector = document.querySelector( '#toplevel_page_googlesitekit-dashboard .wp-menu-name' );
	adminbarSelector = document.querySelector( '#wp-admin-bar-google-site-kit .ab-item' );

	if ( null === menuSelector && null === adminbarSelector ) {
		return false;
	}

	const wrapper = document.createElement( 'span' );
	wrapper.setAttribute( 'class', `googlesitekit-notifications-counter update-plugins count-${ count }` );
	wrapper.setAttribute( 'id', 'googlesitekit-notifications-counter' );

	const pluginCount = document.createElement( 'span' );
	pluginCount.setAttribute( 'class', 'plugin-count' );
	pluginCount.setAttribute( 'aria-hidden', 'true' );
	pluginCount.textContent = count;

	const screenReader = document.createElement( 'span' );
	screenReader.setAttribute( 'class', 'screen-reader-text' );
	screenReader.textContent = sprintf(
		_n(
			'%d notification',
			'%d notifications',
			count,
			'google-site-kit'
		),
		count
	);

	wrapper.appendChild( pluginCount );
	wrapper.appendChild( screenReader );

	if ( menuSelector && null === counterMenu ) {
		menuSelector.appendChild( wrapper );
	}

	if ( adminbarSelector && null === counterAdminbar ) {
		adminbarSelector.appendChild( wrapper );
	}
	return wrapper;
};

/**
 * Send an analytics tracking event.
 *
 * @param {string} eventCategory The event category. Required.
 * @param {string} eventName The event category. Required.
 * @param {string} eventLabel The event category. Optional.
 * @param {string} eventValue The event category. Optional.
 *
 */
export const sendAnalyticsTrackingEvent = ( eventCategory, eventName, eventLabel = '', eventValue = '' ) => {
	if ( 'undefined' === typeof gtag ) {
		return;
	}
	const {
		siteURL,
		siteUserID,
	} = googlesitekit.admin;

	const { isFirstAdmin } = googlesitekit.setup;

	if ( googlesitekit.admin.trackingOptin ) {
		return gtag( 'event', eventName, {
			send_to: googlesitekit.admin.trackingID, /*eslint camelcase: 0*/
			event_category: eventCategory, /*eslint camelcase: 0*/
			event_label: eventLabel, /*eslint camelcase: 0*/
			event_value: eventValue, /*eslint camelcase: 0*/
			dimension1: trimEnd( siteURL, '/' ), // Domain.
			dimension2: isFirstAdmin ? 'true' : 'false', // First Admin?
			dimension3: siteUserID, // Identifier.
		} );
	}
};

export const findTagInHtmlContent = ( html, module ) => {
	let existingTag = false;

	if ( ! html ) {
		return false;
	}

	existingTag = extractTag( html, module );

	return existingTag;
};

/**
 * Looks for existing tag requesting front end html, if no existing tag was found on server side
 * while requesting list of accounts.
 *
 * @param {string} module Module slug.
 *
 * @param {string|null} The tag id if found, otherwise null.
 */
export const getExistingTag = async ( module ) => {
	const { homeURL, ampMode } = googlesitekit.admin;
	const tagFetchQueryArgs = {
		// Indicates a tag checking request. This lets Site Kit know not to output its own tags.
		tagverify: 1,
		// Add a timestamp for cache-busting.
		timestamp: Date.now(),
	};

	// Always check the homepage regardless of AMP mode.
	let tagFound = await scrapeTag( addQueryArgs( homeURL, tagFetchQueryArgs ), module );

	if ( ! tagFound && 'secondary' === ampMode ) {
		tagFound = await apiFetch( { path: '/wp/v2/posts?per_page=1' } ).then(
			// Scrape the first post in AMP mode, if there is one.
			( posts ) => posts.slice( 0, 1 ).map( async ( post ) => {
				return await scrapeTag( addQueryArgs( post.link, { ...tagFetchQueryArgs, amp: 1 } ), module );
			} ).pop()
		);
	}

	return Promise.resolve( tagFound || null );
};

/**
 * Scrapes a module tag from the given URL.
 *
 * @param {string} url URL request and parse tag from.
 * @param {string} module The module to parse tag for.
 *
 * @return {string|null} The tag id if found, otherwise null.
 */
export const scrapeTag = async ( url, module ) => {
	try {
		const html = await fetch( url, { credentials: 'omit' } ).then( ( res ) => res.text() );
		return extractTag( html, module ) || null;
	} catch ( error ) {
		return null;
	}
};

/**
 * Extracts the tag related to a module from the given string by detecting Analytics and AdSense tag variations.
 *
 * @param {string} string The string from where to find the tag.
 * @param {string} tag    The tag to search for, one of 'adsense' or 'analytics'
 *
 * @return string|bool The tag id if found, otherwise false.
 */
export const extractTag = ( string, tag ) => {
	let result = false;
	let reg = null;
	switch ( tag ) {
		case 'analytics':

			// Detect gtag script calls.
			reg = new RegExp( /<script [^>]*src=['|"]https:\/\/www.googletagmanager.com\/gtag\/js\?id=(UA-.*?)['|"][^>]*><\/script>/gm );
			result = reg.exec( string );
			result = result ? result[ 1 ] : false;

			// Detect common analytics code usage.
			if ( ! result ) {
				reg = new RegExp( /<script[^>]*>[^<]+google-analytics\.com\/analytics\.js[^<]+(UA-\d+-\d+)/gm );
				result = reg.exec( string );
				result = result ? result[ 1 ] : false;
			}

			if ( ! result ) {
				reg = new RegExp( /__gaTracker\( ?['|"]create['|"], ?['|"](UA-.*?)['|"], ?['|"]auto['|"] ?\)/gm );
				result = reg.exec( string );
				result = result ? result[ 1 ] : false;
			}

			// Detect ga create calls.
			if ( ! result ) {
				reg = new RegExp( /ga\( ?['|"]create['|"], ?['|"](UA-.*?)['|"], ?['|"]auto['|"] ?\)/gm );
				result = reg.exec( string );
				result = result ? result[ 1 ] : false;
			}
			if ( ! result ) {
				reg = new RegExp( /_gaq.push\( ?\[ ?['|"]_setAccount['|"], ?['|"](UA-.*?)['|"] ?] ?\)/gm );
				result = reg.exec( string );
				result = result ? result[ 1 ] : false;
			}

			// Detect amp-analytics gtag.
			if ( ! result ) {
				reg = new RegExp( /<amp-analytics [^>]*type="gtag"[^>]*>[^<]*<script type="application\/json">[^<]*"gtag_id":\s*"(UA-[^"]+)"/gm );
				result = reg.exec( string );
				result = result ? result[ 1 ] : false;
			}

			// Detect amp-analytics googleanalytics.
			if ( ! result ) {
				reg = new RegExp( /<amp-analytics [^>]*type="googleanalytics"[^>]*>[^<]*<script type="application\/json">[^<]*"account":\s*"(UA-[^"]+)"/gm );
				result = reg.exec( string );
				result = result ? result[ 1 ] : false;
			}

			break;

		case 'adsense':
			// Detect google_ad_client.
			reg = new RegExp( /google_ad_client: ?["|'](.*?)["|']/gm );
			result = reg.exec( string );
			result = result ? result[ 1 ] : false;

			// Detect auto-ads tags.
			if ( ! result ) {
				reg = new RegExp( /<(?:script|amp-auto-ads) [^>]*data-ad-client="([^"]+)"/gm );
				result = reg.exec( string );
				result = result ? result[ 1 ] : false;
			}
			break;
	}

	return result;
};

/**
 * Activate or Deactivate a Module.
 *
 * @param {Object}  restApiClient Rest API client from data module, this needed so we don't need to import data module in helper.
 * @param {string}  moduleSlug    Module slug to activate or deactivate.
 * @param {boolean} status        True if module should be activated, false if it should be deactivated.
 * @return {Promise}
 */
export const activateOrDeactivateModule = ( restApiClient, moduleSlug, status ) => {
	return restApiClient.setModuleActive( moduleSlug, status ).then( ( responseData ) => {
		// We should really be using state management. This is terrible.
		if ( window.googlesitekit.modules && window.googlesitekit.modules[ moduleSlug ] ) {
			window.googlesitekit.modules[ moduleSlug ].active = responseData.active;
		}

		sendAnalyticsTrackingEvent(
			`${ moduleSlug }_setup`,
			! responseData.active ? 'module_deactivate' : 'module_activate',
			moduleSlug,
		);

		return new Promise( ( resolve ) => {
			resolve( responseData );
		} );
	} );
};

/**
 * Helper to toggle confirm changes button disable/enable
 * depending on the module changed settings.
 *
 * @param {string} moduleSlug      The module slug being edited.
 * @param {Object} settingsMapping The mapping between form settings names and saved settings.
 * @param {Object} settingsState   The changed settings component state to compare with.
 * @param {Object} skipDOM         Skip DOm checks/modifications, used for testing.
 * @param {Object}  _googlesitekit googlesitekit global; can be replaced for testing.
 * @return {void|boolean} True if a module has been toggled.
 */
export const toggleConfirmModuleSettings = ( moduleSlug, settingsMapping, settingsState, skipDOM = false, _googlesitekit = googlesitekit ) => {
	const { settings, setupComplete } = _googlesitekit.modules[ moduleSlug ];
	const confirm = skipDOM || document.getElementById( `confirm-changes-${ moduleSlug }` );

	if ( ! setupComplete || ! confirm ) {
		return;
	}

	const currentSettings = [];
	Object.keys( settingsState ).forEach( ( key ) => {
		if ( -1 < Object.keys( settingsMapping ).indexOf( key ) ) {
			currentSettings[ settingsMapping[ key ] ] = settingsState[ key ];
		}
	} );

	const savedSettings = [];
	Object.keys( settings ).forEach( ( key ) => {
		if ( -1 < Object.values( settingsMapping ).indexOf( key ) ) {
			savedSettings[ key ] = settings[ key ];
		}
	} );

	const changed = Object.keys( savedSettings ).filter( ( key ) => {
		if ( savedSettings[ key ] !== currentSettings[ key ] ) {
			return true;
		}

		return false;
	} );

	if ( 0 < changed.length ) {
		if ( skipDOM ) {
			return true;
		}
		confirm.removeAttribute( 'disabled' );
	} else {
		if ( skipDOM ) {
			return false;
		}
		confirm.setAttribute( 'disabled', 'disabled' );
	}
};

/**
 * Trigger error notification on top of the page.
 *
 * @param {Component} ErrorComponent The error component to render in place.
 * @param {Object}    props          The props to pass down to the error component. Optional.
 */
export const showErrorNotification = ( ErrorComponent, props = {} ) => {
	addFilter( 'googlesitekit.ErrorNotification',
		'googlesitekit.ErrorNotification',
		fillFilterWithComponent( ErrorComponent, props ), 1 );
};

/**
 * HTML text into HTML entity.
 *
 * _.unescape doesn't seem to decode some entities for admin bar titles.
 * adding combination in this helper as a workaround.
 *
 * @param {string} str The string to decode.
 *
 * @return {string}
 */
export const decodeHtmlEntity = ( str ) => {
	const decoded = str.replace( /&#(\d+);/g, function( match, dec ) {
		return String.fromCharCode( dec );
	} ).replace( /(\\)/g, '' );

	return unescape( decoded );
};

/**
 * Performs some basic cleanup of a string for use as a post slug
 *
 * Emnulates santize_title() from WordPress core.
 *
 * @return {string} Processed string
 */
export function stringToSlug( string ) {
	return toLower( deburr( trim( string.replace( /[\s./_]+/g, '-' ), '-' ) ) );
}

/**
 * Gets the current dateRange string.
 *
 * @return {string} the date range string.
 */
export function getCurrentDateRange() {
	/**
	 * Filter the date range used for queries.
	 *
	 * @param String The selected date range. Default 'Last 28 days'.
	 */
	return applyFilters( 'googlesitekit.dateRange', __( 'Last 28 days', 'google-site-kit' ) );
}

/**
 * Return the currently selected date range as a string that fits in the sentence:
 * "Data for the last [date range]", eg "Date for the last 28 days".
 */
export function getDateRangeFrom() {
	return getCurrentDateRange().replace( 'Last ', '' );
}

/**
 * Gets the current dateRange slug.
 *
 * @return {string} the date range slug.
 */
export function getCurrentDateRangeSlug() {
	return stringToSlug( getCurrentDateRange() );
}

/**
 * Get the icon for a module.
 *
 * @param {string}  module                The module slug.
 * @param {boolean} blockedByParentModule Whether the module is blocked by a parent module.
 * @param {string}  width                 The icon width.
 * @param {string}  height                The icon height.
 * @param {string}  class                 Class string to use for icon.
 */
export function moduleIcon( module, blockedByParentModule, width = '33', height = '33', useClass = '' ) {
	if ( ! googlesitekit ) {
		return;
	}

	/* Set module icons. Page Speed Insights is a special case because only a .png is available. */
	let iconComponent = <SvgIcon id={ module } width={ width } height={ height } className={ useClass } />;

	if ( blockedByParentModule ) {
		iconComponent = <SvgIcon id={ `${ module }-disabled` } width={ width } height={ height } className={ useClass } />;
	} else if ( 'pagespeed-insights' === module ) {
		iconComponent = <img src={ googlesitekit.admin.assetsRoot + 'images/icon-pagespeed.png' } width={ width } alt="" className={ useClass } />;
	}

	return iconComponent;
}

/**
 * Clears session storage and local storage.
 *
 * Both of these should be cleared to make sure no Site Kit data is left in the
 * browser's cache regardless of which storage implementation is used.
 */
export function clearAppLocalStorage() {
	if ( window.localStorage ) {
		window.localStorage.clear();
	}
	if ( window.sessionStorage ) {
		window.sessionStorage.clear();
	}
}

/**
 * Sorts an object by its keys.
 *
 * The returned value will be a sorted copy of the input object.
 * Any inner objects will also be sorted recursively.
 *
 * @param {Object} obj The data object to sort.
 * @return {Object} The sorted data object.
 */
export function sortObjectProperties( obj ) {
	const orderedData = {};
	Object.keys( obj ).sort().forEach( ( key ) => {
		let val = obj[ key ];
		if ( val && 'object' === typeof val && ! Array.isArray( val ) ) {
			val = sortObjectProperties( val );
		}
		orderedData[ key ] = val;
	} );
	return orderedData;
}
