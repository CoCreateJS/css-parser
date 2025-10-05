/********************************************************************************
 * Copyright (C) 2020 CoCreate LLC and others.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import observer from "@cocreate/observer";
import localStorage from "@cocreate/local-storage";

/**
 * @typedef {('xxxs'|'xxs'|'xs'|'sm'|'md'|'lg'|'xl'|'xxl')} MediaRangeName
 * * Defines a comprehensive set of responsive screen size breakpoints in pixels (or device-independent pixels).
 * The ranges are inclusive on the minimum width and exclusive on the maximum width (max-width - 1).
 * '0' in the second position of a range signifies 'and up' (e.g., [1401, 0] means >= 1401px).
 *
 * Tiers:
 * - xxxs: Smallest Smartwatches (0px to 191px)
 * - xxs: Medium-Large Smartwatches (192px to 319px)
 * - xs: Smallest Smartphones (320px to 575px)
 * - sm: Landscape Phones & Small Tablets (576px to 768px)
 * - md: Tablets (769px to 992px)
 * - lg: Small Desktops & Laptops (993px to 1200px)
 * - xl: Standard Desktops (1201px to 1400px)
 * - xxl: Large Monitors, TVs (1401px and up)
 * * @type {MediaRangeName[]}
 */
const mediaRangeNames = ["xxxs", "xxs", "xs", "sm", "md", "lg", "xl", "xxl"];

/**
 * @type {Object.<MediaRangeName, [number, number]>}
 */
const ranges = {
    xxxs: [0, 191], 
    xxs: [192, 319], 
    xs: [320, 575], 
    sm: [576, 768], 
    md: [769, 992], 
    lg: [993, 1200], 
    xl: [1201, 1400], 
    xxl: [1401, 0]
};

// Rule III.5.a: Magic Aliases (used by parseMediaQueryString)
const mediaFeatureAliases = {
	dark: "prefers-color-scheme",
	light: "prefers-color-scheme",
	landscape: "orientation",
	portrait: "orientation",
	print: "print",
	screen: "screen"
};

/**
 * @typedef {('h-xxxs'|'h-xxs'|'h-xs'|'h-sm'|'h-md'|'h-lg'|'h-xl'|'h-xxl')} HeightRangeName
 *
 * Defines a comprehensive set of responsive screen size breakpoints for the 
 * vertical (height) dimension in pixels (or device-independent pixels).
 * The numerical values mirror the width breakpoints to maintain a unified 
 * design scale across orientation flips (e.g., a 769px screen is 'md' size, 
 * whether it's width or height).
 *
 * The ranges are inclusive on the minimum and exclusive on the maximum (max-1).
 * '0' in the second position signifies 'and up'.
 *
 * Tiers:
 * - h-xxxs: Smallest Smartwatches (0px to 191px)
 * - h-xxs: Medium-Large Smartwatches (192px to 319px)
 * - h-xs: Smallest Phones Landscape / Extreme Condensation (320px to 575px)
 * - h-sm: Landscape Phones & Small Tablets (576px to 768px)
 * - h-md: Tablets / Comfortable Vertical Space (769px to 992px)
 * - h-lg: Small Desktops / Ample Vertical Space (993px to 1200px)
 * - h-xl: Standard Desktops (1201px to 1400px)
 * - h-xxl: Large Monitors, TVs (1401px and up)
 * * NOTE: These are typically used with 'max-height' CSS media queries to trigger 
 * condensation (removing complexity as vertical space runs out).
 */
const heightRangeNames = ["h-xxxs", "h-xxs", "h-xs", "h-sm", "h-md", "h-lg", "h-xl", "h-xxl"];

/**
 * The Height Breakpoint Ranges.
 * @type {Object.<HeightRangeName, [number, number]>}
 */
const heightRanges = {
    'h-xxxs': [0, 191], 
    'h-xxs': [192, 319], 
    'h-xs': [320, 575], 
    'h-sm': [576, 768], 
    'h-md': [769, 992], 
    'h-lg': [993, 1200], 
    'h-xl': [1201, 1400], 
    'h-xxl': [1401, 0]
};

// classNameList will now store the directClassName for className attribute rules
// and the declarationsByMediaQuery object for merging.
let classNameList = new Map();
let tempStyleList = [];
let parsedCSS = [];
let linkCSS = []; // Added back to store rules from the linked stylesheet
let styleElSheet;
let parse;
let linkTag;

function escapeClassName(str) {
	if (typeof CSS !== "undefined" && CSS.escape) {
		return CSS.escape(str);
	}
	// Fallback for browsers that don't support CSS.escape
	return str.replace(
		/[^_a-zA-Z0-9-]/g,
		(c) => "\\" + c.charCodeAt(0).toString(16).padStart(2, "0")
	);
}

function init(_linkTag) {
	linkTag = _linkTag;
	if (!linkTag) return;

	parse = linkTag.getAttribute("parse");

	// Use existing style element if it exists, otherwise create a new one
	let styleEl =
		document.getElementById("CoCreateCSS_Rules") ||
		document.createElement("style");
	styleEl.id = "CoCreateCSS_Rules";
	styleEl.setAttribute("component", "css-parser");

	// Append to head if not already present
	if (!document.head.contains(styleEl)) {
		document.head.appendChild(styleEl);
	}
	// Get the stylesheet object
	styleElSheet = styleEl.sheet;

	// Check localStorage for parse setting if not explicitly set on the link tag
	if (parse === null && typeof localStorage !== "undefined") {
		parse = localStorage.getItem("cssParser");
	}

	// If parse is explicitly false, stop initialization
	if (parse === "false" || parse === false) return;

	// Parse existing CSS from the linked stylesheet
	parseLinkCSS();

	// Add getValue function to linkTag for saving
	linkTag.getValue = () => {
		const onlyUnique = (value, index, self) => {
			return self.indexOf(value) === index;
		};

		const urlObject = new URL(linkTag.href);
		const pathParts = urlObject.pathname.split("/");

		let data = {};
		data.name = pathParts[pathParts.length - 1];
		data.path = urlObject.pathname.replace(data.name, "");
		data.pathname = urlObject.pathname;
		// Combine parsed and linked CSS, filter for uniqueness, and join
		data.src = parsedCSS.concat(linkCSS).filter(onlyUnique).join("\r\n");
		data["content-type"] = "text/css";

		return data;
	};

	// If parse is true or null, initialize elements
	if (parse === "true" || parse === true || parse === null) {
		let elements = document.querySelectorAll("[class]");
		initElements(elements);
	}

	// Initialize observers for dynamic changes
	observerInit();
}

function initElements(elements) {
	// Process each element with a class attribute
	for (let el of elements) {
		if (el.classList && el.classList.length > 0) {
			initElement(el);
		}
	}
	// Add all newly generated rules to the stylesheet
	addNewRules();
}

function initElement(element) {
	const classList = element.classList;
	const directClassName = element.getAttribute("className");
	const classAttrValue = element.getAttribute("class");

	// Parse all classes in the classList to get rule details including the full rule string
	// parseClassList now handles splitting by '@' for multiple media queries within one class name
	const parsedRuleDetails = parseClassList(classList);

	// Process atomic rules first if no className attribute is present
	if (!(directClassName && classAttrValue)) {
		parsedRuleDetails.forEach((ruleDetail) => {
			// Check if this atomic class name has already been processed
			// Note: ruleDetail.className will now include the @ and media query part if it exists
			if (classNameList.has(ruleDetail.className)) {
				return; // Skip if already processed
			}

			// Add the full atomic rule string to the temporary list
			tempStyleList.push(ruleDetail.ruleString);
			classNameList.set(ruleDetail.className, true); // Mark the atomic class name as processed
		});
	}

	// Now, if className attribute exists and class attribute has value, process combined rules
	if (directClassName && classAttrValue) {
		// Get existing declarations or initialize new ones for this className
		const existingDeclarationsByMediaQuery = classNameList.get(
			directClassName
		) || { nonMedia: [] };

		// Object to group declarations from the current element's classList by media query
		const newDeclarationsByMediaQuery = {
			nonMedia: []
		};

		// Group declarations from parsed rule details by media query for the current element
		// Note: parsedRuleDetails now contains details for each @ segment within a class name
		parsedRuleDetails.forEach((ruleDetail) => {
			if (ruleDetail.declarationString) {
				// Ensure declarationString exists
				const mediaQuery = ruleDetail.isMedia
					? ruleDetail.mediaQuery
					: "nonMedia";
				if (!newDeclarationsByMediaQuery[mediaQuery]) {
					newDeclarationsByMediaQuery[mediaQuery] = [];
				}
				newDeclarationsByMediaQuery[mediaQuery].push(
					ruleDetail.declarationString
				);
			}
		});

		// Merge new declarations into existing ones
		let declarationsMerged = false;
		for (const mediaQueryString in newDeclarationsByMediaQuery) {
			const newDeclarations =
				newDeclarationsByMediaQuery[mediaQueryString];
			if (newDeclarations.length > 0) {
				if (!existingDeclarationsByMediaQuery[mediaQueryString]) {
					existingDeclarationsByMediaQuery[mediaQueryString] = [];
				}
				// Add only unique new declarations to avoid duplicates during merge
				newDeclarations.forEach((decl) => {
					if (
						!existingDeclarationsByMediaQuery[
							mediaQueryString
						].includes(decl)
					) {
						existingDeclarationsByMediaQuery[mediaQueryString].push(
							decl
						);
						declarationsMerged = true;
					}
				});
			}
		}

		// If any new declarations were merged, update classNameList and regenerate rules
		// Also regenerate if this className is being processed for the first time
		if (declarationsMerged || !classNameList.has(directClassName)) {
			// Store the updated declarationsByMediaQuery object in classNameList
			classNameList.set(
				directClassName,
				existingDeclarationsByMediaQuery
			);

			// Remove old rules for this className from tempStyleList and parsedCSS
			// This is a simple approach; a more robust solution might track rule indices
			tempStyleList = tempStyleList.filter(
				(rule) => !rule.includes(`.${escapeClassName(directClassName)}`)
			);
			parsedCSS = parsedCSS.filter(
				(rule) => !rule.includes(`.${escapeClassName(directClassName)}`)
			);

			const escapedDirectClassName = escapeClassName(directClassName);

			// Generate rules for the className selector based on merged declarations
			for (const mediaQueryString in existingDeclarationsByMediaQuery) {
				const declarations =
					existingDeclarationsByMediaQuery[mediaQueryString];
				if (declarations.length > 0) {
					const combinedDeclarations = declarations.join("; ");
					const ruleContent = `.${escapedDirectClassName} { ${combinedDeclarations}; }`;

					if (mediaQueryString === "nonMedia") {
						// Create a regular rule for non-media declarations
						const rule = ruleContent;
						tempStyleList.push(rule);
					} else {
						// Create a media query rule
						const mediaRule = `@media ${mediaQueryString} { ${ruleContent} }`;
						tempStyleList.push(mediaRule);
					}
				}
			}
		}
	}
}

// Helper function to parse media query string from class name part (e.g., "@sm&dark")
function parseMediaQueryString(mediaQueryPart) {
	if (!mediaQueryPart.startsWith("@")) return null;
	const actualGroup = mediaQueryPart.substring(1);

	const featuresRaw = actualGroup.split("&");
	const conditions = [];

	for (let featStr of featuresRaw) {
		featStr = featStr.trim();
		if (!featStr) continue;

		if (featStr.startsWith("(") && featStr.endsWith(")")) {
			conditions.push(featStr.replace(/_/g, " "));
			continue;
		}

		if (mediaFeatureAliases[featStr]) {
			const mappedFeature = mediaFeatureAliases[featStr];
			if (mappedFeature === "print" || mappedFeature === "screen") {
				conditions.push(mappedFeature);
			} else {
				conditions.push(`(${mappedFeature}: ${featStr})`);
			}
			continue;
		}

		if (mediaRangeNames.includes(featStr)) {
			const [min, max] = ranges[featStr];
			const rangeConditions = [];
			if (min > 0 || featStr === "xxxs") {
				rangeConditions.push(`(min-width: ${min}px)`);
			}
			if (max > 0) {
				rangeConditions.push(`(max-width: ${max}px)`);
			}
			if (rangeConditions.length > 0) {
				if (rangeConditions.length === 1) {
					conditions.push(rangeConditions[0]);
				} else if (rangeConditions.length === 2) {
					conditions.push(rangeConditions.join(" and "));
				}
			}
			continue;
		}

		if (heightRangeNames.includes(featStr)) {
			const [min, max] = heightRanges[featStr];
			const rangeConditions = [];
			if (min > 0 || featStr === "h-xxxs") {
				rangeConditions.push(`(min-height: ${min}px)`);
			}
			if (max > 0) {
				rangeConditions.push(`(max-height: ${max}px)`);
			}
			if (rangeConditions.length > 0) {
				if (rangeConditions.length === 1) {
					conditions.push(rangeConditions[0]);
				} else if (rangeConditions.length === 2) {
					conditions.push(rangeConditions.join(" and "));
				}
			}
			continue;
		}

		if (/^\d+(\.\d+)?\D+$/.test(featStr) && !featStr.includes(":")) {
			conditions.push(`(max-width: ${featStr.replace(/_/g, " ")})`);
			continue;
		}

		if (featStr.includes(":")) {
			const [featureName, ...featureValueParts] = featStr.split(":");
			const featureValue = featureValueParts.join(":").replace(/_/g, " ");
			conditions.push(`(${featureName.trim()}: ${featureValue.trim()})`);
			continue;
		}
		conditions.push(featStr.replace(/_/g, " "));
	}

	if (conditions.length > 0) {
		return conditions.join(" and ");
	}
	return null;
}

function parseClassList(classList) {
	const parsedDetails = [];
	// Iterate through each class name on an element
	for (let className of classList) {
		// Skip if the class doesn't contain ':'
		if (!className.includes(":")) {
			continue;
		}

		// Split the class name by '@' to handle multiple media queries within one class name
		const classNameParts = className.split("@");

		let baseDeclarationPart = classNameParts[0];
		let important = "";
		if (baseDeclarationPart.includes("!important")) {
			const parts = baseDeclarationPart.split("!important");
			baseDeclarationPart = parts[0];
			important = " !important"; // Add space before !important
		}

		const parts = baseDeclarationPart.split(":");
		if (parts.length < 2) {
			// If the base part doesn't have a property:value, skip this class name
			continue;
		}

		const property = parts.shift().trim();
		const rawValue = parts.join(":").trim();
		const value = rawValue.replace(/_/g, " ");
		const declarationString = `${property}: ${value}${important}`;
		const escapedClassName = escapeClassName(baseDeclarationPart);
		const selectorClass = escapeClassName(className);

		// const escapedClassName = escapeClassName(className);
		if (classNameParts.length === 1) {
			// Process the base declaration part (non-media)
			parsedDetails.push({
				className: selectorClass,
				declarationString: declarationString,
				isMedia: false,
				mediaQuery: null,
				ruleString: `.${selectorClass} { ${declarationString}; }`
			});
		} else {
			// Process each media query part
			for (let i = 1; i < classNameParts.length; i++) {
				const mediaQuerySegment = classNameParts[i];
				const fullMediaQueryPart = `@${mediaQuerySegment}`; // Add the '@' back

				const mediaQueryString =
					parseMediaQueryString(fullMediaQueryPart);

				if (mediaQueryString) {
					// Generate the full atomic media query rule string
					const ruleContent = `.${selectorClass} { ${declarationString}; }`;
					const ruleString = `@media ${mediaQueryString} { ${ruleContent} }`;

					parsedDetails.push({
						className: selectorClass,
						declarationString: declarationString,
						isMedia: true,
						mediaQuery: mediaQueryString,
						ruleString: ruleString
					});
				}
			}
		}
	}
	return parsedDetails; // Return the list of parsed rule details
}

function parseLinkCSS() {
	// If a linkTag and its sheet exist
	if (linkTag && linkTag.sheet) {
		let Rules = linkTag.sheet.cssRules;
		if (Rules) {
			// Iterate through existing rules in the linked stylesheet
			for (let rule of Rules) {
				try {
					// Store the CSS text of the rule
					linkCSS.push(rule.cssText);
					// If the rule has a selector (e.g., a class rule)
					if (rule.selectorText) {
						// Add the selector (cleaned) to classNameList to avoid re-parsing
						classNameList.set(
							rule.selectorText.replace(/[.\\]/g, ""),
							true
						);
					} else if (rule.cssRules) {
						// If it's a media query rule, iterate through its inner rules
						for (let innerRule of rule.cssRules) {
							if (innerRule.selectorText) {
								// Add inner rule selectors to classNameList
								classNameList.set(
									innerRule.selectorText.replace(
										/[.\\]/g,
										""
									),
									true
								);
							}
						}
					}
				} catch (err) {
					console.error("Error parsing linked CSS rule:", err);
				}
			}
		}
	}
}

let saveTimeout;
function addNewRules() {
	if (tempStyleList.length === 0) return; // If no new rules, do nothing

	// Add new rules to the style sheet and parsedCSS array
	for (let i = 0, len = tempStyleList.length; i < len; i++) {
		let rule = tempStyleList[i];
		let low = 0,
			high = parsedCSS.length;
		// Find the correct insertion index to keep parsedCSS sorted
		while (low < high) {
			let mid = (low + high) >>> 1;
			if (rule < parsedCSS[mid]) high = mid;
			else low = mid + 1;
		}
		let insertIndex = low;
		// Ensure insert index is within bounds of the actual stylesheet rules
		if (styleElSheet && insertIndex > styleElSheet.cssRules.length) {
			insertIndex = styleElSheet.cssRules.length;
		}
		try {
			// Insert the rule into the stylesheet
			if (styleElSheet) {
				styleElSheet.insertRule(rule, insertIndex);
			}
			// Insert the rule into the sorted parsedCSS array
			parsedCSS.splice(low, 0, rule);
		} catch (err) {
			console.error("Failed to insert rule:", rule, err); // Log errors if insertion fails.
		}
	}

	// If there are new rules and a linkTag with a save function exists, trigger save after a delay.
	if (
		tempStyleList.length > 0 &&
		linkTag &&
		typeof linkTag.save === "function"
	) {
		clearTimeout(saveTimeout); // Clear any existing timeout
		saveTimeout = setTimeout(() => {
			linkTag.save(); // Call the save function
		}, 1000); // Save after 1 second delay
	}
	tempStyleList = []; // Clear the temporary list
}

const observerInit = () => {
	observer.init({
		name: "ccCss",
		types: ["addedNodes"],
		selector: "[class]",
		callback: (mutation) => {
			if (parse != "false") initElements([mutation.target]);
		}
	});

	observer.init({
		name: "ccCss",
		types: ["attributes"],
		attributeFilter: ["class", "className"],
		callback: (mutation) => {
			if (parse != "false") initElements([mutation.target]);
		}
	});
};

observer.init({
	name: "cssParseAddedNode",
	types: ["addedNodes"],
	selector: "link[parse], link[save], link[object]",
	callback: (mutation) => {
		init(mutation.target);
	}
});

observer.init({
	name: "cssParseattributes",
	types: ["attributes"],
	attributeFilter: ["parse", "save", "object"], //ff
	selector: "link",
	callback: (mutation) => {
		init(mutation.target);
	}
});

// Auto-initialize if a relevant link tag is found on page load
const autoInitLinkTag = document.querySelector(
	"link[parse], link[array][object][key]"
);
if (autoInitLinkTag) {
	init(autoInitLinkTag);
}

// Export functions for external use
export default { initElements, init };
