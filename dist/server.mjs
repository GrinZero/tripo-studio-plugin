// src/server.mjs
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";

// node_modules/@openai/mcp-extensions/dist/server/forms/elicitation.js
import { z as z4 } from "zod";

// node_modules/@cfworker/json-schema/dist/esm/deep-compare-strict.js
function deepCompareStrict(a, b) {
  const typeofa = typeof a;
  if (typeofa !== typeof b) {
    return false;
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) {
      return false;
    }
    const length = a.length;
    if (length !== b.length) {
      return false;
    }
    for (let i = 0; i < length; i++) {
      if (!deepCompareStrict(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }
  if (typeofa === "object") {
    if (!a || !b) {
      return a === b;
    }
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    const length = aKeys.length;
    if (length !== bKeys.length) {
      return false;
    }
    for (const k of aKeys) {
      if (!deepCompareStrict(a[k], b[k])) {
        return false;
      }
    }
    return true;
  }
  return a === b;
}

// node_modules/@cfworker/json-schema/dist/esm/pointer.js
function encodePointer(p) {
  return encodeURI(escapePointer(p));
}
function escapePointer(p) {
  return p.replace(/~/g, "~0").replace(/\//g, "~1");
}

// node_modules/@cfworker/json-schema/dist/esm/dereference.js
var schemaArrayKeyword = {
  prefixItems: true,
  items: true,
  allOf: true,
  anyOf: true,
  oneOf: true
};
var schemaMapKeyword = {
  $defs: true,
  definitions: true,
  properties: true,
  patternProperties: true,
  dependentSchemas: true
};
var ignoredKeyword = {
  id: true,
  $id: true,
  $ref: true,
  $schema: true,
  $anchor: true,
  $vocabulary: true,
  $comment: true,
  default: true,
  enum: true,
  const: true,
  required: true,
  type: true,
  maximum: true,
  minimum: true,
  exclusiveMaximum: true,
  exclusiveMinimum: true,
  multipleOf: true,
  maxLength: true,
  minLength: true,
  pattern: true,
  format: true,
  maxItems: true,
  minItems: true,
  uniqueItems: true,
  maxProperties: true,
  minProperties: true
};
var initialBaseURI = typeof self !== "undefined" && self.location && self.location.origin !== "null" ? new URL(self.location.origin + self.location.pathname + location.search) : new URL("https://github.com/cfworker");
function dereference(schema, lookup = /* @__PURE__ */ Object.create(null), baseURI = initialBaseURI, basePointer = "") {
  if (schema && typeof schema === "object" && !Array.isArray(schema)) {
    const id3 = schema.$id || schema.id;
    if (id3) {
      const url = new URL(id3, baseURI.href);
      if (url.hash.length > 1) {
        lookup[url.href] = schema;
      } else {
        url.hash = "";
        if (basePointer === "") {
          baseURI = url;
        } else {
          dereference(schema, lookup, baseURI);
        }
      }
    }
  } else if (schema !== true && schema !== false) {
    return lookup;
  }
  const schemaURI = baseURI.href + (basePointer ? "#" + basePointer : "");
  if (lookup[schemaURI] !== void 0) {
    throw new Error(`Duplicate schema URI "${schemaURI}".`);
  }
  lookup[schemaURI] = schema;
  if (schema === true || schema === false) {
    return lookup;
  }
  if (schema.__absolute_uri__ === void 0) {
    Object.defineProperty(schema, "__absolute_uri__", {
      enumerable: false,
      value: schemaURI
    });
  }
  if (schema.$ref && schema.__absolute_ref__ === void 0) {
    const url = new URL(schema.$ref, baseURI.href);
    url.hash = url.hash;
    Object.defineProperty(schema, "__absolute_ref__", {
      enumerable: false,
      value: url.href
    });
  }
  if (schema.$recursiveRef && schema.__absolute_recursive_ref__ === void 0) {
    const url = new URL(schema.$recursiveRef, baseURI.href);
    url.hash = url.hash;
    Object.defineProperty(schema, "__absolute_recursive_ref__", {
      enumerable: false,
      value: url.href
    });
  }
  if (schema.$anchor) {
    const url = new URL("#" + schema.$anchor, baseURI.href);
    lookup[url.href] = schema;
  }
  for (let key in schema) {
    if (ignoredKeyword[key]) {
      continue;
    }
    const keyBase = `${basePointer}/${encodePointer(key)}`;
    const subSchema = schema[key];
    if (Array.isArray(subSchema)) {
      if (schemaArrayKeyword[key]) {
        const length = subSchema.length;
        for (let i = 0; i < length; i++) {
          dereference(subSchema[i], lookup, baseURI, `${keyBase}/${i}`);
        }
      }
    } else if (schemaMapKeyword[key]) {
      for (let subKey in subSchema) {
        dereference(subSchema[subKey], lookup, baseURI, `${keyBase}/${encodePointer(subKey)}`);
      }
    } else {
      dereference(subSchema, lookup, baseURI, keyBase);
    }
  }
  return lookup;
}

// node_modules/@cfworker/json-schema/dist/esm/format.js
var DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
var DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var TIME = /^(\d\d):(\d\d):(\d\d)(\.\d+)?(z|[+-]\d\d(?::?\d\d)?)?$/i;
var HOSTNAME = /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i;
var URIREF = /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
var URITEMPLATE = /^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i;
var URL_ = /^(?:(?:https?|ftp):\/\/)(?:\S+(?::\S*)?@)?(?:(?!10(?:\.\d{1,3}){3})(?!127(?:\.\d{1,3}){3})(?!169\.254(?:\.\d{1,3}){2})(?!192\.168(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u{00a1}-\u{ffff}0-9]+-?)*[a-z\u{00a1}-\u{ffff}0-9]+)(?:\.(?:[a-z\u{00a1}-\u{ffff}0-9]+-?)*[a-z\u{00a1}-\u{ffff}0-9]+)*(?:\.(?:[a-z\u{00a1}-\u{ffff}]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/iu;
var UUID = /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
var JSON_POINTER = /^(?:\/(?:[^~/]|~0|~1)*)*$/;
var JSON_POINTER_URI_FRAGMENT = /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i;
var RELATIVE_JSON_POINTER = /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/;
var EMAIL = (input) => {
  if (input[0] === '"')
    return false;
  const [name, host, ...rest] = input.split("@");
  if (!name || !host || rest.length !== 0 || name.length > 64 || host.length > 253)
    return false;
  if (name[0] === "." || name.endsWith(".") || name.includes(".."))
    return false;
  if (!/^[a-z0-9.-]+$/i.test(host) || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(name))
    return false;
  return host.split(".").every((part) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i.test(part));
};
var IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
var IPV6 = /^((([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){6}(:[0-9a-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){5}(((:[0-9a-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){4}(((:[0-9a-f]{1,4}){1,3})|((:[0-9a-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){3}(((:[0-9a-f]{1,4}){1,4})|((:[0-9a-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){2}(((:[0-9a-f]{1,4}){1,5})|((:[0-9a-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){1}(((:[0-9a-f]{1,4}){1,6})|((:[0-9a-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-f]{1,4}){1,7})|((:[0-9a-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/i;
var DURATION = (input) => input.length > 1 && input.length < 80 && (/^P\d+([.,]\d+)?W$/.test(input) || /^P[\dYMDTHS]*(\d[.,]\d+)?[YMDHS]$/.test(input) && /^P([.,\d]+Y)?([.,\d]+M)?([.,\d]+D)?(T([.,\d]+H)?([.,\d]+M)?([.,\d]+S)?)?$/.test(input));
function bind(r) {
  return r.test.bind(r);
}
var format = {
  date,
  time: time.bind(void 0, false),
  "date-time": date_time,
  duration: DURATION,
  uri,
  "uri-reference": bind(URIREF),
  "uri-template": bind(URITEMPLATE),
  url: bind(URL_),
  email: EMAIL,
  hostname: bind(HOSTNAME),
  ipv4: bind(IPV4),
  ipv6: bind(IPV6),
  regex,
  uuid: bind(UUID),
  "json-pointer": bind(JSON_POINTER),
  "json-pointer-uri-fragment": bind(JSON_POINTER_URI_FRAGMENT),
  "relative-json-pointer": bind(RELATIVE_JSON_POINTER)
};
function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
function date(str) {
  const matches = str.match(DATE);
  if (!matches)
    return false;
  const year = +matches[1];
  const month = +matches[2];
  const day = +matches[3];
  return month >= 1 && month <= 12 && day >= 1 && day <= (month == 2 && isLeapYear(year) ? 29 : DAYS[month]);
}
function time(full, str) {
  const matches = str.match(TIME);
  if (!matches)
    return false;
  const hour = +matches[1];
  const minute = +matches[2];
  const second = +matches[3];
  const timeZone = !!matches[5];
  return (hour <= 23 && minute <= 59 && second <= 59 || hour == 23 && minute == 59 && second == 60) && (!full || timeZone);
}
var DATE_TIME_SEPARATOR = /t|\s/i;
function date_time(str) {
  const dateTime = str.split(DATE_TIME_SEPARATOR);
  return dateTime.length == 2 && date(dateTime[0]) && time(true, dateTime[1]);
}
var NOT_URI_FRAGMENT = /\/|:/;
var URI_PATTERN = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
function uri(str) {
  return NOT_URI_FRAGMENT.test(str) && URI_PATTERN.test(str);
}
var Z_ANCHOR = /[^\\]\\Z/;
function regex(str) {
  if (Z_ANCHOR.test(str))
    return false;
  try {
    new RegExp(str, "u");
    return true;
  } catch (e) {
    return false;
  }
}

// node_modules/@cfworker/json-schema/dist/esm/types.js
var OutputFormat;
(function(OutputFormat2) {
  OutputFormat2[OutputFormat2["Flag"] = 1] = "Flag";
  OutputFormat2[OutputFormat2["Basic"] = 2] = "Basic";
  OutputFormat2[OutputFormat2["Detailed"] = 4] = "Detailed";
})(OutputFormat || (OutputFormat = {}));

// node_modules/@cfworker/json-schema/dist/esm/ucs2-length.js
function ucs2length(s) {
  let result = 0;
  let length = s.length;
  let index = 0;
  let charCode;
  while (index < length) {
    result++;
    charCode = s.charCodeAt(index++);
    if (charCode >= 55296 && charCode <= 56319 && index < length) {
      charCode = s.charCodeAt(index);
      if ((charCode & 64512) == 56320) {
        index++;
      }
    }
  }
  return result;
}

// node_modules/@cfworker/json-schema/dist/esm/validate.js
function validate(instance, schema, draft = "2019-09", lookup = dereference(schema), shortCircuit = true, recursiveAnchor = null, instanceLocation = "#", schemaLocation = "#", evaluated = /* @__PURE__ */ Object.create(null)) {
  if (schema === true) {
    return { valid: true, errors: [] };
  }
  if (schema === false) {
    return {
      valid: false,
      errors: [
        {
          instanceLocation,
          keyword: "false",
          keywordLocation: instanceLocation,
          error: "False boolean schema."
        }
      ]
    };
  }
  const rawInstanceType = typeof instance;
  let instanceType;
  switch (rawInstanceType) {
    case "boolean":
    case "number":
    case "string":
      instanceType = rawInstanceType;
      break;
    case "object":
      if (instance === null) {
        instanceType = "null";
      } else if (Array.isArray(instance)) {
        instanceType = "array";
      } else {
        instanceType = "object";
      }
      break;
    default:
      throw new Error(`Instances of "${rawInstanceType}" type are not supported.`);
  }
  const { $ref, $recursiveRef, $recursiveAnchor, type: $type, const: $const, enum: $enum, required: $required, not: $not, anyOf: $anyOf, allOf: $allOf, oneOf: $oneOf, if: $if, then: $then, else: $else, format: $format, properties: $properties, patternProperties: $patternProperties, additionalProperties: $additionalProperties, unevaluatedProperties: $unevaluatedProperties, minProperties: $minProperties, maxProperties: $maxProperties, propertyNames: $propertyNames, dependentRequired: $dependentRequired, dependentSchemas: $dependentSchemas, dependencies: $dependencies, prefixItems: $prefixItems, items: $items, additionalItems: $additionalItems, unevaluatedItems: $unevaluatedItems, contains: $contains, minContains: $minContains, maxContains: $maxContains, minItems: $minItems, maxItems: $maxItems, uniqueItems: $uniqueItems, minimum: $minimum, maximum: $maximum, exclusiveMinimum: $exclusiveMinimum, exclusiveMaximum: $exclusiveMaximum, multipleOf: $multipleOf, minLength: $minLength, maxLength: $maxLength, pattern: $pattern, __absolute_ref__, __absolute_recursive_ref__ } = schema;
  const errors = [];
  if ($recursiveAnchor === true && recursiveAnchor === null) {
    recursiveAnchor = schema;
  }
  if ($recursiveRef === "#") {
    const refSchema = recursiveAnchor === null ? lookup[__absolute_recursive_ref__] : recursiveAnchor;
    const keywordLocation = `${schemaLocation}/$recursiveRef`;
    const result = validate(instance, recursiveAnchor === null ? schema : recursiveAnchor, draft, lookup, shortCircuit, refSchema, instanceLocation, keywordLocation, evaluated);
    if (!result.valid) {
      errors.push({
        instanceLocation,
        keyword: "$recursiveRef",
        keywordLocation,
        error: "A subschema had errors."
      }, ...result.errors);
    }
  }
  if ($ref !== void 0) {
    const uri2 = __absolute_ref__ || $ref;
    const refSchema = lookup[uri2];
    if (refSchema === void 0) {
      let message = `Unresolved $ref "${$ref}".`;
      if (__absolute_ref__ && __absolute_ref__ !== $ref) {
        message += `  Absolute URI "${__absolute_ref__}".`;
      }
      message += `
Known schemas:
- ${Object.keys(lookup).join("\n- ")}`;
      throw new Error(message);
    }
    const keywordLocation = `${schemaLocation}/$ref`;
    const result = validate(instance, refSchema, draft, lookup, shortCircuit, recursiveAnchor, instanceLocation, keywordLocation, evaluated);
    if (!result.valid) {
      errors.push({
        instanceLocation,
        keyword: "$ref",
        keywordLocation,
        error: "A subschema had errors."
      }, ...result.errors);
    }
    if (draft === "4" || draft === "7") {
      return { valid: errors.length === 0, errors };
    }
  }
  if (Array.isArray($type)) {
    let length = $type.length;
    let valid = false;
    for (let i = 0; i < length; i++) {
      if (instanceType === $type[i] || $type[i] === "integer" && instanceType === "number" && instance % 1 === 0 && instance === instance) {
        valid = true;
        break;
      }
    }
    if (!valid) {
      errors.push({
        instanceLocation,
        keyword: "type",
        keywordLocation: `${schemaLocation}/type`,
        error: `Instance type "${instanceType}" is invalid. Expected "${$type.join('", "')}".`
      });
    }
  } else if ($type === "integer") {
    if (instanceType !== "number" || instance % 1 || instance !== instance) {
      errors.push({
        instanceLocation,
        keyword: "type",
        keywordLocation: `${schemaLocation}/type`,
        error: `Instance type "${instanceType}" is invalid. Expected "${$type}".`
      });
    }
  } else if ($type !== void 0 && instanceType !== $type) {
    errors.push({
      instanceLocation,
      keyword: "type",
      keywordLocation: `${schemaLocation}/type`,
      error: `Instance type "${instanceType}" is invalid. Expected "${$type}".`
    });
  }
  if ($const !== void 0) {
    if (instanceType === "object" || instanceType === "array") {
      if (!deepCompareStrict(instance, $const)) {
        errors.push({
          instanceLocation,
          keyword: "const",
          keywordLocation: `${schemaLocation}/const`,
          error: `Instance does not match ${JSON.stringify($const)}.`
        });
      }
    } else if (instance !== $const) {
      errors.push({
        instanceLocation,
        keyword: "const",
        keywordLocation: `${schemaLocation}/const`,
        error: `Instance does not match ${JSON.stringify($const)}.`
      });
    }
  }
  if ($enum !== void 0) {
    if (instanceType === "object" || instanceType === "array") {
      if (!$enum.some((value) => deepCompareStrict(instance, value))) {
        errors.push({
          instanceLocation,
          keyword: "enum",
          keywordLocation: `${schemaLocation}/enum`,
          error: `Instance does not match any of ${JSON.stringify($enum)}.`
        });
      }
    } else if (!$enum.some((value) => instance === value)) {
      errors.push({
        instanceLocation,
        keyword: "enum",
        keywordLocation: `${schemaLocation}/enum`,
        error: `Instance does not match any of ${JSON.stringify($enum)}.`
      });
    }
  }
  if ($not !== void 0) {
    const keywordLocation = `${schemaLocation}/not`;
    const result = validate(instance, $not, draft, lookup, shortCircuit, recursiveAnchor, instanceLocation, keywordLocation);
    if (result.valid) {
      errors.push({
        instanceLocation,
        keyword: "not",
        keywordLocation,
        error: 'Instance matched "not" schema.'
      });
    }
  }
  let subEvaluateds = [];
  if ($anyOf !== void 0) {
    const keywordLocation = `${schemaLocation}/anyOf`;
    const errorsLength = errors.length;
    let anyValid = false;
    for (let i = 0; i < $anyOf.length; i++) {
      const subSchema = $anyOf[i];
      const subEvaluated = Object.create(evaluated);
      const result = validate(instance, subSchema, draft, lookup, shortCircuit, $recursiveAnchor === true ? recursiveAnchor : null, instanceLocation, `${keywordLocation}/${i}`, subEvaluated);
      errors.push(...result.errors);
      anyValid = anyValid || result.valid;
      if (result.valid) {
        subEvaluateds.push(subEvaluated);
      }
    }
    if (anyValid) {
      errors.length = errorsLength;
    } else {
      errors.splice(errorsLength, 0, {
        instanceLocation,
        keyword: "anyOf",
        keywordLocation,
        error: "Instance does not match any subschemas."
      });
    }
  }
  if ($allOf !== void 0) {
    const keywordLocation = `${schemaLocation}/allOf`;
    const errorsLength = errors.length;
    let allValid = true;
    for (let i = 0; i < $allOf.length; i++) {
      const subSchema = $allOf[i];
      const subEvaluated = Object.create(evaluated);
      const result = validate(instance, subSchema, draft, lookup, shortCircuit, $recursiveAnchor === true ? recursiveAnchor : null, instanceLocation, `${keywordLocation}/${i}`, subEvaluated);
      errors.push(...result.errors);
      allValid = allValid && result.valid;
      if (result.valid) {
        subEvaluateds.push(subEvaluated);
      }
    }
    if (allValid) {
      errors.length = errorsLength;
    } else {
      errors.splice(errorsLength, 0, {
        instanceLocation,
        keyword: "allOf",
        keywordLocation,
        error: `Instance does not match every subschema.`
      });
    }
  }
  if ($oneOf !== void 0) {
    const keywordLocation = `${schemaLocation}/oneOf`;
    const errorsLength = errors.length;
    const matches = $oneOf.filter((subSchema, i) => {
      const subEvaluated = Object.create(evaluated);
      const result = validate(instance, subSchema, draft, lookup, shortCircuit, $recursiveAnchor === true ? recursiveAnchor : null, instanceLocation, `${keywordLocation}/${i}`, subEvaluated);
      errors.push(...result.errors);
      if (result.valid) {
        subEvaluateds.push(subEvaluated);
      }
      return result.valid;
    }).length;
    if (matches === 1) {
      errors.length = errorsLength;
    } else {
      errors.splice(errorsLength, 0, {
        instanceLocation,
        keyword: "oneOf",
        keywordLocation,
        error: `Instance does not match exactly one subschema (${matches} matches).`
      });
    }
  }
  if (instanceType === "object" || instanceType === "array") {
    Object.assign(evaluated, ...subEvaluateds);
  }
  if ($if !== void 0) {
    const keywordLocation = `${schemaLocation}/if`;
    const conditionResult = validate(instance, $if, draft, lookup, shortCircuit, recursiveAnchor, instanceLocation, keywordLocation, evaluated).valid;
    if (conditionResult) {
      if ($then !== void 0) {
        const thenResult = validate(instance, $then, draft, lookup, shortCircuit, recursiveAnchor, instanceLocation, `${schemaLocation}/then`, evaluated);
        if (!thenResult.valid) {
          errors.push({
            instanceLocation,
            keyword: "if",
            keywordLocation,
            error: `Instance does not match "then" schema.`
          }, ...thenResult.errors);
        }
      }
    } else if ($else !== void 0) {
      const elseResult = validate(instance, $else, draft, lookup, shortCircuit, recursiveAnchor, instanceLocation, `${schemaLocation}/else`, evaluated);
      if (!elseResult.valid) {
        errors.push({
          instanceLocation,
          keyword: "if",
          keywordLocation,
          error: `Instance does not match "else" schema.`
        }, ...elseResult.errors);
      }
    }
  }
  if (instanceType === "object") {
    if ($required !== void 0) {
      for (const key of $required) {
        if (!(key in instance)) {
          errors.push({
            instanceLocation,
            keyword: "required",
            keywordLocation: `${schemaLocation}/required`,
            error: `Instance does not have required property "${key}".`
          });
        }
      }
    }
    const keys = Object.keys(instance);
    if ($minProperties !== void 0 && keys.length < $minProperties) {
      errors.push({
        instanceLocation,
        keyword: "minProperties",
        keywordLocation: `${schemaLocation}/minProperties`,
        error: `Instance does not have at least ${$minProperties} properties.`
      });
    }
    if ($maxProperties !== void 0 && keys.length > $maxProperties) {
      errors.push({
        instanceLocation,
        keyword: "maxProperties",
        keywordLocation: `${schemaLocation}/maxProperties`,
        error: `Instance does not have at least ${$maxProperties} properties.`
      });
    }
    if ($propertyNames !== void 0) {
      const keywordLocation = `${schemaLocation}/propertyNames`;
      for (const key in instance) {
        const subInstancePointer = `${instanceLocation}/${encodePointer(key)}`;
        const result = validate(key, $propertyNames, draft, lookup, shortCircuit, recursiveAnchor, subInstancePointer, keywordLocation);
        if (!result.valid) {
          errors.push({
            instanceLocation,
            keyword: "propertyNames",
            keywordLocation,
            error: `Property name "${key}" does not match schema.`
          }, ...result.errors);
        }
      }
    }
    if ($dependentRequired !== void 0) {
      const keywordLocation = `${schemaLocation}/dependantRequired`;
      for (const key in $dependentRequired) {
        if (key in instance) {
          const required = $dependentRequired[key];
          for (const dependantKey of required) {
            if (!(dependantKey in instance)) {
              errors.push({
                instanceLocation,
                keyword: "dependentRequired",
                keywordLocation,
                error: `Instance has "${key}" but does not have "${dependantKey}".`
              });
            }
          }
        }
      }
    }
    if ($dependentSchemas !== void 0) {
      for (const key in $dependentSchemas) {
        const keywordLocation = `${schemaLocation}/dependentSchemas`;
        if (key in instance) {
          const result = validate(instance, $dependentSchemas[key], draft, lookup, shortCircuit, recursiveAnchor, instanceLocation, `${keywordLocation}/${encodePointer(key)}`, evaluated);
          if (!result.valid) {
            errors.push({
              instanceLocation,
              keyword: "dependentSchemas",
              keywordLocation,
              error: `Instance has "${key}" but does not match dependant schema.`
            }, ...result.errors);
          }
        }
      }
    }
    if ($dependencies !== void 0) {
      const keywordLocation = `${schemaLocation}/dependencies`;
      for (const key in $dependencies) {
        if (key in instance) {
          const propsOrSchema = $dependencies[key];
          if (Array.isArray(propsOrSchema)) {
            for (const dependantKey of propsOrSchema) {
              if (!(dependantKey in instance)) {
                errors.push({
                  instanceLocation,
                  keyword: "dependencies",
                  keywordLocation,
                  error: `Instance has "${key}" but does not have "${dependantKey}".`
                });
              }
            }
          } else {
            const result = validate(instance, propsOrSchema, draft, lookup, shortCircuit, recursiveAnchor, instanceLocation, `${keywordLocation}/${encodePointer(key)}`);
            if (!result.valid) {
              errors.push({
                instanceLocation,
                keyword: "dependencies",
                keywordLocation,
                error: `Instance has "${key}" but does not match dependant schema.`
              }, ...result.errors);
            }
          }
        }
      }
    }
    const thisEvaluated = /* @__PURE__ */ Object.create(null);
    let stop = false;
    if ($properties !== void 0) {
      const keywordLocation = `${schemaLocation}/properties`;
      for (const key in $properties) {
        if (!(key in instance)) {
          continue;
        }
        const subInstancePointer = `${instanceLocation}/${encodePointer(key)}`;
        const result = validate(instance[key], $properties[key], draft, lookup, shortCircuit, recursiveAnchor, subInstancePointer, `${keywordLocation}/${encodePointer(key)}`);
        if (result.valid) {
          evaluated[key] = thisEvaluated[key] = true;
        } else {
          stop = shortCircuit;
          errors.push({
            instanceLocation,
            keyword: "properties",
            keywordLocation,
            error: `Property "${key}" does not match schema.`
          }, ...result.errors);
          if (stop)
            break;
        }
      }
    }
    if (!stop && $patternProperties !== void 0) {
      const keywordLocation = `${schemaLocation}/patternProperties`;
      for (const pattern in $patternProperties) {
        const regex2 = new RegExp(pattern, "u");
        const subSchema = $patternProperties[pattern];
        for (const key in instance) {
          if (!regex2.test(key)) {
            continue;
          }
          const subInstancePointer = `${instanceLocation}/${encodePointer(key)}`;
          const result = validate(instance[key], subSchema, draft, lookup, shortCircuit, recursiveAnchor, subInstancePointer, `${keywordLocation}/${encodePointer(pattern)}`);
          if (result.valid) {
            evaluated[key] = thisEvaluated[key] = true;
          } else {
            stop = shortCircuit;
            errors.push({
              instanceLocation,
              keyword: "patternProperties",
              keywordLocation,
              error: `Property "${key}" matches pattern "${pattern}" but does not match associated schema.`
            }, ...result.errors);
          }
        }
      }
    }
    if (!stop && $additionalProperties !== void 0) {
      const keywordLocation = `${schemaLocation}/additionalProperties`;
      for (const key in instance) {
        if (thisEvaluated[key]) {
          continue;
        }
        const subInstancePointer = `${instanceLocation}/${encodePointer(key)}`;
        const result = validate(instance[key], $additionalProperties, draft, lookup, shortCircuit, recursiveAnchor, subInstancePointer, keywordLocation);
        if (result.valid) {
          evaluated[key] = true;
        } else {
          stop = shortCircuit;
          errors.push({
            instanceLocation,
            keyword: "additionalProperties",
            keywordLocation,
            error: `Property "${key}" does not match additional properties schema.`
          }, ...result.errors);
        }
      }
    } else if (!stop && $unevaluatedProperties !== void 0) {
      const keywordLocation = `${schemaLocation}/unevaluatedProperties`;
      for (const key in instance) {
        if (!evaluated[key]) {
          const subInstancePointer = `${instanceLocation}/${encodePointer(key)}`;
          const result = validate(instance[key], $unevaluatedProperties, draft, lookup, shortCircuit, recursiveAnchor, subInstancePointer, keywordLocation);
          if (result.valid) {
            evaluated[key] = true;
          } else {
            errors.push({
              instanceLocation,
              keyword: "unevaluatedProperties",
              keywordLocation,
              error: `Property "${key}" does not match unevaluated properties schema.`
            }, ...result.errors);
          }
        }
      }
    }
  } else if (instanceType === "array") {
    if ($maxItems !== void 0 && instance.length > $maxItems) {
      errors.push({
        instanceLocation,
        keyword: "maxItems",
        keywordLocation: `${schemaLocation}/maxItems`,
        error: `Array has too many items (${instance.length} > ${$maxItems}).`
      });
    }
    if ($minItems !== void 0 && instance.length < $minItems) {
      errors.push({
        instanceLocation,
        keyword: "minItems",
        keywordLocation: `${schemaLocation}/minItems`,
        error: `Array has too few items (${instance.length} < ${$minItems}).`
      });
    }
    const length = instance.length;
    let i = 0;
    let stop = false;
    if ($prefixItems !== void 0) {
      const keywordLocation = `${schemaLocation}/prefixItems`;
      const length2 = Math.min($prefixItems.length, length);
      for (; i < length2; i++) {
        const result = validate(instance[i], $prefixItems[i], draft, lookup, shortCircuit, recursiveAnchor, `${instanceLocation}/${i}`, `${keywordLocation}/${i}`);
        evaluated[i] = true;
        if (!result.valid) {
          stop = shortCircuit;
          errors.push({
            instanceLocation,
            keyword: "prefixItems",
            keywordLocation,
            error: `Items did not match schema.`
          }, ...result.errors);
          if (stop)
            break;
        }
      }
    }
    if ($items !== void 0) {
      const keywordLocation = `${schemaLocation}/items`;
      if (Array.isArray($items)) {
        const length2 = Math.min($items.length, length);
        for (; i < length2; i++) {
          const result = validate(instance[i], $items[i], draft, lookup, shortCircuit, recursiveAnchor, `${instanceLocation}/${i}`, `${keywordLocation}/${i}`);
          evaluated[i] = true;
          if (!result.valid) {
            stop = shortCircuit;
            errors.push({
              instanceLocation,
              keyword: "items",
              keywordLocation,
              error: `Items did not match schema.`
            }, ...result.errors);
            if (stop)
              break;
          }
        }
      } else {
        for (; i < length; i++) {
          const result = validate(instance[i], $items, draft, lookup, shortCircuit, recursiveAnchor, `${instanceLocation}/${i}`, keywordLocation);
          evaluated[i] = true;
          if (!result.valid) {
            stop = shortCircuit;
            errors.push({
              instanceLocation,
              keyword: "items",
              keywordLocation,
              error: `Items did not match schema.`
            }, ...result.errors);
            if (stop)
              break;
          }
        }
      }
      if (!stop && $additionalItems !== void 0) {
        const keywordLocation2 = `${schemaLocation}/additionalItems`;
        for (; i < length; i++) {
          const result = validate(instance[i], $additionalItems, draft, lookup, shortCircuit, recursiveAnchor, `${instanceLocation}/${i}`, keywordLocation2);
          evaluated[i] = true;
          if (!result.valid) {
            stop = shortCircuit;
            errors.push({
              instanceLocation,
              keyword: "additionalItems",
              keywordLocation: keywordLocation2,
              error: `Items did not match additional items schema.`
            }, ...result.errors);
          }
        }
      }
    }
    if ($contains !== void 0) {
      if (length === 0 && $minContains === void 0) {
        errors.push({
          instanceLocation,
          keyword: "contains",
          keywordLocation: `${schemaLocation}/contains`,
          error: `Array is empty. It must contain at least one item matching the schema.`
        });
      } else if ($minContains !== void 0 && length < $minContains) {
        errors.push({
          instanceLocation,
          keyword: "minContains",
          keywordLocation: `${schemaLocation}/minContains`,
          error: `Array has less items (${length}) than minContains (${$minContains}).`
        });
      } else {
        const keywordLocation = `${schemaLocation}/contains`;
        const errorsLength = errors.length;
        let contained = 0;
        for (let j = 0; j < length; j++) {
          const result = validate(instance[j], $contains, draft, lookup, shortCircuit, recursiveAnchor, `${instanceLocation}/${j}`, keywordLocation);
          if (result.valid) {
            evaluated[j] = true;
            contained++;
          } else {
            errors.push(...result.errors);
          }
        }
        if (contained >= ($minContains || 0)) {
          errors.length = errorsLength;
        }
        if ($minContains === void 0 && $maxContains === void 0 && contained === 0) {
          errors.splice(errorsLength, 0, {
            instanceLocation,
            keyword: "contains",
            keywordLocation,
            error: `Array does not contain item matching schema.`
          });
        } else if ($minContains !== void 0 && contained < $minContains) {
          errors.push({
            instanceLocation,
            keyword: "minContains",
            keywordLocation: `${schemaLocation}/minContains`,
            error: `Array must contain at least ${$minContains} items matching schema. Only ${contained} items were found.`
          });
        } else if ($maxContains !== void 0 && contained > $maxContains) {
          errors.push({
            instanceLocation,
            keyword: "maxContains",
            keywordLocation: `${schemaLocation}/maxContains`,
            error: `Array may contain at most ${$maxContains} items matching schema. ${contained} items were found.`
          });
        }
      }
    }
    if (!stop && $unevaluatedItems !== void 0) {
      const keywordLocation = `${schemaLocation}/unevaluatedItems`;
      for (i; i < length; i++) {
        if (evaluated[i]) {
          continue;
        }
        const result = validate(instance[i], $unevaluatedItems, draft, lookup, shortCircuit, recursiveAnchor, `${instanceLocation}/${i}`, keywordLocation);
        evaluated[i] = true;
        if (!result.valid) {
          errors.push({
            instanceLocation,
            keyword: "unevaluatedItems",
            keywordLocation,
            error: `Items did not match unevaluated items schema.`
          }, ...result.errors);
        }
      }
    }
    if ($uniqueItems) {
      for (let j = 0; j < length; j++) {
        const a = instance[j];
        const ao = typeof a === "object" && a !== null;
        for (let k = 0; k < length; k++) {
          if (j === k) {
            continue;
          }
          const b = instance[k];
          const bo = typeof b === "object" && b !== null;
          if (a === b || ao && bo && deepCompareStrict(a, b)) {
            errors.push({
              instanceLocation,
              keyword: "uniqueItems",
              keywordLocation: `${schemaLocation}/uniqueItems`,
              error: `Duplicate items at indexes ${j} and ${k}.`
            });
            j = Number.MAX_SAFE_INTEGER;
            k = Number.MAX_SAFE_INTEGER;
          }
        }
      }
    }
  } else if (instanceType === "number") {
    if (draft === "4") {
      if ($minimum !== void 0 && ($exclusiveMinimum === true && instance <= $minimum || instance < $minimum)) {
        errors.push({
          instanceLocation,
          keyword: "minimum",
          keywordLocation: `${schemaLocation}/minimum`,
          error: `${instance} is less than ${$exclusiveMinimum ? "or equal to " : ""} ${$minimum}.`
        });
      }
      if ($maximum !== void 0 && ($exclusiveMaximum === true && instance >= $maximum || instance > $maximum)) {
        errors.push({
          instanceLocation,
          keyword: "maximum",
          keywordLocation: `${schemaLocation}/maximum`,
          error: `${instance} is greater than ${$exclusiveMaximum ? "or equal to " : ""} ${$maximum}.`
        });
      }
    } else {
      if ($minimum !== void 0 && instance < $minimum) {
        errors.push({
          instanceLocation,
          keyword: "minimum",
          keywordLocation: `${schemaLocation}/minimum`,
          error: `${instance} is less than ${$minimum}.`
        });
      }
      if ($maximum !== void 0 && instance > $maximum) {
        errors.push({
          instanceLocation,
          keyword: "maximum",
          keywordLocation: `${schemaLocation}/maximum`,
          error: `${instance} is greater than ${$maximum}.`
        });
      }
      if ($exclusiveMinimum !== void 0 && instance <= $exclusiveMinimum) {
        errors.push({
          instanceLocation,
          keyword: "exclusiveMinimum",
          keywordLocation: `${schemaLocation}/exclusiveMinimum`,
          error: `${instance} is less than ${$exclusiveMinimum}.`
        });
      }
      if ($exclusiveMaximum !== void 0 && instance >= $exclusiveMaximum) {
        errors.push({
          instanceLocation,
          keyword: "exclusiveMaximum",
          keywordLocation: `${schemaLocation}/exclusiveMaximum`,
          error: `${instance} is greater than or equal to ${$exclusiveMaximum}.`
        });
      }
    }
    if ($multipleOf !== void 0) {
      const remainder = instance % $multipleOf;
      if (Math.abs(0 - remainder) >= 11920929e-14 && Math.abs($multipleOf - remainder) >= 11920929e-14) {
        errors.push({
          instanceLocation,
          keyword: "multipleOf",
          keywordLocation: `${schemaLocation}/multipleOf`,
          error: `${instance} is not a multiple of ${$multipleOf}.`
        });
      }
    }
  } else if (instanceType === "string") {
    const length = $minLength === void 0 && $maxLength === void 0 ? 0 : ucs2length(instance);
    if ($minLength !== void 0 && length < $minLength) {
      errors.push({
        instanceLocation,
        keyword: "minLength",
        keywordLocation: `${schemaLocation}/minLength`,
        error: `String is too short (${length} < ${$minLength}).`
      });
    }
    if ($maxLength !== void 0 && length > $maxLength) {
      errors.push({
        instanceLocation,
        keyword: "maxLength",
        keywordLocation: `${schemaLocation}/maxLength`,
        error: `String is too long (${length} > ${$maxLength}).`
      });
    }
    if ($pattern !== void 0 && !new RegExp($pattern, "u").test(instance)) {
      errors.push({
        instanceLocation,
        keyword: "pattern",
        keywordLocation: `${schemaLocation}/pattern`,
        error: `String does not match pattern.`
      });
    }
    if ($format !== void 0 && format[$format] && !format[$format](instance)) {
      errors.push({
        instanceLocation,
        keyword: "format",
        keywordLocation: `${schemaLocation}/format`,
        error: `String does not match format "${$format}".`
      });
    }
  }
  return { valid: errors.length === 0, errors };
}

// node_modules/@cfworker/json-schema/dist/esm/validator.js
var Validator = class {
  schema;
  draft;
  shortCircuit;
  lookup;
  constructor(schema, draft = "2019-09", shortCircuit = true) {
    this.schema = schema;
    this.draft = draft;
    this.shortCircuit = shortCircuit;
    this.lookup = dereference(schema);
  }
  validate(instance) {
    return validate(instance, this.schema, this.draft, this.lookup, this.shortCircuit);
  }
  addSchema(schema, id3) {
    if (id3) {
      schema = { ...schema, $id: id3 };
    }
    dereference(schema, this.lookup);
  }
};

// node_modules/@openai/mcp-extensions/dist/server/forms/schema.js
import { z as z3 } from "zod";

// node_modules/@openai/mcp-extensions/dist/server/forms/fields.js
import { BooleanSchemaSchema, IconSchema, NumberSchemaSchema, LegacyTitledEnumSchemaSchema, TitledSingleSelectEnumSchemaSchema, TitledMultiSelectEnumSchemaSchema, UntitledMultiSelectEnumSchemaSchema, StringSchemaSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
var optionSchema = TitledSingleSelectEnumSchemaSchema.shape.oneOf.element.extend({
  "x-openai-thumbnail": IconSchema.optional(),
  /** @deprecated Use x-openai-thumbnail. */
  "x-openai-preview": IconSchema.optional(),
  description: z.string().optional()
});
var arrayFieldShape = TitledMultiSelectEnumSchemaSchema.omit({
  items: true
}).shape;
var stringFieldSchema = StringSchemaSchema.extend({
  pattern: z.string().optional(),
  "x-openai-suggestions": z.array(optionSchema).optional()
});
var noCustomInput = { "x-openai-input": z.never().optional() };
var singleSelectSchema = TitledSingleSelectEnumSchemaSchema.extend({
  ...noCustomInput,
  oneOf: z.array(optionSchema),
  anyOf: z.never().optional()
});
var stringArraySchema = z.object({
  ...arrayFieldShape,
  ...noCustomInput,
  uniqueItems: z.boolean().optional(),
  items: stringFieldSchema.extend({
    enum: z.never().optional(),
    oneOf: z.never().optional(),
    anyOf: z.never().optional()
  })
});
var multiSelectSchema = TitledMultiSelectEnumSchemaSchema.extend({
  ...noCustomInput,
  items: z.object({
    enum: z.never().optional(),
    anyOf: z.array(optionSchema)
  })
});
var untitledMultiSelectSchema = UntitledMultiSelectEnumSchemaSchema.extend({
  ...noCustomInput,
  items: UntitledMultiSelectEnumSchemaSchema.shape.items.extend({
    anyOf: z.never().optional()
  })
});
var primitiveSchemas = [
  LegacyTitledEnumSchemaSchema.extend({
    ...noCustomInput,
    oneOf: z.never().optional(),
    anyOf: z.never().optional()
  }),
  stringFieldSchema.extend({
    ...noCustomInput,
    enum: z.never().optional(),
    oneOf: z.never().optional(),
    anyOf: z.never().optional()
  }),
  NumberSchemaSchema.extend(noCustomInput),
  BooleanSchemaSchema.extend(noCustomInput)
];
var standardFieldSchemas = [
  singleSelectSchema,
  multiSelectSchema,
  untitledMultiSelectSchema,
  ...primitiveSchemas,
  stringArraySchema
];

// node_modules/@openai/mcp-extensions/dist/server/forms/file-picker.js
import { ResourceSchema } from "@modelcontextprotocol/sdk/types.js";
import { z as z2 } from "zod";
var userOptionsSchema = z2.object({
  kind: z2.enum(["file", "directory"]).optional(),
  accept: z2.array(z2.string()).optional()
});
var fileInputSchema = z2.object({
  type: z2.enum(["resource", "file"]),
  options: z2.array(ResourceSchema),
  userOptions: userOptionsSchema.optional(),
  selection: z2.enum(["explicit", "implicit"]).optional()
});
var uriSchema = stringFieldSchema.extend({
  format: z2.literal("uri"),
  enum: z2.never().optional(),
  oneOf: z2.never().optional(),
  anyOf: z2.never().optional()
});
var OpenAIFileFormFieldSchema = z2.discriminatedUnion("type", [
  uriSchema.extend({
    "x-openai-input": fileInputSchema.extend({
      selection: z2.never().optional()
    })
  }),
  z2.object({
    ...arrayFieldShape,
    items: uriSchema,
    "x-openai-input": fileInputSchema
  })
]).superRefine((field, context) => {
  const input = field["x-openai-input"];
  if (field.default != null) {
    if (input.selection === "implicit") {
      context.addIssue({
        code: "custom",
        path: ["default"],
        message: "Implicit selection cannot specify a default"
      });
    }
    const defaults = Array.isArray(field.default) ? field.default : [field.default];
    if (defaults.some((uri2) => !input.options.some((option) => option.uri === uri2))) {
      context.addIssue({
        code: "custom",
        path: ["default"],
        message: "Defaults must name supplied resources"
      });
    }
  }
});
function isValidFileSelection(input, value) {
  const selected = Array.isArray(value) ? value : [value];
  return input.selection === "implicit" || input.userOptions != null || selected.every((uri2) => input.options.some((option) => option.uri === uri2));
}

// node_modules/@openai/mcp-extensions/dist/server/forms/schema.js
var OpenAIFormFieldSchema = z3.union([
  OpenAIFileFormFieldSchema,
  ...standardFieldSchemas
]);
var OpenAIFormSchema = z3.object({
  $schema: z3.string().optional(),
  type: z3.literal("object"),
  required: z3.array(z3.string()).optional(),
  properties: createFormRecordSchema(OpenAIFormFieldSchema)
});
var FormContentSchema = createFormRecordSchema(z3.union([z3.string(), z3.number(), z3.boolean(), z3.array(z3.string())]));
var OpenAIFormResultSchema = z3.discriminatedUnion("action", [
  z3.object({ action: z3.literal("accept"), content: FormContentSchema }),
  z3.object({ action: z3.enum(["cancel", "decline"]) })
]);
function createOpenAIFormContentSchema(form) {
  const validator = new Validator(structuredClone(form), "2020-12", false);
  return FormContentSchema.superRefine((content, context) => {
    const result = validator.validate(Object.setPrototypeOf({ ...content }, null));
    for (const error of result.errors) {
      if (error.keywordLocation === "#/required") {
        continue;
      }
      context.addIssue({
        code: "custom",
        path: error.instanceLocation.split("/").slice(1).map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~")),
        message: error.error
      });
    }
    for (const name of form.required ?? []) {
      if (!Object.hasOwn(content, name)) {
        context.addIssue({
          code: "custom",
          path: [name],
          message: "Required field"
        });
      }
    }
    for (const [name, field] of Object.entries(form.properties)) {
      if (!Object.hasOwn(content, name)) {
        continue;
      }
      if (field["x-openai-input"] != null && !isValidFileSelection(field["x-openai-input"], content[name])) {
        context.addIssue({
          code: "custom",
          path: [name],
          message: "Invalid file selection"
        });
      }
    }
  });
}
function createFormRecordSchema(valueSchema) {
  return z3.custom((value) => z3.record(z3.string(), z3.unknown()).safeParse(value).success).transform((value) => Object.entries(value)).pipe(z3.array(z3.tuple([z3.string(), valueSchema.nonoptional()]))).transform((entries) => Object.fromEntries(entries));
}

// node_modules/@openai/mcp-extensions/dist/server/forms/elicitation.js
var OPENAI_ELICITATION_EXTENSION_ID = "openai/elicitation";
var OPENAI_ELICITATION_METHOD = "openai/elicitation/create";
var OpenAIFormClientCapabilitiesSchema = z4.object({
  extensions: z4.object({
    [OPENAI_ELICITATION_EXTENSION_ID]: z4.object({ form: z4.object({}) })
  })
});
function createElicitInput(server) {
  return async (params, options) => {
    const capabilities = OpenAIFormClientCapabilitiesSchema.safeParse(server.server.getClientCapabilities());
    if (!capabilities.success) {
      throw new Error(`The MCP client does not support ${OPENAI_ELICITATION_EXTENSION_ID} form requests`);
    }
    const requestedSchema = OpenAIFormSchema.parse(params.requestedSchema);
    const result = await server.server.request({
      method: OPENAI_ELICITATION_METHOD,
      params: { ...params, requestedSchema }
    }, OpenAIFormResultSchema, options);
    if (result.action === "accept") {
      return {
        ...result,
        content: createOpenAIFormContentSchema(requestedSchema).parse(result.content)
      };
    }
    return result;
  };
}

// node_modules/@openai/mcp-extensions/dist/server/mentions.js
import { IconSchema as IconSchema2, ResourceLinkSchema } from "@modelcontextprotocol/sdk/types.js";
import { z as z6 } from "zod";

// node_modules/@openai/mcp-extensions/dist/shared/strings.js
import { z as z5 } from "zod";
var NonBlankStringSchema = z5.string().regex(/\S/);

// node_modules/@openai/mcp-extensions/dist/server/mentions.js
var OpenAIMentionResourceSchema = z6.strictObject({
  icons: z6.array(IconSchema2).optional(),
  resourceUri: NonBlankStringSchema,
  subtitle: NonBlankStringSchema.optional(),
  title: NonBlankStringSchema,
  type: z6.literal("resource")
});
var OpenAIMentionItemSchema = z6.discriminatedUnion("type", [
  ResourceLinkSchema,
  OpenAIMentionResourceSchema
]);
var OpenAIMentionSearchParamsSchema = z6.object({
  query: z6.string()
});
var OpenAIMentionSearchResultSchema = z6.strictObject({
  items: z6.array(OpenAIMentionItemSchema)
});
function createMentions(server) {
  let mentionSearchHandler = null;
  let mentionsRegistered = false;
  return {
    setHandler: (handler) => {
      if (!mentionsRegistered) {
        server.registerTool("search_mentions", {
          annotations: { readOnlyHint: true },
          inputSchema: OpenAIMentionSearchParamsSchema,
          outputSchema: OpenAIMentionSearchResultSchema,
          _meta: {
            "openai/extensions": { "mentions/search": {} },
            ui: { visibility: ["app"] }
          }
        }, async (params, extra) => ({
          content: [],
          structuredContent: mentionSearchHandler == null ? { items: [] } : await mentionSearchHandler(params, extra)
        }));
        mentionsRegistered = true;
      }
      mentionSearchHandler = handler;
    }
  };
}

// node_modules/@openai/mcp-extensions/dist/server/settings.js
import { ToolSchema } from "@modelcontextprotocol/sdk/types.js";
import { z as z7 } from "zod";
var OPENAI_SETTINGS_CAPABILITY_KEY = "openai/settings";
var OpenAISettingsCapabilitySchema = z7.object({
  readTool: NonBlankStringSchema,
  /** Name of the settings update tool on the same MCP server. */
  updateTool: NonBlankStringSchema
});
var OpenAISettingsPropertySchema = z7.strictObject({
  kind: z7.literal("property"),
  property: z7.string()
});
var OpenAISettingsToolSchema = z7.strictObject({
  kind: z7.literal("tool"),
  tool: NonBlankStringSchema,
  title: NonBlankStringSchema,
  description: z7.string().optional()
});
var settingsLayoutLeafSchema = z7.discriminatedUnion("kind", [
  OpenAISettingsPropertySchema,
  OpenAISettingsToolSchema
]);
var OpenAISettingsGroupSchema = z7.strictObject({
  kind: z7.literal("group"),
  title: NonBlankStringSchema,
  items: z7.array(settingsLayoutLeafSchema)
});
var OpenAISettingsLayoutItemSchema = OpenAISettingsGroupSchema;
var OpenAISettingsFieldPresentationSchema = z7.object({
  title: NonBlankStringSchema,
  description: z7.string().optional()
});
var nativeSettingsFieldSchema = z7.object({
  type: z7.enum(["boolean", "string", "number", "integer"]),
  enum: z7.array(z7.string()).nonempty().optional(),
  $ref: z7.never().optional(),
  anyOf: z7.never().optional(),
  oneOf: z7.never().optional(),
  allOf: z7.never().optional()
}).refine((field) => field.enum === void 0 || field.type === "string");
var OpenAISettingsReadResultSchema = z7.object({
  schema: z7.looseObject({
    type: z7.literal("object"),
    properties: z7.record(z7.string(), z7.unknown()).optional(),
    required: z7.array(z7.string()).optional()
  }),
  layout: z7.array(OpenAISettingsLayoutItemSchema).optional(),
  values: z7.record(z7.string(), z7.unknown())
}).superRefine(({ schema, layout }, context) => {
  const seen = /* @__PURE__ */ new Set();
  for (const item of layout ?? []) {
    for (const entry of item.items) {
      if (entry.kind !== "property")
        continue;
      if (!Object.hasOwn(schema.properties ?? {}, entry.property) || seen.has(entry.property)) {
        context.addIssue({
          code: "custom",
          path: ["layout"],
          message: `Unknown or duplicate settings key: ${entry.property}`
        });
      }
      seen.add(entry.property);
    }
  }
});
var OpenAISettingsUpdateArgumentsSchema = z7.strictObject({
  set: z7.record(z7.string(), z7.unknown()).refine((set) => Object.keys(set).length > 0, "Set at least one setting.").meta({ minProperties: 1 })
});
var OpenAISettingsUpdateResultSchema = z7.object({
  values: z7.record(z7.string(), z7.unknown())
});
function createSettings(server) {
  const registered = Symbol.for("@openai/mcp-extensions/settings/registered");
  return {
    register(options) {
      if (registered in server)
        throw new Error("Settings are already registered on this server.");
      if (server.server.transport)
        throw new Error("Register settings before connecting the server.");
      const readTool = NonBlankStringSchema.parse(options.readTool ?? "settings.read");
      const updateTool = NonBlankStringSchema.parse(options.updateTool ?? "settings.update");
      if (readTool === updateTool) {
        throw new Error("Settings read and update tools must have different names.");
      }
      const shape = Object.fromEntries(Object.entries(options.fields).map(([name, field]) => {
        return [
          name,
          field.schema.meta({
            ...field.schema.meta(),
            title: field.title,
            description: field.description
          })
        ];
      }));
      const valuesSchema = z7.strictObject(shape).required();
      const schema = ToolSchema.shape.inputSchema.parse(z7.toJSONSchema(valuesSchema));
      for (const [name, property] of Object.entries(schema.properties ?? {})) {
        OpenAISettingsFieldPresentationSchema.parse(property);
        if (!nativeSettingsFieldSchema.safeParse(property).success) {
          throw new Error(`Unsupported native setting ${JSON.stringify(name)}: use a boolean, string, string enum, number, or integer field.`);
        }
        if (typeof property === "object" && property !== null && "default" in property) {
          throw new Error("Settings defaults must be returned by the read handler, not declared in the schema.");
        }
      }
      const { layout } = OpenAISettingsReadResultSchema.parse({
        schema,
        layout: options.layout,
        values: {}
      });
      const setSchema = z7.strictObject(shape).partial().refine((set) => Object.keys(set).length > 0, "Set at least one setting.").meta({ minProperties: 1 });
      const registeredReadTool = server.registerTool(readTool, {
        inputSchema: z7.strictObject({}),
        outputSchema: OpenAISettingsReadResultSchema.safeExtend({
          values: valuesSchema
        }),
        annotations: { readOnlyHint: true }
      }, async (_args, extra) => ({
        content: [],
        structuredContent: {
          schema,
          ...layout === void 0 ? {} : { layout },
          values: valuesSchema.parse(await options.read(extra))
        }
      }));
      try {
        server.registerTool(updateTool, {
          inputSchema: z7.strictObject({ set: setSchema }),
          outputSchema: OpenAISettingsUpdateResultSchema.extend({
            values: valuesSchema
          })
        }, async ({ set }, extra) => ({
          content: [],
          // The MCP SDK validated set against the partial form of this same schema.
          structuredContent: {
            values: valuesSchema.parse(await options.update(set, extra))
          }
        }));
        const capability = { readTool, updateTool };
        server.server.registerCapabilities({
          extensions: { [OPENAI_SETTINGS_CAPABILITY_KEY]: capability },
          experimental: { [OPENAI_SETTINGS_CAPABILITY_KEY]: capability }
        });
        Object.defineProperty(server, registered, { value: true });
      } catch (error) {
        registeredReadTool.remove();
        throw error;
      }
    }
  };
}

// node_modules/@openai/mcp-extensions/dist/server/extensions.js
var OpenAIExtensions = class {
  elicitInput;
  mentions;
  settings;
  constructor(server) {
    this.elicitInput = createElicitInput(server);
    this.mentions = createMentions(server);
    this.settings = createSettings(server);
  }
};

// src/server.mjs
import { z as z20 } from "zod";

// src/ops/studio-extras.mjs
import { z as z10 } from "zod";
import path7 from "node:path";

// src/redact.mjs
var SENSITIVE_KEY = /authorization|cookie|token|secret|password|credential|session_token|sts_ak|sts_sk|jwt|bearer/i;
var BEARER_VALUE = /^Bearer\s+\S+/i;
var JWT_VALUE = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
var REDACTED = "[REDACTED]";
function sanitizeMessage(value) {
  if (typeof value !== "string") return "";
  return value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]").replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, REDACTED).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
}
function redactValue(value, keyHint = "") {
  if (typeof value === "string") {
    if (SENSITIVE_KEY.test(keyHint)) return REDACTED;
    if (BEARER_VALUE.test(value) || JWT_VALUE.test(value)) return REDACTED;
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry));
  if (value !== null && typeof value === "object") {
    const output = {};
    for (const [key, entry] of Object.entries(value)) output[key] = redactValue(entry, key);
    return output;
  }
  return value;
}
var redactDeep = redactValue;

// src/errors.mjs
var TripoError = class extends Error {
  constructor(code, message, options = {}) {
    super(sanitizeMessage(message), { cause: options.cause });
    this.name = "TripoError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.safeToRetryPaidOperation = options.safeToRetryPaidOperation ?? false;
    this.submissionState = options.submissionState ?? "not_submitted";
    this.nextAction = options.nextAction;
    this.stage = options.stage;
    this.details = options.details;
  }
};
function toTripoError(error, stage) {
  if (error instanceof TripoError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new TripoError("HTTP_ERROR", message, {
    cause: error,
    retryable: false,
    safeToRetryPaidOperation: false,
    ...stage === void 0 ? {} : { stage }
  });
}
function isDefinitiveRemoteRejection(error) {
  if (!(error instanceof TripoError)) return false;
  if (["AUTH_EXPIRED", "INSUFFICIENT_CREDITS", "REMOTE_API_ERROR", "CONTENT_AUDIT_REJECTED"].includes(error.code)) {
    return true;
  }
  if (error.code !== "HTTP_ERROR" || typeof error.details?.http_status !== "number") return false;
  const status = error.details.http_status;
  return Number.isInteger(status) && status >= 400 && status < 500 && status !== 408 && status !== 425;
}
function errorSnapshot(error) {
  const normalized = error instanceof TripoError ? error : toTripoError(error);
  return {
    code: normalized.code,
    message: sanitizeMessage(normalized.message).slice(0, 500),
    retryable: normalized.retryable,
    safe_to_retry_paid_operation: normalized.safeToRetryPaidOperation,
    submission_state: normalized.submissionState,
    stage: normalized.stage ?? null,
    ...normalized.nextAction === void 0 ? {} : { next_action: normalized.nextAction }
  };
}

// src/ops/postops.mjs
import { z as z9 } from "zod";

// src/constants.mjs
var SERVER_NAME = "tripo-studio-plugin";
var SERVER_VERSION = "0.3.3";
var STUDIO_ORIGIN = "https://studio.tripo3d.ai";
var STUDIO_API_BASE_URL = "https://api.tripo3d.ai";
var STUDIO_WORKSPACE_URL = `${STUDIO_ORIGIN}/workspace/generate`;
var NEXUS_MODEL_VERSION = "Nexus-v1.0-20260214";
var NEXUS_V2_MODEL_VERSION = "Nexus-v2.0-20260801";
var SMART_MESH_MODEL_VERSIONS = [NEXUS_MODEL_VERSION, NEXUS_V2_MODEL_VERSION];
var NEXUS_MIN_FACES = 500;
var NEXUS_MAX_FACES = 25e3;
var STUDIO_DEFAULT_MODEL_VERSION = "default";
var SEGMENTATION_MODEL_VERSION = "v2.0-20260430";
var COMPLETION_MODEL_VERSION = "v1.0-20250506";
var TEXTURE_MODEL_VERSION = "v3.0-20250812";
var RIGGING_MODEL_VERSION_V1 = "v1.0-20240301";
var RIGGING_MODEL_VERSION_V2_5 = "v2.5-20260210";
var RIGGING_MODEL_VERSION_V3 = "v3.0-20260909";
var SKELETON_PRESETS = ["actorcore", "mixamo", "unreal", "vrm", "unity"];
var HIGH_DETAIL_MODEL_VERSIONS = ["v2.5-20250123", "v3.0-20250812", "v3.1-20260211"];
var TEXT_IMAGE_MODEL_VERSION = "flux.1_dev";
var REMESH_MIN_FACES = 500;
var REMESH_NORMAL_QUAD_MAX_FACES = 5e4;
var REMESH_NORMAL_TRIANGLE_MAX_FACES = 15e4;
var REMESH_SMART_QUAD_MAX_FACES = 1e4;
var REMESH_SMART_TRIANGLE_MAX_FACES = 2e4;
var MAX_IMAGE_BYTES = 20 * 1024 * 1024;
var S3_MULTIPART_SIZE = 10 * 1024 * 1024;
var MAX_MODEL_BYTES = 2 * 1024 * 1024 * 1024;
var MAX_IMPORT_MODEL_BYTES = 150 * 1024 * 1024;
var MAX_IMPORT_MODEL_FACES = 3e6;
var STUDIO_IMAGE_MODELS = [
  "flux.1_dev",
  "flux.1_kontext_pro",
  "gpt_4o",
  "gpt_image_1.5",
  "gpt_image_2",
  "gpt_image_2.5_sunburst",
  "midjourney",
  "gemini_2.5_flash_image_preview",
  "gemini_3.1_flash_image_preview",
  "gemini_3_pro_image_preview"
];
var STUDIO_IMAGE_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"];
var STUDIO_IMAGE_RESOLUTIONS = ["1K", "4K"];
var RIG_TYPES = ["aquatic", "avian", "biped", "hexapod", "octopod", "quadruped", "serpentine", "others"];
var RETARGET_RIG_TYPES = RIG_TYPES.filter((t) => t !== "others");
var WORKBENCH_RESOURCE_URI = "ui://tripo-studio/workbench-v0.3.3.html";
var RESULT_CARD_RESOURCE_URI = "ui://tripo-studio/result-card-v2.html";

// src/ops/animation-presets.mjs
var PRESET_NAMES_BY_RIG = {
  aquatic: ["march"],
  avian: [],
  biped: [
    "afraid",
    "agree",
    "angry_01",
    "angry_02",
    "angry_03",
    "basketball_shot",
    "bow",
    "box_01",
    "box_02",
    "box_03",
    "cast_a_spell",
    "cheer",
    "chop",
    "clap",
    "climb",
    "complain_01",
    "complain_02",
    "crossover_dribble",
    "cry",
    "dance_01",
    "dance_02",
    "dance_03",
    "dance_04",
    "dance_05",
    "dance_06",
    "defeat_02",
    "defeat_03",
    "depressed",
    "dig",
    "dive",
    "dribble",
    "fall",
    "fire",
    "flee_01",
    "flee_02",
    "flip",
    "fold_arms",
    "football_catch",
    "football_save",
    "football_pass",
    "freaky",
    "frightened",
    "front_kick_01",
    "front_kick_02",
    "frustrated_01",
    "frustrated_02",
    "greet_01",
    "greet_02",
    "greet_03",
    "greet_04",
    "heart_pose",
    "hit_to_body_01",
    "hit_to_body_02",
    "hit_to_head",
    "hit_to_side",
    "hit_to_stomach",
    "hug",
    "idle",
    "jump_down",
    "jump",
    "jump_rope_01",
    "jump_rope_02",
    "laugh_01",
    "laugh_02",
    "lift_heavy",
    "look_around",
    "make_a_call_01",
    "make_a_call_02",
    "pitch_baseball",
    "play_mobile_game",
    "play_video_game",
    "run_upstairs",
    "run",
    "scared_01",
    "scared_02",
    "scratch",
    "shoot",
    "shovel",
    "sing_01",
    "sing_02",
    "sing_03",
    "sing_04",
    "sit",
    "slash",
    "sob",
    "standing_relax",
    "surf",
    "swagger",
    "swim",
    "turn",
    "volleyball",
    "wait",
    "walk",
    "warm_up",
    "wave_goodbye_01",
    "wave_goodbye_02"
  ],
  hexapod: ["walk"],
  octopod: ["walk"],
  quadruped: ["walk"],
  serpentine: ["march"]
};
var ANIMATION_PRESETS = RETARGET_RIG_TYPES.flatMap(
  (rigType) => PRESET_NAMES_BY_RIG[rigType].map((name) => ({ preset: `preset:${rigType}:${name}`, rig_type: rigType }))
);
var PRESET_SET = new Set(ANIMATION_PRESETS.map((entry) => entry.preset));
function isRigType(value) {
  return typeof value === "string" && RIG_TYPES.includes(value);
}
function isRetargetRigType(value) {
  return typeof value === "string" && RETARGET_RIG_TYPES.includes(value);
}
function isAnimationPreset(value) {
  return typeof value === "string" && PRESET_SET.has(value);
}
function animationPresetRigType(preset) {
  const match = /^preset:(aquatic|avian|biped|hexapod|octopod|quadruped|serpentine):[a-z0-9_]+$/.exec(preset);
  return match?.[1];
}
function listAnimationPresets(input = {}) {
  const query = input.query?.trim().toLowerCase();
  return ANIMATION_PRESETS.filter(
    ({ preset, rig_type }) => (input.rigType === void 0 || input.rigType === rig_type) && (query === void 0 || query === "" || preset.toLowerCase().includes(query))
  ).map((entry) => ({ ...entry }));
}

// src/ops/capabilities.mjs
function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function optionalBoolean(...values) {
  for (const value of values) if (typeof value === "boolean") return value;
  return null;
}
function optionalRigType(...values) {
  for (const value of values) if (isRigType(value)) return value;
  return null;
}
function projectCapabilities(projectId2, detail) {
  const root = detail;
  const operator = asRecord(root.operator);
  const metadata = asRecord(operator?.metadata);
  const riggingOperator = asRecord(operator?.rigging);
  return {
    is_hd_textured: optionalBoolean(operator?.is_hd_textured, root.is_hd_textured, metadata?.is_hd_textured),
    is_multiple_mesh: optionalBoolean(operator?.is_multiple_mesh, root.is_multiple_mesh, metadata?.is_multiple_mesh),
    is_nexus_mesh: optionalBoolean(operator?.is_nexus_mesh, root.is_nexus_mesh, metadata?.is_nexus_mesh),
    is_owner: optionalBoolean(root.is_owner, operator?.is_owner),
    is_pbr: optionalBoolean(operator?.is_pbr, root.is_pbr, metadata?.is_pbr),
    is_quad: optionalBoolean(operator?.is_quad, root.is_quad, metadata?.is_quad),
    is_rigged: optionalBoolean(operator?.is_rigged, root.is_rigged, metadata?.is_rigged),
    is_segmented: optionalBoolean(operator?.is_segmented, root.is_segmented, metadata?.is_segmented),
    is_textured: optionalBoolean(operator?.is_textured, root.is_textured, metadata?.is_textured),
    is_ultra_textured: optionalBoolean(operator?.is_ultra_textured, root.is_ultra_textured, metadata?.is_ultra_textured),
    project_id: detail.id ?? projectId2,
    remote_status: detail.status ?? null,
    rig_type: optionalRigType(riggingOperator?.type, operator?.rig_type, root.rig_type, metadata?.rig_type)
  };
}
function assertProjectSupports(kind, capabilities, options = {}) {
  const remoteStatus2 = capabilities.remote_status?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? null;
  if (remoteStatus2 !== null && ["prepare", "preparing", "queued", "pending", "running", "processing", "generating", "in_progress", "uploading"].includes(remoteStatus2)) {
    throw new TripoError("REMOTE_API_ERROR", "The Studio project already has remote work in progress. Wait for it to finish before staging another write.", {
      details: { remote_status: remoteStatus2 },
      safeToRetryPaidOperation: true,
      stage: "operation_stage"
    });
  }
  if (capabilities.is_owner === false) {
    throw new TripoError("REMOTE_API_ERROR", "The Studio project is not owned by the current account and cannot be modified.", {
      safeToRetryPaidOperation: true,
      stage: "operation_stage"
    });
  }
  if (kind === "segmentation" && capabilities.is_quad === true) {
    throw new TripoError("REMOTE_API_ERROR", "Studio does not support segmentation for Quad projects.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  if ((kind === "segmentation" || kind === "remesh") && capabilities.is_rigged === true) {
    throw new TripoError("REMOTE_API_ERROR", `Studio does not support ${kind} for rigged projects.`, { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  if ((kind === "mesh_fill" || kind === "ai_completion") && capabilities.is_multiple_mesh === false) {
    throw new TripoError("REMOTE_API_ERROR", "Part completion requires a segmented/multi-mesh project.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  if (kind === "remesh" && options.smartPoly === true && capabilities.is_nexus_mesh === true) {
    throw new TripoError("REMOTE_API_ERROR", "Smart Poly remesh is not supported for Nexus/Smart Mesh projects.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  if (kind === "retexture_preview" || kind === "apply_retexture") {
    if (capabilities.is_textured === false) {
      throw new TripoError("REMOTE_API_ERROR", "Texture editing requires an already textured project.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
    }
    if (capabilities.is_ultra_textured === true) {
      throw new TripoError("REMOTE_API_ERROR", "Studio Magic Brush does not support an 8K/ultra-textured revision.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
    }
    if (capabilities.is_segmented === true) {
      throw new TripoError("REMOTE_API_ERROR", "Studio Magic Brush does not support a segmented revision.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
    }
  }
  if ((kind === "texture_upscale" || kind === "pbr") && capabilities.is_textured === false) {
    throw new TripoError("REMOTE_API_ERROR", `${kind} requires an already textured project.`, { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  if ((kind === "rigging" || kind === "animation_retarget") && capabilities.is_textured === false) {
    throw new TripoError("REMOTE_API_ERROR", `${kind} requires an already textured project.`, { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  if (kind === "animation_retarget" && capabilities.is_rigged === false) {
    throw new TripoError("REMOTE_API_ERROR", "Animation retargeting requires an already rigged project.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  if (kind === "animation_retarget" && options.rigType !== void 0 && isRetargetRigType(capabilities.rig_type) && capabilities.rig_type !== options.rigType) {
    throw new TripoError("REMOTE_API_ERROR", "The requested rig type does not match the project's current rig.", {
      details: { project_rig_type: capabilities.rig_type, requested_rig_type: options.rigType },
      safeToRetryPaidOperation: true,
      stage: "operation_stage"
    });
  }
}

// src/ops/images.mjs
import { createHash as createHash2 } from "node:crypto";
import { readFile as readFile2, stat as stat2 } from "node:fs/promises";
import { COPYFILE_EXCL } from "node:constants";
import { chmod, copyFile, mkdir, open, rm } from "node:fs/promises";
import path3 from "node:path";

// src/security/path-policy.mjs
import path from "node:path";
import { realpath } from "node:fs/promises";
function assertLocalPathSpecifier(value, stage = "path_policy") {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TripoError("INVALID_INPUT", "A local file path is required.", { stage });
  }
  const trimmed = value.trim();
  if (/^(https?|file|ftp|s3|gs|data):\/\//i.test(trimmed) || /^data:/i.test(trimmed)) {
    throw new TripoError("INVALID_INPUT", "Only plain local filesystem paths are accepted; URL and data specifiers are rejected.", { stage });
  }
  if (trimmed.includes("\0")) {
    throw new TripoError("INVALID_INPUT", "The path contains a NUL byte.", { stage });
  }
  return trimmed;
}
function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || !relative.startsWith("..") && !path.isAbsolute(relative);
}
async function resolveOutputPath(config, requestedPath, defaultName) {
  const target = requestedPath ? path.resolve(assertLocalPathSpecifier(requestedPath, "download_path")) : path.join(config.assetRoot, "downloads", defaultName);
  const roots = config.outputRoots.map((root) => path.resolve(root));
  const existing = await nearestExistingAncestor(target);
  if (!existing) {
    throw new TripoError("DOWNLOAD_REJECTED", "No existing ancestor directory was found for the download path.", { stage: "download_path" });
  }
  const canonicalAncestor = await realpath(existing.path);
  const canonicalTarget = path.join(canonicalAncestor, path.relative(existing.path, target));
  if (!roots.some((root) => isInside(root, canonicalTarget))) {
    throw new TripoError(
      "DOWNLOAD_REJECTED",
      `Download paths must stay under configured output roots (${roots.join(", ")}).`,
      { details: { requested: target }, stage: "download_path" }
    );
  }
  return canonicalTarget;
}
async function nearestExistingAncestor(target) {
  let current = target;
  for (let depth = 0; depth < 64; depth += 1) {
    try {
      const canonical = await realpath(current);
      return { path: canonical };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }
  return null;
}
var DOWNLOAD_HOST_SUFFIXES = ["tripo3d.ai", "tripo3d.com", "amazonaws.com", "cloudfront.net"];
function assertDownloadUrl(urlValue) {
  let url;
  try {
    url = new URL(urlValue);
  } catch (error) {
    throw new TripoError("DOWNLOAD_REJECTED", "The remote artifact URL is invalid.", { cause: error, stage: "download" });
  }
  if (url.protocol !== "https:") {
    throw new TripoError("DOWNLOAD_REJECTED", "Remote artifacts must be served over HTTPS.", { stage: "download" });
  }
  const host = url.hostname.toLowerCase();
  if (!DOWNLOAD_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    throw new TripoError("DOWNLOAD_REJECTED", `Remote artifact host ${host} is not in the allowlist.`, {
      details: { host },
      stage: "download"
    });
  }
  return url;
}

// src/util/image.mjs
import { createHash } from "node:crypto";
import { readFile, realpath as realpath2, stat } from "node:fs/promises";
import path2 from "node:path";
var MAX_DIMENSION = 16384;
var MAX_PIXELS = 1e8;
function detectImageFormat(bytes) {
  if (bytes.length >= 8 && bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index])) return "png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpeg";
  const ascii2 = (start, length) => String.fromCharCode(...bytes.slice(start, start + length));
  if (bytes.length >= 12 && ascii2(0, 4) === "RIFF" && ascii2(8, 4) === "WEBP") return "webp";
  return void 0;
}
var ascii = (bytes, start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
function pngDimensions(bytes) {
  let offset = 8;
  let dimensions;
  let sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = ascii(bytes, offset + 4, 4);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error("PNG chunk exceeds file bounds");
    if (type === "IHDR") {
      if (offset !== 8 || length !== 13) throw new Error("PNG IHDR is invalid");
      dimensions = { height: bytes.readUInt32BE(offset + 12), width: bytes.readUInt32BE(offset + 8) };
    }
    if (type === "acTL") throw new Error("animated PNG is not accepted");
    if (type === "IEND") {
      if (length !== 0 || end !== bytes.length) throw new Error("PNG IEND/trailing bytes are invalid");
      sawEnd = true;
      break;
    }
    offset = end;
  }
  if (!dimensions || !sawEnd) throw new Error("PNG structure is incomplete");
  return dimensions;
}
function jpegDimensions(bytes) {
  const startOfFrame = /* @__PURE__ */ new Set([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207]);
  let offset = 2;
  while (offset < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 255) offset += 1;
    while (offset < bytes.length && bytes[offset] === 255) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset++];
    if (marker === 217 || marker === 218) break;
    if (marker === 1 || marker >= 208 && marker <= 216) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) throw new Error("JPEG segment exceeds file bounds");
    if (startOfFrame.has(marker)) {
      if (length < 8) throw new Error("JPEG frame header is too short");
      return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  throw new Error("JPEG has no supported frame header");
}
function webpDimensions(bytes) {
  const read24 = (o) => bytes[o] | bytes[o + 1] << 8 | bytes[o + 2] << 16;
  if (bytes.length < 30 || bytes.readUInt32LE(4) + 8 !== bytes.length) throw new Error("WebP RIFF length is invalid");
  let offset = 12;
  let dimensions;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const length = bytes.readUInt32LE(offset + 4);
    const data = offset + 8;
    const end = data + length;
    if (end > bytes.length) throw new Error("WebP chunk exceeds file bounds");
    if (type === "VP8X") {
      if (length < 10) throw new Error("WebP VP8X chunk is too short");
      if ((bytes[data] & 2) !== 0) throw new Error("animated WebP is not accepted");
      dimensions = { height: read24(bytes, data + 7) + 1, width: read24(bytes, data + 4) + 1 };
    } else if (type === "VP8L" && !dimensions) {
      if (length < 5 || bytes[data] !== 47) throw new Error("WebP VP8L header is invalid");
      const bits2 = bytes.readUInt32LE(data + 1);
      dimensions = { height: (bits2 >>> 14 & 16383) + 1, width: (bits2 & 16383) + 1 };
    } else if (type === "VP8 " && !dimensions) {
      if (length < 10 || bytes[data + 3] !== 157 || bytes[data + 4] !== 1 || bytes[data + 5] !== 42) {
        throw new Error("WebP VP8 frame header is invalid");
      }
      dimensions = { height: bytes.readUInt16LE(data + 8) & 16383, width: bytes.readUInt16LE(data + 6) & 16383 };
    } else if (type === "ANIM" || type === "ANMF") {
      throw new Error("animated WebP is not accepted");
    }
    offset = end + length % 2;
  }
  if (!dimensions || offset !== bytes.length) throw new Error("WebP structure is incomplete");
  return dimensions;
}
function inspectImageBytes(bytes) {
  const detected = detectImageFormat(bytes);
  if (!detected) {
    throw new TripoError("FILE_INVALID", "Only real PNG, JPEG, and WebP image data is accepted.", { stage: "image_inspect" });
  }
  let dimensions;
  try {
    dimensions = detected === "png" ? pngDimensions(bytes) : detected === "webp" ? webpDimensions(bytes) : jpegDimensions(bytes);
  } catch (error) {
    throw new TripoError("FILE_INVALID", "The image container is corrupt, incomplete, or animated.", { cause: error, stage: "image_inspect" });
  }
  if (dimensions.width < 1 || dimensions.height < 1 || dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION || dimensions.width * dimensions.height > MAX_PIXELS) {
    throw new TripoError("FILE_INVALID", "Image dimensions must be positive, at most 16,384 per side, and at most 100 megapixels.", {
      details: dimensions,
      stage: "image_inspect"
    });
  }
  return { format: detected, ...dimensions };
}
async function inspectImage(inputPath) {
  const resolved = path2.resolve(inputPath);
  let canonicalPath;
  try {
    canonicalPath = await realpath2(resolved);
  } catch (error) {
    throw new TripoError("FILE_INVALID", `Image does not exist: ${resolved}`, { cause: error, stage: "prepare" });
  }
  const metadata = await stat(canonicalPath);
  if (!metadata.isFile()) {
    throw new TripoError("FILE_INVALID", "Image path must point to a regular file.", { stage: "prepare" });
  }
  if (metadata.size <= 0 || metadata.size > MAX_IMAGE_BYTES) {
    throw new TripoError("FILE_INVALID", "Image must be between 1 byte and 20 MiB.", { details: { size_bytes: metadata.size }, stage: "prepare" });
  }
  let bytes;
  try {
    bytes = await readFile(canonicalPath);
  } catch (error) {
    throw new TripoError("FILE_INVALID", "The image could not be read.", { cause: error, stage: "prepare" });
  }
  if (bytes.length !== metadata.size) {
    throw new TripoError("FILE_CHANGED", "The image changed while it was being inspected.", { stage: "prepare" });
  }
  const inspected = inspectImageBytes(bytes);
  const extension = path2.extname(canonicalPath).slice(1).toLowerCase();
  if (!["png", "jpg", "jpeg", "webp"].includes(extension)) {
    throw new TripoError("FILE_INVALID", "Image filename must end in .png, .jpg, .jpeg, or .webp.", { stage: "prepare" });
  }
  return {
    format: inspected.format === "jpeg" && extension === "jpg" ? "jpg" : inspected.format,
    height: inspected.height,
    mtimeMs: metadata.mtimeMs,
    path: canonicalPath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: metadata.size,
    width: inspected.width
  };
}

// src/ops/images.mjs
var PLAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function snapshotDirectory(config, taskId) {
  if (!PLAN_ID.test(taskId)) {
    throw new TripoError("CONFIGURATION_ERROR", "The task identifier for input snapshots is invalid.", { stage: "operation_stage" });
  }
  return path3.join(config.dataDir, "task-inputs", taskId);
}
async function syncSnapshot(filePath, directory) {
  const handle = await open(filePath, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  if (process.platform !== "win32") {
    const directoryHandle = await open(directory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  }
}
async function removeSnapshots(config, taskId) {
  await rm(snapshotDirectory(config, taskId), { force: true, recursive: true });
}
async function verifySnapshot(config, taskId, provenance) {
  const directory = snapshotDirectory(config, taskId);
  const snapshotPath = path3.join(directory, path3.basename(provenance.relative_path));
  const relativeToDirectory = path3.relative(directory, snapshotPath);
  if (relativeToDirectory === "" || relativeToDirectory.startsWith("..") || path3.isAbsolute(relativeToDirectory)) {
    throw new TripoError("FILE_INVALID", "A task input snapshot escaped its private directory.", {
      safeToRetryPaidOperation: false,
      stage: "operation_provenance"
    });
  }
  let snapshot;
  try {
    if (["glb", "obj", "fbx", "stl"].includes(provenance.format)) {
      const bytes = await readFile2(snapshotPath);
      snapshot = { path: snapshotPath, sha256: createHash2("sha256").update(bytes).digest("hex"), size: bytes.length, format: path3.extname(snapshotPath).slice(1) };
    } else snapshot = await inspectImage(snapshotPath);
  } catch (error) {
    throw new TripoError("FILE_CHANGED", "A retained task input snapshot is unavailable or invalid.", {
      cause: error,
      safeToRetryPaidOperation: false,
      stage: "operation_provenance"
    });
  }
  if (snapshot.sha256 !== provenance.sha256 || snapshot.size !== provenance.size_bytes || snapshot.format !== provenance.format || snapshot.width !== provenance.width || snapshot.height !== provenance.height) {
    throw new TripoError("FILE_CHANGED", "A retained task input snapshot no longer matches its durable provenance.", {
      safeToRetryPaidOperation: false,
      stage: "operation_provenance"
    });
  }
  return snapshot.path;
}
async function stageLocalImage(config, gateway, uploader, inputPath, audit, retain) {
  assertLocalPathSpecifier(inputPath, "operation_input_policy");
  const source = await inspectImage(inputPath);
  const canonicalSourceFormat = source.format === "jpg" ? "jpeg" : source.format;
  if (retain.requiredFormat !== void 0 && canonicalSourceFormat !== retain.requiredFormat) {
    throw new TripoError("FILE_INVALID", `This input must be a ${retain.requiredFormat} image.`, {
      details: { actual_format: canonicalSourceFormat, required_format: retain.requiredFormat },
      safeToRetryPaidOperation: true,
      stage: "operation_stage"
    });
  }
  if (!Number.isSafeInteger(retain.index) || retain.index < 1 || retain.index > 200) {
    throw new TripoError("CONFIGURATION_ERROR", "The task input snapshot index is invalid.", { stage: "operation_stage" });
  }
  const directory = snapshotDirectory(config, retain.taskId);
  await mkdir(directory, { recursive: true, mode: 448 });
  const snapshotName = `input-${retain.index}.${canonicalSourceFormat}`;
  const snapshotPath = path3.join(directory, snapshotName);
  let completed = false;
  try {
    await copyFile(source.path, snapshotPath, COPYFILE_EXCL);
    if (process.platform !== "win32") await chmod(snapshotPath, 256);
    await syncSnapshot(snapshotPath, directory);
    const snapshot = await inspectImage(snapshotPath);
    if (snapshot.sha256 !== source.sha256 || snapshot.size !== source.size || snapshot.format !== canonicalSourceFormat || snapshot.width !== source.width || snapshot.height !== source.height) {
      throw new TripoError("FILE_CHANGED", "The source image changed while it was being snapshotted.", {
        safeToRetryPaidOperation: true,
        stage: "operation_stage"
      });
    }
    const token = retain.upload === false ? null : await gateway.requestTemporaryToken(snapshot.format);
    const uploaded = token ? await uploader.upload(snapshot.path, token) : void 0;
    const unchanged = await inspectImage(snapshot.path);
    if (unchanged.sha256 !== snapshot.sha256 || unchanged.size !== snapshot.size) {
      throw new TripoError("FILE_CHANGED", "The immutable image snapshot changed during upload.", {
        safeToRetryPaidOperation: true,
        stage: "operation_stage"
      });
    }
    const auditResult = audit ? await gateway.auditImage(uploaded) : void 0;
    if (auditResult && !["pass", "sensitive"].includes(auditResult.result)) {
      throw new TripoError("CONTENT_AUDIT_REJECTED", `Tripo image audit returned ${auditResult.result}; the operation was not submitted.`, {
        safeToRetryPaidOperation: true,
        stage: "audit"
      });
    }
    completed = true;
    return {
      ...auditResult === void 0 ? {} : { audit: auditResult },
      metadata: {
        format: snapshot.format,
        height: snapshot.height,
        sha256: snapshot.sha256,
        size_bytes: snapshot.size,
        source_name: path3.basename(source.path),
        width: snapshot.width
      },
      provenance: {
        format: snapshot.format,
        height: snapshot.height,
        label: retain.label,
        relative_path: `task-inputs/${retain.taskId}/${snapshotName}`,
        sha256: snapshot.sha256,
        size_bytes: snapshot.size,
        slot: retain.slot,
        source_name: path3.basename(source.path),
        width: snapshot.width
      },
      uploaded
    };
  } finally {
    if (!completed) await rm(snapshotPath, { force: true }).catch(() => {
    });
  }
}
async function stageLocalModelFile(config, inputPath, retain) {
  assertLocalPathSpecifier(inputPath, "import_input_policy");
  const { realpath: realpath5, stat: stat11, readFile: readFile13 } = await import("node:fs/promises");
  const { createHash: createHash11 } = await import("node:crypto");
  const resolved = path3.resolve(inputPath);
  const canonical = await realpath5(resolved).catch((error) => {
    throw new TripoError("FILE_INVALID", `Model file does not exist: ${resolved}`, { cause: error, stage: "prepare" });
  });
  const metadata = await stat11(canonical);
  if (!metadata.isFile()) throw new TripoError("FILE_INVALID", "Model path must point to a regular file.", { stage: "prepare" });
  const directory = snapshotDirectory(config, retain.taskId);
  await mkdir(directory, { recursive: true, mode: 448 });
  const extension = path3.extname(canonical).toLowerCase();
  const snapshotName = `input-${retain.index}${extension}`;
  const snapshotPath = path3.join(directory, snapshotName);
  await copyFile(canonical, snapshotPath, COPYFILE_EXCL);
  if (process.platform !== "win32") await chmod(snapshotPath, 256);
  const bytes = await readFile13(snapshotPath);
  const sha256 = createHash11("sha256").update(bytes).digest("hex");
  return {
    metadata: {
      format: extension.slice(1),
      sha256,
      size_bytes: metadata.size,
      source_name: path3.basename(canonical)
    },
    path: snapshotPath,
    provenance: {
      format: extension.slice(1),
      label: retain.label,
      relative_path: `task-inputs/${retain.taskId}/${snapshotName}`,
      sha256,
      size_bytes: metadata.size,
      slot: retain.slot,
      source_name: path3.basename(canonical)
    }
  };
}
function auditedImageWire(image) {
  if (!image.audit) throw new TripoError("STAGING_REQUIRED", "An audited image is required for this operation.", { stage: "operation_stage" });
  return {
    bucket: image.uploaded.bucket,
    image_audit_result: image.audit.result,
    image_source: "upload",
    key: image.uploaded.key
  };
}
function directImageWire(image) {
  return { bucket: image.uploaded.bucket, key: image.uploaded.key };
}

// src/ops/modelgen.mjs
import { z as z8 } from "zod";

// src/util/model-inspect.mjs
import { createHash as createHash3 } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile as readFile3, realpath as realpath3, stat as stat3 } from "node:fs/promises";
import path4 from "node:path";
var GLB_MAGIC = 1179937895;
var GLB_JSON_CHUNK = 1313821514;
var FBX_BINARY_MAGIC = Buffer.from("Kaydara FBX Binary  \0\0", "binary");
var MAX_TEXT_LINE_BYTES = 1024 * 1024;
var MAX_FBX_INDEX_BYTES = 64 * 1024 * 1024;
function invalid(message, details) {
  return new TripoError("FILE_INVALID", message, { ...details === void 0 ? {} : { details }, stage: "model_inspect" });
}
function assertFaceLimit(faceCount) {
  if (!Number.isSafeInteger(faceCount) || faceCount < 1) throw invalid("The model contains no supported polygon faces.");
  if (faceCount > MAX_IMPORT_MODEL_FACES) {
    throw invalid("The model exceeds Studio's current 3,000,000-face import limit.", { face_count: faceCount, max_faces: MAX_IMPORT_MODEL_FACES });
  }
}
function plainObject(value) {
  if (value === null || Array.isArray(value) || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function inspectGlb(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== GLB_MAGIC) throw invalid("The .glb file has no valid GLB magic header.");
  if (bytes.readUInt32LE(4) !== 2) throw invalid("Only GLB version 2 is supported by the current Studio importer.");
  if (bytes.readUInt32LE(8) !== bytes.length) throw invalid("The GLB declared length does not match the file size.");
  let offset = 12;
  let document;
  let chunkIndex = 0;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw invalid("The GLB chunk table is truncated.");
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (length % 4 !== 0 || end > bytes.length) throw invalid("A GLB chunk is misaligned or exceeds the file bounds.");
    if (chunkIndex === 0 && type !== GLB_JSON_CHUNK) throw invalid("The first GLB chunk must be JSON.");
    if (type === GLB_JSON_CHUNK) {
      if (document !== void 0) throw invalid("The GLB contains multiple JSON chunks.");
      try {
        document = JSON.parse(bytes.subarray(start, end).toString("utf8").replace(/[\u0000\u0020]+$/g, ""));
      } catch (error) {
        throw new TripoError("FILE_INVALID", "The GLB JSON chunk is invalid.", { cause: error, stage: "model_inspect" });
      }
    }
    offset = end;
    chunkIndex += 1;
  }
  if (offset !== bytes.length || !plainObject(document)) throw invalid("The GLB has no valid JSON document.");
  const accessors = Array.isArray(document.accessors) ? document.accessors : [];
  const meshes = Array.isArray(document.meshes) ? document.meshes : [];
  let faceCount = 0;
  let isUvMapped = false;
  for (const mesh of meshes) {
    if (!plainObject(mesh) || !Array.isArray(mesh.primitives)) continue;
    for (const primitive of mesh.primitives) {
      if (!plainObject(primitive)) continue;
      const attributes = plainObject(primitive.attributes) ? primitive.attributes : {};
      if (Number.isSafeInteger(attributes.TEXCOORD_0)) isUvMapped = true;
      const accessorIndex = Number.isSafeInteger(primitive.indices) ? Number(primitive.indices) : Number(attributes.POSITION);
      const accessor = accessors[accessorIndex];
      if (!plainObject(accessor) || !Number.isSafeInteger(accessor.count) || Number(accessor.count) < 0) continue;
      const count = Number(accessor.count);
      const mode = primitive.mode === void 0 ? 4 : Number(primitive.mode);
      if (mode === 4) faceCount += Math.floor(count / 3);
      else if (mode === 5 || mode === 6) faceCount += Math.max(0, count - 2);
      if (faceCount > MAX_IMPORT_MODEL_FACES) assertFaceLimit(faceCount);
    }
  }
  assertFaceLimit(faceCount);
  return { faceCount, isUvMapped };
}
function eachTextLine(bytes, visit) {
  let start = 0;
  for (let index = 0; index <= bytes.length; index += 1) {
    if (index !== bytes.length && bytes[index] !== 10) continue;
    let end = index;
    if (end > start && bytes[end - 1] === 13) end -= 1;
    if (end - start > MAX_TEXT_LINE_BYTES) throw invalid("The text model contains an unexpectedly long line.");
    const lineBytes = bytes.subarray(start, end);
    if (lineBytes.includes(0)) throw invalid("The text model contains NUL bytes.");
    visit(lineBytes.toString("utf8"));
    start = index + 1;
  }
}
function inspectObj(bytes) {
  let vertices = 0;
  let textureVertices = 0;
  let faceCount = 0;
  let faceHasUv = false;
  eachTextLine(bytes, (raw) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    if (/^v\s+/i.test(line)) vertices += 1;
    else if (/^vt\s+/i.test(line)) textureVertices += 1;
    else if (/^f\s+/i.test(line)) {
      const references2 = line.slice(1).trim().split(/\s+/);
      if (references2.length < 3 || references2.some((entry) => !/^[+-]?\d+(?:\/[+-]?\d*)?(?:\/[+-]?\d+)?$/.test(entry))) {
        throw invalid("The OBJ contains an invalid face record.");
      }
      faceCount += references2.length - 2;
      faceHasUv ||= references2.some((entry) => /^[-+]?\d+\/[-+]?\d+/.test(entry));
      if (faceCount > MAX_IMPORT_MODEL_FACES) assertFaceLimit(faceCount);
    }
  });
  if (vertices < 3) throw invalid("The OBJ contains fewer than three vertices.");
  assertFaceLimit(faceCount);
  return { faceCount, isUvMapped: textureVertices > 0 && faceHasUv };
}
function inspectStl(bytes) {
  if (bytes.length >= 84) {
    const triangles = bytes.readUInt32LE(80);
    const expected = 84 + triangles * 50;
    if (Number.isSafeInteger(expected) && expected === bytes.length) {
      assertFaceLimit(triangles);
      return { faceCount: triangles, isUvMapped: false };
    }
  }
  let facets = 0;
  let vertices = 0;
  let sawSolid = false;
  let sawEnd = false;
  eachTextLine(bytes, (raw) => {
    const line = raw.trim().toLowerCase();
    if (!line) return;
    if (line.startsWith("solid")) sawSolid = true;
    else if (line.startsWith("facet normal")) facets += 1;
    else if (line.startsWith("vertex ")) vertices += 1;
    else if (line.startsWith("endsolid")) sawEnd = true;
    if (facets > MAX_IMPORT_MODEL_FACES) assertFaceLimit(facets);
  });
  if (!sawSolid || !sawEnd || vertices !== facets * 3) throw invalid("The STL is neither a valid bounded binary STL nor a complete ASCII STL.");
  assertFaceLimit(facets);
  return { faceCount: facets, isUvMapped: false };
}
function formatFromPath(filePath) {
  const extension = path4.extname(filePath).slice(1).toLowerCase();
  if (!["fbx", "glb", "obj", "stl"].includes(extension)) throw invalid("Model filename must end in .glb, .obj, .fbx, or .stl.");
  return extension;
}
async function sha256File(filePath) {
  const hash3 = createHash3("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash3.update(chunk);
  return hash3.digest("hex");
}
async function inspectModel(inputPath) {
  const resolved = path4.resolve(inputPath);
  let canonicalPath;
  try {
    canonicalPath = await realpath3(resolved);
  } catch (error) {
    throw new TripoError("FILE_INVALID", `Model does not exist: ${resolved}`, { cause: error, stage: "model_inspect" });
  }
  const metadata = await stat3(canonicalPath);
  if (!metadata.isFile()) throw invalid("Model path must point to a regular file.");
  if (metadata.size < 1 || metadata.size > MAX_IMPORT_MODEL_BYTES) {
    throw invalid("Model must be between 1 byte and 150 MiB.", { size_bytes: metadata.size });
  }
  const format2 = formatFromPath(canonicalPath);
  let bytes;
  try {
    bytes = await readFile3(canonicalPath);
  } catch (error) {
    throw new TripoError("FILE_INVALID", "The model could not be read.", { cause: error, stage: "model_inspect" });
  }
  if (bytes.length !== metadata.size) throw new TripoError("FILE_CHANGED", "The model changed while it was being read.", { stage: "model_inspect" });
  const geometry = format2 === "glb" ? inspectGlb(bytes) : format2 === "obj" ? inspectObj(bytes) : format2 === "stl" ? inspectStl(bytes) : inspectFbx(bytes);
  const sha256 = await sha256File(canonicalPath);
  const after = await stat3(canonicalPath);
  if (after.size !== metadata.size || after.mtimeMs !== metadata.mtimeMs) {
    throw new TripoError("FILE_CHANGED", "The model changed while it was being inspected.", { stage: "model_inspect" });
  }
  return {
    faceCount: geometry.faceCount,
    format: format2,
    isUvMapped: geometry.isUvMapped,
    mtimeMs: metadata.mtimeMs,
    path: canonicalPath,
    sha256,
    size: metadata.size
  };
}
function glbNodeNames(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== GLB_MAGIC || bytes.readUInt32LE(4) !== 2) {
    throw new TripoError("FILE_INVALID", "The artifact is not a valid GLB v2 file.", { stage: "parts" });
  }
  const length = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== GLB_JSON_CHUNK || 20 + length > bytes.length) {
    throw new TripoError("FILE_INVALID", "The GLB JSON chunk is missing.", { stage: "parts" });
  }
  let document;
  try {
    document = JSON.parse(bytes.subarray(20, 20 + length).toString("utf8").replace(/[\u0000\u0020]+$/g, ""));
  } catch (error) {
    throw new TripoError("FILE_INVALID", "The GLB JSON chunk is invalid.", { cause: error, stage: "parts" });
  }
  const names = [];
  for (const node of document.nodes ?? []) {
    if (node && typeof node.name === "string" && node.name.trim()) names.push(node.name.trim());
  }
  return names;
}

// src/ops/modelgen.mjs
var identifier = z8.string().regex(/^[^\s\u0000-\u001f\u007f]{1,256}$/);
var IDENTITY_MATRIX = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
var generationSettingsShape = {
  delight: z8.boolean().optional().describe("Remove lighting from generated textures; independent of PBR."),
  amount: z8.union([z8.literal(1), z8.literal(2), z8.literal(4)]).optional().describe("Smart Mesh variants per input; default 1."),
  face_limits: z8.array(z8.number().int()).min(1).max(4).optional().describe("Smart Mesh per-variant budgets; length must match amount."),
  allow_sensitive: z8.boolean().optional().describe("Permit a Studio image output marked 'sensitive' as an input."),
  enable_image_autofix: z8.boolean().optional().describe("Studio image auto-fix (single-image or batch high_detail only)."),
  face_limit: z8.number().int().describe("Target face budget. Bounds depend on tier/options."),
  generate_parts: z8.boolean().optional().describe("Generate segmented parts (high_detail)."),
  geometry_quality: z8.enum(["standard", "detailed"]).optional().describe("v3.1-20260211 only."),
  model_version: z8.enum([...HIGH_DETAIL_MODEL_VERSIONS, ...SMART_MESH_MODEL_VERSIONS]).optional().describe("Tier-specific version; defaults H3.1 or P2.0."),
  pbr: z8.boolean().optional().describe("Generate PBR maps; requires texture=true. Defaults true when texture enabled."),
  quad: z8.boolean().optional().describe("Quad-dominant topology; default true for Smart Mesh P2, false for high_detail."),
  segmentation_granularity: z8.enum(["coarse", "balanced", "fine"]).optional(),
  smart_poly: z8.boolean().optional().describe("Smart Poly low-poly mode (high_detail)."),
  texture: z8.boolean().optional().describe("Generate textures (high_detail)."),
  texture_alignment: z8.enum(["original_image", "geometry"]).optional(),
  texture_quality: z8.enum(["standard", "detailed", "ultra"]).optional().describe("standard=2K, detailed=4K, ultra=8K."),
  visibility: z8.enum(["private", "public", "shareable"]).default("private")
};
function normalizeSettings(input, mode) {
  if (input.tier !== "smart_mesh" && input.tier !== "high_detail") {
    throw new TripoError("INVALID_INPUT", "tier must be smart_mesh or high_detail.", { stage: "model_generation_prepare" });
  }
  if (!Number.isSafeInteger(input.face_limit)) {
    throw new TripoError("INVALID_INPUT", "face_limit must be a safe integer.", { stage: "model_generation_prepare" });
  }
  const visibility = input.visibility ?? "private";
  const allowSensitive = input.allow_sensitive ?? false;
  if (allowSensitive && visibility !== "private") {
    throw new TripoError("INVALID_INPUT", "allow_sensitive=true requires private visibility.", { stage: "model_generation_prepare" });
  }
  if (input.tier === "smart_mesh") {
    const version = input.model_version ?? NEXUS_V2_MODEL_VERSION;
    if (!SMART_MESH_MODEL_VERSIONS.includes(version)) throw new TripoError("INVALID_INPUT", "Smart Mesh requires a Nexus model version.");
    const maximum = version === NEXUS_MODEL_VERSION ? 2e4 : NEXUS_MAX_FACES;
    const amount = input.amount ?? input.face_limits?.length ?? 1;
    if (![1, 2, 4].includes(amount) || input.face_limits && input.face_limits.length !== amount) throw new TripoError("INVALID_INPUT", "face_limits length must match amount (1, 2, or 4).");
    if (version === NEXUS_MODEL_VERSION && (input.quad === true || amount > 1)) throw new TripoError("INVALID_INPUT", "Quad topology and multiple variants require Smart Mesh P2.");
    const budgets = input.face_limits ?? Array(amount).fill(input.face_limit);
    if (budgets.some((budget) => !Number.isSafeInteger(budget) || budget < NEXUS_MIN_FACES || budget > maximum)) {
      throw new TripoError("INVALID_INPUT", `Smart Mesh face_limit must be from ${NEXUS_MIN_FACES} through ${maximum}.`, { stage: "model_generation_prepare" });
    }
    if (input.generate_parts === true || input.smart_poly === true || input.texture === true || input.pbr === true || input.delight !== void 0 || input.enable_image_autofix === true || input.geometry_quality !== void 0 || input.segmentation_granularity !== void 0 || input.texture_alignment !== void 0 || input.texture_quality !== void 0) {
      throw new TripoError("INVALID_INPUT", "Smart Mesh supports face budgets, variants, quad topology, version, symmetry, and visibility; high-detail texture/geometry/parts options are unavailable.", { stage: "model_generation_prepare" });
    }
    return {
      allow_sensitive: allowSensitive,
      enable_image_autofix: false,
      face_limit: budgets[0],
      generate_parts: false,
      model_version: version,
      amount,
      face_limits: budgets,
      pbr: false,
      quad: input.quad ?? version === NEXUS_V2_MODEL_VERSION,
      smart_poly: false,
      texture: false,
      visibility
    };
  }
  if (input.amount !== void 0 || input.face_limits !== void 0) throw new TripoError("INVALID_INPUT", "amount and face_limits are Smart Mesh settings.");
  const modelVersion = input.model_version ?? "v3.1-20260211";
  if (!HIGH_DETAIL_MODEL_VERSIONS.includes(modelVersion)) {
    throw new TripoError("INVALID_INPUT", "The high-detail model_version is not supported by the current Studio contract.", { stage: "model_generation_prepare" });
  }
  const quad = input.quad ?? false;
  const smartPoly = input.smart_poly ?? false;
  const generateParts = input.generate_parts ?? false;
  const texture = input.texture ?? false;
  const geometryQuality = modelVersion === "v3.1-20260211" ? input.geometry_quality ?? (smartPoly ? "standard" : "detailed") : void 0;
  if (modelVersion !== "v3.1-20260211" && input.geometry_quality !== void 0) {
    throw new TripoError("INVALID_INPUT", "geometry_quality is only sent by Studio for v3.1-20260211.", { stage: "model_generation_prepare" });
  }
  if (generateParts && quad) throw new TripoError("INVALID_INPUT", "generate_parts cannot be combined with quad topology.", { stage: "model_generation_prepare" });
  if (generateParts && texture) throw new TripoError("INVALID_INPUT", "Studio does not combine generate_parts with texture generation.", { stage: "model_generation_prepare" });
  if (smartPoly && geometryQuality === "detailed") {
    throw new TripoError("INVALID_INPUT", "smart_poly and detailed geometry_quality are mutually exclusive in Studio.", { stage: "model_generation_prepare" });
  }
  const minimumFaces = generateParts ? 1e4 : 500;
  const maximumFaces = smartPoly ? quad ? 1e4 : 2e4 : quad ? 5e4 : geometryQuality === "detailed" ? 2e6 : 1e6;
  if (input.face_limit < minimumFaces || input.face_limit > maximumFaces) {
    throw new TripoError("INVALID_INPUT", `face_limit must be from ${minimumFaces} through ${maximumFaces} for these options.`, { stage: "model_generation_prepare" });
  }
  if (input.segmentation_granularity !== void 0 && !generateParts) {
    throw new TripoError("INVALID_INPUT", "segmentation_granularity requires generate_parts=true.", { stage: "model_generation_prepare" });
  }
  if (input.enable_image_autofix === true && !["image", "batch"].includes(mode)) {
    throw new TripoError("INVALID_INPUT", "enable_image_autofix is supported only for image or batch mode.", { stage: "model_generation_prepare" });
  }
  if (!texture && (input.delight !== void 0 || input.texture_alignment !== void 0 || input.texture_quality !== void 0 || input.pbr === true)) {
    throw new TripoError("INVALID_INPUT", "delight, texture_alignment, texture_quality, and pbr require texture=true.", { stage: "model_generation_prepare" });
  }
  return {
    allow_sensitive: allowSensitive,
    enable_image_autofix: ["image", "batch"].includes(mode) ? input.enable_image_autofix ?? false : false,
    face_limit: input.face_limit,
    generate_parts: generateParts,
    ...geometryQuality === void 0 ? {} : { geometry_quality: geometryQuality },
    model_version: modelVersion,
    pbr: texture ? input.pbr ?? true : false,
    quad,
    ...generateParts ? { segmentation_granularity: input.segmentation_granularity ?? "balanced" } : {},
    smart_poly: smartPoly,
    texture,
    ...texture ? { delight: input.delight ?? true } : {},
    ...texture ? { texture_alignment: input.texture_alignment ?? "original_image" } : {},
    ...texture ? { texture_quality: input.texture_quality ?? "detailed" } : {},
    visibility
  };
}
function commonWire(settings, mode) {
  const body = {
    face_limit: settings.face_limit,
    quad: settings.quad,
    visibility: settings.visibility,
    model_version: settings.model_version
  };
  if (settings.tier === "smart_mesh" && settings.amount > 1) {
    body.variations = settings.face_limits.map((face_limit) => ({ face_limit }));
    delete body.face_limit;
  }
  if (settings.tier === "high_detail") {
    body.generate_parts = settings.generate_parts;
    body.smart_poly = settings.smart_poly;
    body.texture = settings.texture;
    if (settings.generate_parts) body.segmentation_granularity = settings.segmentation_granularity;
    if (settings.texture) {
      body.pbr = settings.pbr;
      body.delight = settings.delight;
      body.texture_alignment = settings.texture_alignment;
      body.texture_quality = settings.texture_quality;
    }
    if (["image", "batch"].includes(mode)) body.enable_image_autofix = settings.enable_image_autofix;
    if (settings.model_version === "v3.1-20260211") body.geometry_quality = settings.geometry_quality;
  }
  return body;
}
function wireImage(image) {
  return {
    bucket: image.uploaded.bucket,
    image_audit_result: image.audit.result,
    image_source: image.studio_asset_id === void 0 ? "upload" : "generate",
    key: image.uploaded.key
  };
}
async function studioImageRecord(ctx, assetId, expectedType, outputIndex, slot, allowSensitive) {
  const asset = await ctx.gateway.getStudioImageAsset(assetId);
  if (asset.asset_id !== assetId || asset.status !== "success" || asset.type !== expectedType) {
    throw new TripoError("INSUFFICIENT_EVIDENCE", `Studio image asset ${assetId} is not a successful ${expectedType} asset.`, { stage: "model_generation_prepare" });
  }
  const output = asset.output.data[outputIndex];
  if (!output) throw new TripoError("PLAN_NOT_FOUND", "The selected Studio image output index does not exist.", { stage: "model_generation_prepare" });
  const audit = output.image_audit_result;
  if ((audit === "sensitive" || audit === "nsfw") && !allowSensitive) {
    throw new TripoError("CONTENT_AUDIT_REJECTED", "The selected Studio image output is marked sensitive.", { stage: "model_generation_prepare" });
  }
  if (audit === "nsfw" || audit === "reject") {
    throw new TripoError("CONTENT_AUDIT_REJECTED", `The selected Studio image output audit is ${audit}.`, { stage: "model_generation_prepare" });
  }
  return {
    audit: { result: audit === "pass" || audit === "sensitive" ? audit : "pass" },
    slot,
    source_name: `Studio ${asset.type} output ${outputIndex}`,
    studio_asset_id: asset.asset_id,
    studio_output_index: outputIndex,
    uploaded: { bucket: output.bucket, key: output.key }
  };
}
function normalizeMatrix(input) {
  const matrix2 = input === void 0 ? [...IDENTITY_MATRIX] : [...input];
  if (matrix2.length !== 16 || matrix2.some((entry) => !Number.isFinite(entry) || Math.abs(entry) > 1e6)) {
    throw new TripoError("INVALID_INPUT", "transform_matrix must contain exactly 16 finite values between -1,000,000 and 1,000,000.", { stage: "model_import_prepare" });
  }
  if (Math.abs(matrix2[3]) > 1e-9 || Math.abs(matrix2[7]) > 1e-9 || Math.abs(matrix2[11]) > 1e-9 || Math.abs(matrix2[15] - 1) > 1e-9) {
    throw new TripoError("INVALID_INPUT", "transform_matrix must be an affine Three.js column-major matrix with final row [0,0,0,1].", { stage: "model_import_prepare" });
  }
  const determinant = matrix2[0] * (matrix2[5] * matrix2[10] - matrix2[9] * matrix2[6]) - matrix2[4] * (matrix2[1] * matrix2[10] - matrix2[9] * matrix2[2]) + matrix2[8] * (matrix2[1] * matrix2[6] - matrix2[5] * matrix2[2]);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
    throw new TripoError("INVALID_INPUT", "transform_matrix must have a non-singular 3D scale/rotation component.", { stage: "model_import_prepare" });
  }
  return matrix2;
}
var modelOperations = {
  "model.generate": {
    category: "model",
    consumesCredits: true,
    description: "Generate 3D from text, an image, actual multiview, existing Studio outputs, or a batch of up to 30 independent images. Smart Mesh P2 supports quad topology and 1/2/4 budget variants; high_detail supports independent geometry quality, texture, delight, PBR and parts.",
    inputShape: {
      ...generationSettingsShape,
      back_image_path: z8.string().optional(),
      front_image_path: z8.string().optional().describe("Local front view for mode=multiview."),
      image_path: z8.string().optional().describe("Local reference image for mode=image."),
      left_image_path: z8.string().optional(),
      mode: z8.enum(["text", "image", "multiview", "batch", "studio_image", "studio_multiview"]).describe("batch generates a separate model for each image; multiview is one model from fixed views."),
      image_paths: z8.array(z8.string()).min(1).max(30).optional().describe("mode=batch: up to 30 independent input images."),
      symmetry: z8.boolean().optional().describe("P2.0 symmetry override; omitted uses Studio symmetry check on image inputs."),
      output_index: z8.number().int().min(0).max(15).optional().describe("studio_image: which output of the asset to use."),
      prompt: z8.string().max(1e3).optional().describe("Required for mode=text."),
      right_image_path: z8.string().optional(),
      studio_image_asset_id: identifier.optional().describe("studio_image: a successful generate_image asset id."),
      studio_multiview_asset_id: identifier.optional().describe("studio_multiview: a successful multiview_images asset id."),
      submit: z8.boolean().optional(),
      t_pose: z8.boolean().optional().describe("text mode: generate in T-pose."),
      tier: z8.enum(["smart_mesh", "high_detail"]).describe("Generation tier.")
    },
    title: "Generate 3D model",
    async build(ctx, input, taskId) {
      const mode = input.mode;
      const settingsMode = mode === "studio_image" ? "image" : mode === "studio_multiview" ? "multiview" : mode;
      const settings = { ...normalizeSettings(input, settingsMode), tier: input.tier };
      const snapshots = [];
      const metadata = { mode };
      const body = commonWire(settings, settingsMode);
      if (mode === "text") {
        const prompt = (input.prompt ?? "").trim();
        if (prompt.length < 1 || prompt.length > 1e3) {
          throw new TripoError("INVALID_INPUT", "prompt must contain 1 through 1,000 characters.", { stage: "model_generation_prepare" });
        }
        Object.assign(body, { gen_image_model_version: TEXT_IMAGE_MODEL_VERSION, prompt, sketch_to_render: false, t_pose: input.t_pose ?? false });
        metadata.prompt = prompt;
      } else if (mode === "image" || mode === "multiview" || mode === "batch") {
        if (mode === "batch" && !input.image_paths?.length) throw new TripoError("INVALID_INPUT", "image_paths is required for batch mode.");
        const slots = mode === "batch" ? input.image_paths.map((filePath, index) => [`input_${index}`, filePath, true]) : mode === "image" ? [["image", input.image_path, true]] : [["front", input.front_image_path, true], ["left", input.left_image_path, false], ["back", input.back_image_path, false], ["right", input.right_image_path, false]];
        const wireImages = mode === "image" ? null : [];
        let single;
        for (const [slot, filePath, required] of slots) {
          if (!filePath) {
            if (required) throw new TripoError("INVALID_INPUT", `${slot}_image_path is required for mode=${mode}.`, { stage: "model_generation_prepare" });
            if (wireImages) wireImages.push(null);
            continue;
          }
          assertLocalPathSpecifier(filePath, "model_generation_input_policy");
          const staged = await stageLocalImage(ctx.config, ctx.gateway, ctx.uploader, filePath, true, {
            index: snapshots.length + 1,
            label: `${slot} view`,
            slot,
            taskId
          });
          snapshots.push(staged.provenance);
          const wire = { bucket: staged.uploaded.bucket, image_audit_result: staged.audit.result, image_source: "upload", key: staged.uploaded.key, ...mode === "batch" && settings.texture ? { texture_quality: settings.texture_quality } : {} };
          if (wireImages) wireImages.push(wire);
          else single = wire;
        }
        if (mode === "multiview" && wireImages.filter(Boolean).length < 2) {
          throw new TripoError("INVALID_INPUT", "Multiview generation requires front plus at least one of left, back, or right.", { stage: "model_generation_prepare" });
        }
        if (new Set(snapshots.map((s) => s.sha256)).size !== snapshots.length) {
          throw new TripoError("INVALID_INPUT", "Every multiview input must have distinct image content.", { stage: "model_generation_prepare" });
        }
        body.image = mode === "image" ? single : wireImages;
      } else {
        const allowSensitive = input.allow_sensitive ?? false;
        if (mode === "studio_image") {
          if (!input.studio_image_asset_id) throw new TripoError("INVALID_INPUT", "studio_image_asset_id is required.", { stage: "model_generation_prepare" });
          const record = await studioImageRecord(ctx, input.studio_image_asset_id, "generate_image", input.output_index ?? 0, "image", allowSensitive);
          body.image = wireImage(record);
          metadata.studio_inputs = [{ asset_id: record.studio_asset_id, output_index: record.studio_output_index, slot: "image" }];
        } else {
          if (!input.studio_multiview_asset_id) throw new TripoError("INVALID_INPUT", "studio_multiview_asset_id is required.", { stage: "model_generation_prepare" });
          const slots4 = ["front", "left", "back", "right"];
          const records = await Promise.all(slots4.map((slot, index) => studioImageRecord(ctx, input.studio_multiview_asset_id, "multiview_images", index, slot, allowSensitive)));
          body.image = records.map(wireImage);
          metadata.studio_inputs = records.map((record) => ({ asset_id: record.studio_asset_id, output_index: record.studio_output_index, slot: record.slot }));
        }
      }
      if (settings.model_version === NEXUS_V2_MODEL_VERSION) {
        const reference = Array.isArray(body.image) ? body.image.find(Boolean) : body.image;
        if (input.symmetry !== void 0) body.symmetry = input.symmetry;
        else if (reference) body.symmetry = await ctx.gateway.checkSymmetry(reference);
      } else if (input.symmetry !== void 0) throw new TripoError("INVALID_INPUT", "symmetry is a P2.0 setting.");
      return { metadata, payload: { body, mode: settingsMode }, settings, snapshots };
    },
    async submitRemote(ctx, task) {
      const receipts = await ctx.gateway.submitModelGeneration(task.payload);
      return { operator_ids: receipts.map((entry) => entry.operator_id), project_ids: receipts.map((entry) => entry.project_id ?? null), project_id: receipts[0].project_id ?? null };
    },
    async syncRemote(ctx, task) {
      return syncGeneratedModels(ctx, task);
    }
  },
  "model.import": {
    category: "model",
    consumesCredits: false,
    description: "Import a local GLB/OBJ/FBX/STL model (up to 150 MiB, 3M faces) into the Studio workspace. The file is content-inspected, snapshotted, uploaded, then registered as a Studio project.",
    inputShape: {
      file_path: z8.string().describe("Local .glb/.obj/.fbx/.stl model path."),
      name: z8.string().min(1).max(255).optional().describe("Studio project name; defaults to the file name."),
      submit: z8.boolean().optional(),
      transform_matrix: z8.array(z8.number()).length(16).optional().describe("Three.js column-major affine matrix; identity by default."),
      use_original_uv: z8.boolean().default(false)
    },
    title: "Import local model",
    async build(ctx, input, taskId) {
      assertLocalPathSpecifier(input.file_path, "import_input_policy");
      const staged = await stageLocalModelFile(ctx.config, input.file_path, { index: 1, label: "model", slot: "model", taskId });
      const inspected = await inspectModel(staged.path);
      const matrix2 = normalizeMatrix(input.transform_matrix);
      const name = (input.name ?? staged.metadata.source_name).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
      if (!name || name.length > 255) throw new TripoError("INVALID_INPUT", "The model name must be 1-255 safe characters.", { stage: "model_import_prepare" });
      const token = await ctx.gateway.requestTemporaryToken(inspected.format);
      const uploaded = await ctx.uploader.upload(staged.path, token);
      return {
        metadata: {
          face_count: inspected.faceCount,
          format: inspected.format,
          has_uv: inspected.isUvMapped,
          name
        },
        payload: {
          format: inspected.format,
          model: uploaded,
          name,
          transform_matrix: matrix2,
          use_original_uv: input.use_original_uv
        },
        snapshots: [staged.provenance]
      };
    },
    async submitRemote(ctx, task) {
      const receipt = await ctx.gateway.submitModelImport(task.payload);
      return { operator_id: receipt.operator_id, project_id: receipt.project_id ?? null };
    },
    async syncRemote(ctx, task) {
      const items = await ctx.gateway.getProgress([task.remote.operator_id]);
      const item = selectProgress(items, task.remote.operator_id);
      if (item.project_id && task.remote.project_id && item.project_id !== task.remote.project_id) {
        throw new TripoError("INSUFFICIENT_EVIDENCE", "Progress returned a different project ID for this import.", { stage: "model_import_progress" });
      }
      const projectId2 = item.project_id ?? task.remote.project_id;
      const status = remoteStatus(item.status);
      let result;
      if (status === "succeeded" && projectId2) {
        const detail = await ctx.gateway.getProject(projectId2, task.remote.operator_id);
        result = { model_url: detail.model_url || null, project_id: projectId2, project_name: detail.project_name ?? null };
      } else if (projectId2) {
        result = { project_id: projectId2 };
      }
      return { progress: { left_time: item.left_time ?? null, progress: item.progress ?? null, status: item.status }, result, status };
    }
  }
};
function selectProgress(items, operatorId) {
  const exact = items.find((entry) => entry.operator_id === operatorId || entry.id === operatorId);
  if (exact) return exact;
  if (items.length === 1 && items[0]?.operator_id === void 0 && items[0]?.id === void 0) return items[0];
  throw new TripoError("INSUFFICIENT_EVIDENCE", "Tripo omitted progress for an expected operator.", { stage: "task_progress" });
}
function remoteStatus(status) {
  if (status === "success") return "succeeded";
  if (status === "cancelled") return "canceled";
  if (status === "expired") return "expired";
  if (status === "banned") return "banned";
  if (status === "failed") return "failed";
  if (status === "prepare" || status === "queued") return "queued";
  return "running";
}
function normalizeOperatorStatus(statuses) {
  if (statuses.every((s) => s === "success")) return "succeeded";
  if (statuses.every((s) => s === "cancelled")) return "canceled";
  if (statuses.some((s) => s === "running")) return "running";
  if (statuses.some((s) => ["queued", "prepare"].includes(s))) return "queued";
  return "failed";
}
async function syncGeneratedModels(ctx, task) {
  const ids = task.remote.operator_ids;
  const items = await ctx.gateway.getProgress(ids);
  const selected = ids.map((id3) => selectProgress(items, id3));
  const models = [];
  for (const [index, item] of selected.entries()) {
    const expected = task.remote.project_ids?.[index] ?? (index === 0 ? task.remote.project_id : null);
    if (expected && item.project_id && expected !== item.project_id) throw new TripoError("INSUFFICIENT_EVIDENCE", "Progress returned a different project for this model variant.");
    const projectId2 = item.project_id ?? expected;
    const model = { output_index: index, operator_id: ids[index], project_id: projectId2, status: remoteStatus(item.status) };
    if (model.status === "succeeded") {
      if (!projectId2) throw new TripoError("INSUFFICIENT_EVIDENCE", "Successful generation has no project ID.");
      const detail = await ctx.gateway.getProject(projectId2, ids[index]);
      if (detail.id && detail.id !== projectId2) throw new TripoError("INSUFFICIENT_EVIDENCE", "Model detail returned a different project.");
      Object.assign(model, { model_url: detail.model_url || null, project_name: detail.project_name ?? null });
    }
    models.push(model);
  }
  return { status: normalizeOperatorStatus(selected.map((item) => item.status)), progress: { items: selected.map((item, index) => ({ ...item, operator_id: ids[index] })) }, result: { ...models[0], models } };
}

// src/ops/postops.mjs
var PROJECT_ID = /^[^\s\u0000-\u001f\u007f]{1,256}$/;
var PART_NAME = /^[^\u0000-\u001f\u007f]{1,256}$/;
var MAX_PARTS = 200;
var MAX_PROMPT_LENGTH = 1e3;
var projectId = z9.string().regex(PROJECT_ID).describe("Studio project (model asset) id \u2014 see tripo_list_models.");
var partNames = z9.array(z9.string().regex(PART_NAME)).min(1).max(MAX_PARTS);
var BUILTIN_TEXTURE_STYLES = {
  heritage: { bucket: "tripo-data", key: "tripo-studio/style_image/heritage.png" },
  mecha: { bucket: "tripo-data", key: "tripo-studio/style_image/mecha.png" },
  mecha_pop: { bucket: "tripo-data", key: "tripo-studio/style_image/mecha_pop.png" },
  wood: { bucket: "tripo-data", key: "tripo-studio/style_image/wood.jpg" }
};
var POSTPROCESS_ENDPOINTS = {
  ai_completion: "ai_completion",
  animation_retarget: "retarget_model",
  apply_retexture: "apply_retexture",
  mesh_fill: "mesh_fill",
  pbr: "pbr_generate",
  remesh: "remesh",
  retexture_preview: "retexture_generate",
  rigging: "rigging_model",
  segmentation: "ai_segmentation",
  texture_generate: "texture_model",
  texture_upscale: "texture_upscaler"
};
function validateProjectId(value) {
  if (!PROJECT_ID.test(value)) {
    throw new TripoError("INVALID_INPUT", "project_id must be a non-empty Studio project identifier without whitespace.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  return value;
}
function validatePartNames(names, field = "part_names") {
  if (!Array.isArray(names) || names.length < 1 || names.length > MAX_PARTS) {
    throw new TripoError("INVALID_INPUT", `${field} must contain 1 through ${MAX_PARTS} raw hierarchy names.`, { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  const normalized = names.map((name) => name.trim());
  if (normalized.some((name) => !PART_NAME.test(name))) {
    throw new TripoError("INVALID_INPUT", `${field} contains an empty, control-character, or overlong name.`, { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new TripoError("INVALID_INPUT", `${field} must not contain duplicate names.`, { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  return normalized;
}
function validatePrompt(prompt, field) {
  const normalized = prompt.trim();
  if (normalized.length < 1 || normalized.length > MAX_PROMPT_LENGTH || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) {
    throw new TripoError("INVALID_INPUT", `${field} must contain 1 through ${MAX_PROMPT_LENGTH} safe characters.`, { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  return normalized;
}
async function preflight(ctx, internalKind, pid, options = {}) {
  validateProjectId(pid);
  const detail = await ctx.gateway.getProject(pid);
  if (detail.id && detail.id !== pid) {
    throw new TripoError("INSUFFICIENT_EVIDENCE", "Tripo returned a different project during operation staging.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  const capabilities = projectCapabilities(pid, detail);
  assertProjectSupports(internalKind, capabilities, options);
  const warnings = [];
  if ((internalKind === "texture_generate" || internalKind === "texture_upscale") && capabilities.is_ultra_textured === true) {
    warnings.push("This project is already 8K; Studio may only allow an 8K regenerate target.");
  }
  return { capabilities, warnings };
}
function postprocessSubmit(endpointKey) {
  return async (ctx, task) => {
    const receipt = await ctx.gateway.submitPostprocess(POSTPROCESS_ENDPOINTS[endpointKey], task.payload);
    if (receipt.project_id !== void 0 && receipt.project_id !== task.payload.project_id) {
      throw new TripoError("INSUFFICIENT_EVIDENCE", "Tripo returned a different project ID for the submitted operation.", { stage: "operation_dispatch_receipt" });
    }
    return { operator_id: receipt.operator_id, project_id: task.payload.project_id };
  };
}
function postprocessSync() {
  return async (ctx, task) => {
    const items = await ctx.gateway.getProgress([task.remote.operator_id]);
    const item = selectProgress(items, task.remote.operator_id);
    if (item.project_id && item.project_id !== task.remote.project_id) {
      throw new TripoError("INSUFFICIENT_EVIDENCE", "Progress returned a different project ID for this operation.", { stage: "operation_progress" });
    }
    const status = remoteStatus(item.status);
    let result;
    if (status === "succeeded") {
      result = { project_id: task.remote.project_id };
      if (task.kind === "texture.edit_preview") {
        const preview = await ctx.gateway.getRetexture(task.remote.operator_id);
        if (!preview?.url) throw new TripoError("INSUFFICIENT_EVIDENCE", "Completed texture preview has no artifact yet; sync again.", { stage: "operation_progress" });
        result.retexture_preview = { camera_matrix: preview.camera_matrix, url: preview.url };
      }
      if (task.kind === "model.animate" || task.kind === "model.apply_motion") {
        const detail = await ctx.gateway.getProject(task.remote.project_id, task.remote.operator_id);
        if (detail.id && detail.id !== task.remote.project_id) throw new TripoError("INSUFFICIENT_EVIDENCE", "Animation artifact project identity mismatch.", { stage: "operation_progress" });
        const artifacts = detail?.operator?.Retarget ?? detail?.operator?.retarget ?? detail?.operator?.retarget_model ?? [];
        const expected = task.payload.animations?.[0];
        const match = artifacts.find((entry) => task.payload.motion_asset_id ? entry.motion_asset_id === task.payload.motion_asset_id : entry.name === expected);
        if (!match?.model_url) throw new TripoError("INSUFFICIENT_EVIDENCE", "The requested animation artifact is not available yet; sync again.", { stage: "operation_progress" });
        result.animation_model_url = match.model_url;
      }
    }
    return {
      progress: { left_time: item.left_time ?? null, progress: item.progress ?? null, reason: item.reason ?? null, status: item.status },
      result,
      status
    };
  };
}
function validateRiggingModelVersion(modelVersion) {
  if (![RIGGING_MODEL_VERSION_V1, RIGGING_MODEL_VERSION_V2_5, RIGGING_MODEL_VERSION_V3].includes(modelVersion)) {
    throw new TripoError("INVALID_INPUT", `model_version must be ${RIGGING_MODEL_VERSION_V1}, ${RIGGING_MODEL_VERSION_V2_5}, or ${RIGGING_MODEL_VERSION_V3}.`, { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  return modelVersion;
}
function publicRiggingPrecheck(precheck, requestedModelVersion) {
  const submissionModelVersion = precheck.riggable && precheck.rig_type !== "others" ? precheck.rig_type === "biped" ? RIGGING_MODEL_VERSION_V1 : requestedModelVersion : null;
  return {
    requested_model_version: requestedModelVersion,
    riggable: precheck.riggable,
    rig_type: precheck.rig_type,
    submission_model_version: requestedModelVersion === RIGGING_MODEL_VERSION_V3 && precheck.riggable ? requestedModelVersion : submissionModelVersion
  };
}
var postprocessOperations = {
  "model.segment": {
    category: "postprocess",
    consumesCredits: true,
    description: "Segment the model into semantic parts (required before part completion and part-scoped texture work). Studio internal kind: ai_segmentation.",
    inputShape: {
      project_id: projectId,
      segmentation_granularity: z9.enum(["coarse", "balanced", "fine"]).default("balanced"),
      submit: z9.boolean().optional()
    },
    internalKind: "segmentation",
    title: "Segment model",
    async build(ctx, input) {
      const pf = await preflight(ctx, "segmentation", input.project_id);
      return {
        capabilities: pf.capabilities,
        payload: { model_version: SEGMENTATION_MODEL_VERSION, project_id: input.project_id, segmentation_granularity: input.segmentation_granularity },
        snapshots: [],
        warnings: pf.warnings
      };
    },
    submitRemote: postprocessSubmit("segmentation"),
    syncRemote: postprocessSync()
  },
  "model.complete_parts": {
    category: "postprocess",
    consumesCredits: true,
    description: "Fill or complete selected mesh parts. mode=quick_cap closes open boundaries; mode=ai_completion regenerates missing regions. Requires a segmented/multi-mesh project and raw hierarchy part names (see tripo_get_model include parts).",
    inputShape: {
      mode: z9.enum(["quick_cap", "ai_completion"]).default("ai_completion"),
      part_names: partNames.describe("Raw hierarchy part names, not display renames."),
      project_id: projectId,
      submit: z9.boolean().optional()
    },
    title: "Complete mesh parts",
    async build(ctx, input) {
      const internalKind = input.mode === "quick_cap" ? "mesh_fill" : "ai_completion";
      const pf = await preflight(ctx, internalKind, input.project_id);
      return {
        capabilities: pf.capabilities,
        metadata: { mode: input.mode },
        payload: {
          model_version: input.mode === "quick_cap" ? STUDIO_DEFAULT_MODEL_VERSION : COMPLETION_MODEL_VERSION,
          part_names: validatePartNames(input.part_names),
          project_id: input.project_id
        },
        snapshots: [],
        warnings: [...pf.warnings, "part_names must be raw hierarchy names, not display renames; the project must already be segmented/multi-mesh."]
      };
    },
    submitRemote: async (ctx, task) => postprocessSubmit(task.metadata?.mode === "quick_cap" ? "mesh_fill" : "ai_completion")(ctx, task),
    syncRemote: postprocessSync()
  },
  "model.remesh": {
    category: "postprocess",
    consumesCredits: true,
    description: "Remesh selected parts to a target face budget. quad toggles quad-dominant topology; smart_poly enables Smart Poly mode (not on Nexus/Smart Mesh projects). face_limit bounds: normal quad \u226450K, normal triangle \u2264150K, smart quad \u226410K, smart triangle \u226420K, all \u2265500.",
    inputShape: {
      face_limit: z9.number().int().describe("Target face budget for the selected mode."),
      part_name_list: partNames.describe("Raw hierarchy part names to remesh."),
      project_id: projectId,
      quad: z9.boolean().default(false),
      smart_poly: z9.boolean().default(false),
      submit: z9.boolean().optional()
    },
    internalKind: "remesh",
    title: "Remesh model",
    async build(ctx, input) {
      const maximum = input.smart_poly ? input.quad ? REMESH_SMART_QUAD_MAX_FACES : REMESH_SMART_TRIANGLE_MAX_FACES : input.quad ? REMESH_NORMAL_QUAD_MAX_FACES : REMESH_NORMAL_TRIANGLE_MAX_FACES;
      if (!Number.isSafeInteger(input.face_limit) || input.face_limit < REMESH_MIN_FACES || input.face_limit > maximum) {
        throw new TripoError("INVALID_INPUT", `face_limit must be an integer from ${REMESH_MIN_FACES} through ${maximum} for the selected remesh mode.`, { safeToRetryPaidOperation: true, stage: "operation_stage" });
      }
      const pf = await preflight(ctx, "remesh", input.project_id, { smartPoly: input.smart_poly });
      return {
        capabilities: pf.capabilities,
        payload: {
          bake: true,
          face_limit: input.face_limit,
          model_version: STUDIO_DEFAULT_MODEL_VERSION,
          part_name_list: validatePartNames(input.part_name_list, "part_name_list"),
          project_id: input.project_id,
          quad: input.quad,
          smart_poly: input.smart_poly
        },
        snapshots: [],
        warnings: pf.warnings
      };
    },
    submitRemote: postprocessSubmit("remesh"),
    syncRemote: postprocessSync()
  },
  "texture.generate": {
    category: "postprocess",
    consumesCredits: true,
    description: "Generate textures for a project: mode=text (prompt), mode=image (local reference image), or mode=multiview (front plus optional left/back/right). Optionally a built-in style (heritage|mecha|mecha_pop|wood) or a local style image \u2014 styles are incompatible with multiview mode.",
    inputShape: {
      alignment: z9.enum(["original_image", "geometry"]).default("original_image"),
      delight: z9.boolean().default(true).describe("Remove lighting independently of PBR."),
      back_image_path: z9.string().optional(),
      front_image_path: z9.string().optional(),
      image_path: z9.string().optional().describe("Local reference image for mode=image."),
      left_image_path: z9.string().optional(),
      mode: z9.enum(["text", "image", "multiview"]).describe("Texture source mode."),
      part_names: partNames,
      project_id: projectId,
      prompt: z9.string().optional().describe("Required for mode=text."),
      quality: z9.enum(["standard", "detailed", "ultra"]).default("detailed"),
      right_image_path: z9.string().optional(),
      style: z9.enum(["heritage", "mecha", "mecha_pop", "wood"]).optional(),
      style_image_path: z9.string().optional().describe("Local style reference image; mutually exclusive with style."),
      submit: z9.boolean().optional()
    },
    internalKind: "texture_generate",
    title: "Generate texture",
    async build(ctx, input, taskId) {
      const pf = await preflight(ctx, "texture_generate", input.project_id);
      if (input.style && input.style_image_path) {
        throw new TripoError("INVALID_INPUT", "Choose either a built-in style or style_image_path, not both.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
      }
      if (input.mode === "multiview" && (input.style || input.style_image_path)) {
        throw new TripoError("INVALID_INPUT", "The current Studio UI does not combine a style image with multiview texture mode.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
      }
      const snapshots = [];
      const payload = {
        model_version: TEXTURE_MODEL_VERSION,
        delight: input.delight,
        part_names: validatePartNames(input.part_names),
        project_id: input.project_id,
        texture_alignment: input.alignment,
        texture_quality: input.quality
      };
      const retain = async (imagePath2, label, slot) => {
        assertLocalPathSpecifier(imagePath2, "operation_input_policy");
        const image = await stageLocalImage(ctx.config, ctx.gateway, ctx.uploader, imagePath2, true, { index: snapshots.length + 1, label, slot, taskId });
        snapshots.push(image.provenance);
        return image;
      };
      const imageMetadata = [];
      if (input.mode === "text") {
        payload.prompt_text = validatePrompt(input.prompt ?? "", "prompt");
      } else if (input.mode === "image") {
        if (!input.image_path) throw new TripoError("INVALID_INPUT", "image_path is required for image texture mode.", { stage: "operation_stage" });
        const image = await retain(input.image_path, "Texture reference", "reference");
        payload.image = auditedImageWire(image);
        imageMetadata.push({ role: "reference", ...image.metadata });
      } else {
        if (!input.front_image_path) throw new TripoError("INVALID_INPUT", "front_image_path is required for multiview mode.", { stage: "operation_stage" });
        const paths = [input.front_image_path, input.left_image_path, input.back_image_path, input.right_image_path];
        if (paths.filter(Boolean).length < 2) {
          throw new TripoError("INVALID_INPUT", "Multiview mode requires the front image and at least one additional view.", { stage: "operation_stage" });
        }
        const roles = ["front", "left", "back", "right"];
        const images = [];
        for (let index = 0; index < paths.length; index += 1) {
          if (!paths[index]) {
            images.push(null);
            continue;
          }
          const image = await retain(paths[index], `${roles[index]} view`, roles[index]);
          images.push(auditedImageWire(image));
          imageMetadata.push({ role: roles[index], ...image.metadata });
        }
        payload.images = images;
      }
      if (input.style) {
        payload.style_image = { ...BUILTIN_TEXTURE_STYLES[input.style] };
      } else if (input.style_image_path) {
        const style = await retain(input.style_image_path, "Style reference", "style");
        payload.style_image = { bucket: style.uploaded.bucket, image_audit_result: style.audit.result, key: style.uploaded.key };
        imageMetadata.push({ role: "style", ...style.metadata });
      }
      return {
        capabilities: pf.capabilities,
        metadata: { images: imageMetadata, mode: input.mode, ...input.style ? { builtin_style: input.style } : {} },
        payload,
        snapshots,
        warnings: pf.warnings
      };
    },
    submitRemote: postprocessSubmit("texture_generate"),
    syncRemote: postprocessSync()
  },
  "texture.edit_preview": {
    category: "postprocess",
    consumesCredits: true,
    description: "Studio Magic Brush: generate a retexture preview for a rendered viewport. render_image_path must be a static WebP produced at 2x the active viewport; camera_matrix must be activeCamera.matrix.toArray() (16 values).",
    inputShape: {
      camera_matrix: z9.array(z9.number()).length(16).describe("Three.js camera world matrix."),
      project_id: projectId,
      prompt: z9.string().min(1).max(1e3),
      render_image_path: z9.string().describe("Local WebP viewport render at 2x."),
      strength: z9.number().min(0).max(1).default(0.5),
      submit: z9.boolean().optional()
    },
    internalKind: "retexture_preview",
    title: "Magic Brush preview",
    async build(ctx, input, taskId) {
      if (input.camera_matrix.length !== 16 || input.camera_matrix.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e9)) {
        throw new TripoError("INVALID_INPUT", "camera_matrix must contain exactly 16 finite Three.js camera world-matrix values.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
      }
      const pf = await preflight(ctx, "retexture_preview", input.project_id);
      assertLocalPathSpecifier(input.render_image_path, "operation_input_policy");
      const render = await stageLocalImage(ctx.config, ctx.gateway, ctx.uploader, input.render_image_path, false, {
        index: 1,
        label: "Viewport render",
        requiredFormat: "webp",
        slot: "render",
        taskId
      });
      return {
        capabilities: pf.capabilities,
        metadata: { render_image: render.metadata },
        payload: {
          camera_matrix: input.camera_matrix,
          model_version: TEXTURE_MODEL_VERSION,
          project_id: input.project_id,
          prompt: validatePrompt(input.prompt, "prompt"),
          render_image: directImageWire(render),
          strength: input.strength
        },
        snapshots: [render.provenance],
        warnings: [...pf.warnings, "render_image must be a 2x Studio viewport render and camera_matrix must be activeCamera.matrix.toArray(), not a view/projection matrix."]
      };
    },
    submitRemote: postprocessSubmit("retexture_preview"),
    syncRemote: postprocessSync()
  },
  "texture.edit_apply": {
    category: "postprocess",
    consumesCredits: true,
    description: "Apply baked per-part textures to the model (Studio apply_retexture). Each entry needs a raw part name plus a local image already baked for that part by a Studio-compatible viewport workflow.",
    inputShape: {
      project_id: projectId,
      submit: z9.boolean().optional(),
      textures: z9.array(z9.object({ image_path: z9.string(), part_name: z9.string().regex(PART_NAME) }).strict()).min(1).max(MAX_PARTS).describe("Per-part baked texture images.")
    },
    internalKind: "apply_retexture",
    title: "Apply texture edits",
    async build(ctx, input, taskId) {
      const pf = await preflight(ctx, "apply_retexture", input.project_id);
      const names = validatePartNames(input.textures.map((entry) => entry.part_name));
      const snapshots = [];
      const imageMap = [];
      const images = [];
      for (let index = 0; index < input.textures.length; index += 1) {
        const entry = input.textures[index];
        assertLocalPathSpecifier(entry.image_path, "operation_input_policy");
        const image = await stageLocalImage(ctx.config, ctx.gateway, ctx.uploader, entry.image_path, false, {
          index: index + 1,
          label: names[index],
          slot: `part:${names[index]}`,
          taskId
        });
        snapshots.push(image.provenance);
        imageMap.push({ image: directImageWire(image), part_name: names[index] });
        images.push({ part_name: names[index], ...image.metadata });
      }
      return {
        capabilities: pf.capabilities,
        metadata: { images },
        payload: { image_map: imageMap, model_version: TEXTURE_MODEL_VERSION, project_id: input.project_id },
        snapshots,
        warnings: [...pf.warnings, "Each input must be a complete per-part texture already baked by a Studio-compatible viewport workflow; the backend accepts no mask field."]
      };
    },
    submitRemote: postprocessSubmit("apply_retexture"),
    syncRemote: postprocessSync()
  },
  "texture.upscale": {
    category: "postprocess",
    consumesCredits: true,
    description: "Upscale the project's texture set. quality=detailed targets 4K, ultra targets 8K. A project already at 8K cannot be downscaled to 4K.",
    inputShape: {
      project_id: projectId,
      quality: z9.enum(["detailed", "ultra"]).describe("detailed=4K, ultra=8K."),
      submit: z9.boolean().optional()
    },
    internalKind: "texture_upscale",
    title: "Upscale textures",
    async build(ctx, input) {
      const pf = await preflight(ctx, "texture_upscale", input.project_id);
      if (input.quality === "detailed" && pf.capabilities.is_ultra_textured === true) {
        throw new TripoError("REMOTE_API_ERROR", "A current 8K project cannot be downscaled to the 4K target in Studio.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
      }
      return {
        capabilities: pf.capabilities,
        payload: { model_version: TEXTURE_MODEL_VERSION, project_id: input.project_id, texture_quality: input.quality },
        snapshots: [],
        warnings: pf.warnings
      };
    },
    submitRemote: postprocessSubmit("texture_upscale"),
    syncRemote: postprocessSync()
  },
  "texture.pbr": {
    category: "postprocess",
    consumesCredits: true,
    description: "Generate PBR material maps for an already-textured project.",
    inputShape: { project_id: projectId, submit: z9.boolean().optional() },
    internalKind: "pbr",
    title: "Generate PBR maps",
    async build(ctx, input) {
      const pf = await preflight(ctx, "pbr", input.project_id);
      return {
        capabilities: pf.capabilities,
        payload: { model_version: TEXTURE_MODEL_VERSION, project_id: input.project_id },
        snapshots: [],
        warnings: pf.warnings
      };
    },
    submitRemote: postprocessSubmit("pbr"),
    syncRemote: postprocessSync()
  },
  "model.rig": {
    category: "postprocess",
    consumesCredits: true,
    description: "Auto-rig a textured project, default V3 with humanoid skeleton presets (ActorCore/Mixamo/Unreal/VRM/Unity). Runs Studio's rig precheck before staging; legacy V1/V2.5 remain selectable, and legacy bipeds use V1.",
    inputShape: {
      model_version: z9.enum([RIGGING_MODEL_VERSION_V1, RIGGING_MODEL_VERSION_V2_5, RIGGING_MODEL_VERSION_V3]).default(RIGGING_MODEL_VERSION_V3),
      skeleton_preset: z9.enum(SKELETON_PRESETS).optional().describe("V3 humanoid spec: actorcore, mixamo, unreal, vrm, unity."),
      rigging_type: z9.enum(["humanoid", "other"]).default("humanoid"),
      project_id: projectId,
      submit: z9.boolean().optional()
    },
    internalKind: "rigging",
    title: "Auto-rig model",
    async build(ctx, input) {
      const requestedModelVersion = validateRiggingModelVersion(input.model_version);
      if (input.skeleton_preset && (requestedModelVersion !== RIGGING_MODEL_VERSION_V3 || input.rigging_type !== "humanoid")) throw new TripoError("INVALID_INPUT", "skeleton_preset requires V3 humanoid rigging.");
      const pf = await preflight(ctx, "rigging", input.project_id);
      const precheck = await ctx.gateway.precheckRigging({ modelVersion: requestedModelVersion, projectId: input.project_id });
      const publicPrecheck = publicRiggingPrecheck(precheck, requestedModelVersion);
      if (!precheck.riggable) {
        throw new TripoError(
          "REMOTE_API_ERROR",
          precheck.rig_type === "biped" ? "Studio's rig precheck rejected this biped. A clear T-pose is required before Auto Rig." : "Studio's rig precheck determined that this model is not riggable.",
          { details: { riggable: precheck.riggable, rig_type: precheck.rig_type }, safeToRetryPaidOperation: true, stage: "rigging_precheck" }
        );
      }
      if (requestedModelVersion === RIGGING_MODEL_VERSION_V3 && input.rigging_type === "humanoid" && precheck.rig_type !== "biped") {
        throw new TripoError("INVALID_INPUT", "The selected humanoid rig requires a biped precheck result. Use rigging_type=other for the detected animal rig.", { details: { rig_type: precheck.rig_type }, safeToRetryPaidOperation: true, stage: "rigging_precheck" });
      }
      if (precheck.rig_type === "others" || publicPrecheck.submission_model_version === null) {
        throw new TripoError("REMOTE_API_ERROR", "Studio's rig precheck did not identify a supported rig type.", {
          details: { riggable: precheck.riggable, rig_type: precheck.rig_type },
          safeToRetryPaidOperation: true,
          stage: "rigging_precheck"
        });
      }
      const warnings = [...pf.warnings];
      if (precheck.rig_type === "biped" && publicPrecheck.submission_model_version !== requestedModelVersion) {
        warnings.push(`Studio forces biped Auto Rig submissions to ${RIGGING_MODEL_VERSION_V1}.`);
      }
      return {
        capabilities: pf.capabilities,
        metadata: { rigging_precheck: publicPrecheck },
        payload: { model_version: publicPrecheck.submission_model_version, project_id: input.project_id, rig_type: requestedModelVersion === RIGGING_MODEL_VERSION_V3 && input.rigging_type === "humanoid" ? "biped" : precheck.rig_type, ...requestedModelVersion === RIGGING_MODEL_VERSION_V3 && input.rigging_type === "humanoid" ? { spec: input.skeleton_preset ?? "actorcore" } : {} },
        snapshots: [],
        warnings
      };
    },
    submitRemote: postprocessSubmit("rigging"),
    syncRemote: postprocessSync()
  },
  "model.animate": {
    category: "postprocess",
    consumesCredits: true,
    description: "Retarget a Studio animation preset onto an already-rigged project. animation must be an exact preset id (preset:<rig_type>:<name>) \u2014 see tripo_list_animation_presets or tripo_get_model include animation_presets. rig_type must match the project's rig.",
    inputShape: {
      animation: z9.string().describe("Exact Studio preset id, e.g. preset:biped:walk."),
      project_id: projectId,
      rig_type: z9.string().describe("The project's rig type."),
      submit: z9.boolean().optional()
    },
    internalKind: "animation_retarget",
    title: "Retarget animation preset",
    async build(ctx, input) {
      if (!isRetargetRigType(input.rig_type)) {
        throw new TripoError("INVALID_INPUT", "rig_type is not supported by Studio animation retargeting.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
      }
      if (!isAnimationPreset(input.animation) || animationPresetRigType(input.animation) !== input.rig_type) {
        throw new TripoError(
          "INVALID_INPUT",
          'animation must be an exact current Studio preset identifier for the selected rig_type. Use tripo_list_animation_presets or tripo_get_model include ["animation_presets"].',
          { safeToRetryPaidOperation: true, stage: "operation_stage" }
        );
      }
      const pf = await preflight(ctx, "animation_retarget", input.project_id, { rigType: input.rig_type });
      return {
        capabilities: pf.capabilities,
        metadata: { preset_catalog_verified: true },
        payload: { animations: [input.animation], model_version: STUDIO_DEFAULT_MODEL_VERSION, project_id: input.project_id, rig_type: input.rig_type },
        snapshots: [],
        warnings: pf.warnings
      };
    },
    submitRemote: postprocessSubmit("animation_retarget"),
    syncRemote: postprocessSync()
  }
};

// src/studio/downloader.mjs
import { createWriteStream } from "node:fs";
import { mkdir as mkdir2, stat as stat4 } from "node:fs/promises";
import path5 from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
var MAX_DOWNLOAD_BYTES = 4 * 1024 * 1024 * 1024;
async function downloadArtifact(config, urlValue, requestedPath, defaultName, fetchImpl = fetch) {
  const url = assertDownloadUrl(urlValue);
  const target = await resolveOutputPath(config, requestedPath, defaultName);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1e3);
  try {
    const response = await fetchImpl(url, { redirect: "follow", signal: controller.signal });
    if (!response.ok || !response.body) {
      throw new TripoError("DOWNLOAD_FAILED", `The remote artifact returned HTTP ${response.status}.`, {
        details: { http_status: response.status },
        retryable: true,
        stage: "download"
      });
    }
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_DOWNLOAD_BYTES) {
      await response.body.cancel().catch(() => {
      });
      throw new TripoError("DOWNLOAD_FAILED", "The remote artifact exceeds the 4 GiB download limit.", { stage: "download" });
    }
    await mkdir2(path5.dirname(target), { recursive: true });
    let bytes = 0;
    const counting = new Transform({
      transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > MAX_DOWNLOAD_BYTES) {
          callback(new TripoError("DOWNLOAD_FAILED", "The remote artifact exceeds the 4 GiB download limit.", { stage: "download" }));
          return;
        }
        callback(null, chunk);
      }
    });
    await pipeline(Readable.fromWeb(response.body), counting, createWriteStream(target));
    const written = await stat4(target);
    return {
      bytes: written.size,
      host: url.hostname,
      path: target
    };
  } catch (error) {
    if (error instanceof TripoError) throw error;
    throw new TripoError("DOWNLOAD_FAILED", "The remote artifact download failed.", { cause: error, retryable: true, stage: "download" });
  } finally {
    clearTimeout(timeout);
  }
}

// src/studio/export-resolution.mjs
import path6 from "node:path";
import { createHash as createHash4, randomUUID } from "node:crypto";
import { readFile as readFile4, writeFile, mkdir as mkdir3, unlink } from "node:fs/promises";
import sharp from "sharp";

// node_modules/fflate/esm/index.mjs
import { createRequire } from "module";
var require2 = createRequire("/");
var _a;
var Worker2;
var isMarkedAsUntransferable;
try {
  _a = require2("worker_threads"), Worker2 = _a.Worker, isMarkedAsUntransferable = _a.isMarkedAsUntransferable;
} catch (e) {
}
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i = 0; i < 31; ++i) {
    b[i] = start += 1 << eb[i - 1];
  }
  var r = new i32(b[30]);
  for (var i = 1; i < 30; ++i) {
    for (var j = b[i]; j < b[i + 1]; ++j) {
      r[j] = j - b[i] << 5 | i;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var x;
var i;
var hMap = (function(cd, mb, r) {
  var s = cd.length;
  var i = 0;
  var l = new u16(mb);
  for (; i < s; ++i) {
    if (cd[i])
      ++l[cd[i] - 1];
  }
  var le = new u16(mb);
  for (i = 1; i < mb; ++i) {
    le[i] = le[i - 1] + l[i - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        var sv = i << 4 | cd[i];
        var r_1 = mb - cd[i];
        var v = le[cd[i] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
      }
    }
  }
  return co;
});
var flt = new u8(288);
for (i = 0; i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144; i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256; i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280; i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i)
  fdt[i] = 5;
var i;
var flm = /* @__PURE__ */ hMap(flt, 9, 0);
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdm = /* @__PURE__ */ hMap(fdt, 5, 0);
var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i = 1; i < a.length; ++i) {
    if (a[i] > m)
      m = a[i];
  }
  return m;
};
var bits = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  // determined by compression function
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var inflt = function(dat, st, buf, dict) {
  var sl = dat.length, dl = dict ? dict.length : 0;
  if (!sl || st.f && !st.l)
    return buf || new u8(0);
  var noBuf = !buf;
  var resize = noBuf || st.i != 2;
  var noSt = st.i;
  if (noBuf)
    buf = new u8(sl * 3);
  var cbuf = function(l2) {
    var bl = buf.length;
    if (l2 > bl) {
      var nbuf = new u8(Math.max(bl * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + l);
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1)
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl);
        var clt = new u8(19);
        for (var i = 0; i < hcLen; ++i) {
          clt[clim[i]] = bits(dat, pos + i * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i = 0; i < tl; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >> 4;
          if (s < 16) {
            ldt[i++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16)
              n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
            else if (s == 17)
              n = 3 + bits(dat, pos, 7), pos += 3;
            else if (s == 18)
              n = 11 + bits(dat, pos, 127), pos += 7;
            while (n--)
              ldt[i++] = c;
          }
        }
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
      } else
        err(1);
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
    }
    if (resize)
      cbuf(bt + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
      if (!c)
        err(2);
      if (sym < 256)
        buf[bt++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add = sym - 254;
        if (sym > 264) {
          var i = sym - 257, b = fleb[i];
          add = bits(dat, pos, (1 << b) - 1) + fl[i];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
        if (!d)
          err(3);
        pos += d & 15;
        var dt = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + 131072);
        var end = bt + add;
        if (bt < dt) {
          var shift = dl - dt, dend = Math.min(dt, end);
          if (shift + bt < 0)
            err(3);
          for (; bt < dend; ++bt)
            buf[bt] = dict[shift + bt];
        }
        for (; bt < end; ++bt)
          buf[bt] = buf[bt - dt];
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm)
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
  } while (!final);
  return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
var wbits = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
};
var wbits16 = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
  d[o + 2] |= v >> 16;
};
var hTree = function(d, mb) {
  var t = [];
  for (var i = 0; i < d.length; ++i) {
    if (d[i])
      t.push({ s: i, f: d[i] });
  }
  var s = t.length;
  var t2 = t.slice();
  if (!s)
    return { t: et, l: 0 };
  if (s == 1) {
    var v = new u8(t[0].s + 1);
    v[t[0].s] = 1;
    return { t: v, l: 1 };
  }
  t.sort(function(a, b) {
    return a.f - b.f;
  });
  t.push({ s: -1, f: 25001 });
  var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
  t[0] = { s: -1, f: l.f + r.f, l, r };
  while (i1 != s - 1) {
    l = t[t[i0].f < t[i2].f ? i0++ : i2++];
    r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
    t[i1++] = { s: -1, f: l.f + r.f, l, r };
  }
  var maxSym = t2[0].s;
  for (var i = 1; i < s; ++i) {
    if (t2[i].s > maxSym)
      maxSym = t2[i].s;
  }
  var tr = new u16(maxSym + 1);
  var mbt = ln(t[i1 - 1], tr, 0);
  if (mbt > mb) {
    var i = 0, dt = 0;
    var lft = mbt - mb, cst = 1 << lft;
    t2.sort(function(a, b) {
      return tr[b.s] - tr[a.s] || a.f - b.f;
    });
    for (; i < s; ++i) {
      var i2_1 = t2[i].s;
      if (tr[i2_1] > mb) {
        dt += cst - (1 << mbt - tr[i2_1]);
        tr[i2_1] = mb;
      } else
        break;
    }
    dt >>= lft;
    while (dt > 0) {
      var i2_2 = t2[i].s;
      if (tr[i2_2] < mb)
        dt -= 1 << mb - tr[i2_2]++ - 1;
      else
        ++i;
    }
    for (; i >= 0 && dt; --i) {
      var i2_3 = t2[i].s;
      if (tr[i2_3] == mb) {
        --tr[i2_3];
        ++dt;
      }
    }
    mbt = mb;
  }
  return { t: new u8(tr), l: mbt };
};
var ln = function(n, l, d) {
  return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
};
var lc = function(c) {
  var s = c.length;
  while (s && !c[--s])
    ;
  var cl = new u16(++s);
  var cli = 0, cln = c[0], cls = 1;
  var w = function(v) {
    cl[cli++] = v;
  };
  for (var i = 1; i <= s; ++i) {
    if (c[i] == cln && i != s)
      ++cls;
    else {
      if (!cln && cls > 2) {
        for (; cls > 138; cls -= 138)
          w(32754);
        if (cls > 2) {
          w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
          cls = 0;
        }
      } else if (cls > 3) {
        w(cln), --cls;
        for (; cls > 6; cls -= 6)
          w(8304);
        if (cls > 2)
          w(cls - 3 << 5 | 8208), cls = 0;
      }
      while (cls--)
        w(cln);
      cls = 1;
      cln = c[i];
    }
  }
  return { c: cl.subarray(0, cli), n: s };
};
var clen = function(cf, cl) {
  var l = 0;
  for (var i = 0; i < cl.length; ++i)
    l += cf[i] * cl[i];
  return l;
};
var wfblk = function(out, pos, dat) {
  var s = dat.length;
  var o = shft(pos + 2);
  out[o] = s & 255;
  out[o + 1] = s >> 8;
  out[o + 2] = out[o] ^ 255;
  out[o + 3] = out[o + 1] ^ 255;
  for (var i = 0; i < s; ++i)
    out[o + i + 4] = dat[i];
  return (o + 4 + s) * 8;
};
var wblk = function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
  wbits(out, p++, final);
  ++lf[256];
  var _a2 = hTree(lf, 15), dlt = _a2.t, mlb = _a2.l;
  var _b2 = hTree(df, 15), ddt = _b2.t, mdb = _b2.l;
  var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
  var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
  var lcfreq = new u16(19);
  for (var i = 0; i < lclt.length; ++i)
    ++lcfreq[lclt[i] & 31];
  for (var i = 0; i < lcdt.length; ++i)
    ++lcfreq[lcdt[i] & 31];
  var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
  var nlcc = 19;
  for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
    ;
  var flen = bl + 5 << 3;
  var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
  var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
  if (bs >= 0 && flen <= ftlen && flen <= dtlen)
    return wfblk(out, p, dat.subarray(bs, bs + bl));
  var lm, ll, dm, dl;
  wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
  if (dtlen < ftlen) {
    lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
    var llm = hMap(lct, mlcb, 0);
    wbits(out, p, nlc - 257);
    wbits(out, p + 5, ndc - 1);
    wbits(out, p + 10, nlcc - 4);
    p += 14;
    for (var i = 0; i < nlcc; ++i)
      wbits(out, p + 3 * i, lct[clim[i]]);
    p += 3 * nlcc;
    var lcts = [lclt, lcdt];
    for (var it = 0; it < 2; ++it) {
      var clct = lcts[it];
      for (var i = 0; i < clct.length; ++i) {
        var len = clct[i] & 31;
        wbits(out, p, llm[len]), p += lct[len];
        if (len > 15)
          wbits(out, p, clct[i] >> 5 & 127), p += clct[i] >> 12;
      }
    }
  } else {
    lm = flm, ll = flt, dm = fdm, dl = fdt;
  }
  for (var i = 0; i < li; ++i) {
    var sym = syms[i];
    if (sym > 255) {
      var len = sym >> 18 & 31;
      wbits16(out, p, lm[len + 257]), p += ll[len + 257];
      if (len > 7)
        wbits(out, p, sym >> 23 & 31), p += fleb[len];
      var dst = sym & 31;
      wbits16(out, p, dm[dst]), p += dl[dst];
      if (dst > 3)
        wbits16(out, p, sym >> 5 & 8191), p += fdeb[dst];
    } else {
      wbits16(out, p, lm[sym]), p += ll[sym];
    }
  }
  wbits16(out, p, lm[256]);
  return p + ll[256];
};
var deo = /* @__PURE__ */ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
var et = /* @__PURE__ */ new u8(0);
var dflt = function(dat, lvl, plvl, pre, post, st) {
  var s = st.z || dat.length;
  var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7e3)) + post);
  var w = o.subarray(pre, o.length - post);
  var lst = st.l;
  var pos = (st.r || 0) & 7;
  if (lvl) {
    if (pos)
      w[0] = st.r >> 3;
    var opt = deo[lvl - 1];
    var n = opt >> 13, c = opt & 8191;
    var msk_1 = (1 << plvl) - 1;
    var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
    var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
    var hsh = function(i2) {
      return (dat[i2] ^ dat[i2 + 1] << bs1_1 ^ dat[i2 + 2] << bs2_1) & msk_1;
    };
    var syms = new i32(25e3);
    var lf = new u16(288), df = new u16(32);
    var lc_1 = 0, eb = 0, i = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
    for (; i + 2 < s; ++i) {
      var hv = hsh(i);
      var imod = i & 32767, pimod = head[hv];
      prev[imod] = pimod;
      head[hv] = imod;
      if (wi <= i) {
        var rem = s - i;
        if ((lc_1 > 7e3 || li > 24576) && (rem > 423 || !lst)) {
          pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
          li = lc_1 = eb = 0, bs = i;
          for (var j = 0; j < 286; ++j)
            lf[j] = 0;
          for (var j = 0; j < 30; ++j)
            df[j] = 0;
        }
        var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
        if (rem > 2 && hv == hsh(i - dif)) {
          var maxn = Math.min(n, rem) - 1;
          var maxd = Math.min(32767, i);
          var ml = Math.min(258, rem);
          while (dif <= maxd && --ch_1 && imod != pimod) {
            if (dat[i + l] == dat[i + l - dif]) {
              var nl = 0;
              for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl)
                ;
              if (nl > l) {
                l = nl, d = dif;
                if (nl > maxn)
                  break;
                var mmd = Math.min(dif, nl - 2);
                var md = 0;
                for (var j = 0; j < mmd; ++j) {
                  var ti = i - dif + j & 32767;
                  var pti = prev[ti];
                  var cd = ti - pti & 32767;
                  if (cd > md)
                    md = cd, pimod = ti;
                }
              }
            }
            imod = pimod, pimod = prev[imod];
            dif += imod - pimod & 32767;
          }
        }
        if (d) {
          syms[li++] = 268435456 | revfl[l] << 18 | revfd[d];
          var lin = revfl[l] & 31, din = revfd[d] & 31;
          eb += fleb[lin] + fdeb[din];
          ++lf[257 + lin];
          ++df[din];
          wi = i + l;
          ++lc_1;
        } else {
          syms[li++] = dat[i];
          ++lf[dat[i]];
        }
      }
    }
    for (i = Math.max(i, wi); i < s; ++i) {
      syms[li++] = dat[i];
      ++lf[dat[i]];
    }
    pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
    if (!lst) {
      st.r = pos & 7 | w[pos / 8 | 0] << 3;
      pos -= 7;
      st.h = head, st.p = prev, st.i = i, st.w = wi;
    }
  } else {
    for (var i = st.w || 0; i < s + lst; i += 65535) {
      var e = i + 65535;
      if (e >= s) {
        w[pos / 8 | 0] = lst;
        e = s;
      }
      pos = wfblk(w, pos + 1, dat.subarray(i, e));
    }
    st.i = s;
  }
  return slc(o, 0, pre + shft(pos) + post);
};
var crct = /* @__PURE__ */ (function() {
  var t = new Int32Array(256);
  for (var i = 0; i < 256; ++i) {
    var c = i, k = 9;
    while (--k)
      c = (c & 1 && -306674912) ^ c >>> 1;
    t[i] = c;
  }
  return t;
})();
var crc = function() {
  var c = -1;
  return {
    p: function(d) {
      var cr = c;
      for (var i = 0; i < d.length; ++i)
        cr = crct[cr & 255 ^ d[i]] ^ cr >>> 8;
      c = cr;
    },
    d: function() {
      return ~c;
    }
  };
};
var dopt = function(dat, opt, pre, post, st) {
  if (!st) {
    st = { l: 1 };
    if (opt.dictionary) {
      var dict = opt.dictionary.subarray(-32768);
      var newDat = new u8(dict.length + dat.length);
      newDat.set(dict);
      newDat.set(dat, dict.length);
      dat = newDat;
      st.w = dict.length;
    }
  }
  return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20 : 12 + opt.mem, pre, post, st);
};
var mrg = function(a, b) {
  var o = {};
  for (var k in a)
    o[k] = a[k];
  for (var k in b)
    o[k] = b[k];
  return o;
};
var b2 = function(d, b) {
  return d[b] | d[b + 1] << 8;
};
var b4 = function(d, b) {
  return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
};
var b8 = function(d, b) {
  return b4(d, b) + b4(d, b + 4) * 4294967296;
};
var wbytes = function(d, b, v) {
  for (; v; ++b)
    d[b] = v, v >>>= 8;
};
function deflateSync(data, opts) {
  return dopt(data, opts || {}, 0, 0);
}
function inflateSync(data, opts) {
  return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
var fltn = function(d, p, t, o) {
  for (var k in d) {
    var val = d[k], n = p + k, op = o;
    if (Array.isArray(val))
      op = mrg(o, val[1]), val = val[0];
    if (ArrayBuffer.isView(val))
      t[n] = [val, op];
    else {
      t[n += "/"] = [new u8(0), op];
      fltn(val, n, t, o);
    }
  }
};
var te = typeof TextEncoder != "undefined" && /* @__PURE__ */ new TextEncoder();
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}
var dutf8 = function(d) {
  for (var r = "", i = 0; ; ) {
    var c = d[i++];
    var eb = (c > 127) + (c > 223) + (c > 239);
    if (i + eb > d.length)
      return { s: r, r: slc(d, i - 1) };
    if (!eb)
      r += String.fromCharCode(c);
    else if (eb == 3) {
      c = ((c & 15) << 18 | (d[i++] & 63) << 12 | (d[i++] & 63) << 6 | d[i++] & 63) - 65536, r += String.fromCharCode(55296 | c >> 10, 56320 | c & 1023);
    } else if (eb & 1)
      r += String.fromCharCode((c & 31) << 6 | d[i++] & 63);
    else
      r += String.fromCharCode((c & 15) << 12 | (d[i++] & 63) << 6 | d[i++] & 63);
  }
};
function strToU8(str, latin1) {
  if (latin1) {
    var ar_1 = new u8(str.length);
    for (var i = 0; i < str.length; ++i)
      ar_1[i] = str.charCodeAt(i);
    return ar_1;
  }
  if (te)
    return te.encode(str);
  var l = str.length;
  var ar = new u8(str.length + (str.length >> 1));
  var ai = 0;
  var w = function(v) {
    ar[ai++] = v;
  };
  for (var i = 0; i < l; ++i) {
    if (ai + 5 > ar.length) {
      var n = new u8(ai + 8 + (l - i << 1));
      n.set(ar);
      ar = n;
    }
    var c = str.charCodeAt(i);
    if (c < 128 || latin1)
      w(c);
    else if (c < 2048)
      w(192 | c >> 6), w(128 | c & 63);
    else if (c > 55295 && c < 57344)
      c = 65536 + (c & 1023 << 10) | str.charCodeAt(++i) & 1023, w(240 | c >> 18), w(128 | c >> 12 & 63), w(128 | c >> 6 & 63), w(128 | c & 63);
    else
      w(224 | c >> 12), w(128 | c >> 6 & 63), w(128 | c & 63);
  }
  return slc(ar, 0, ai);
}
function strFromU8(dat, latin1) {
  if (latin1) {
    var r = "";
    for (var i = 0; i < dat.length; i += 16384)
      r += String.fromCharCode.apply(null, dat.subarray(i, i + 16384));
    return r;
  } else if (td) {
    return td.decode(dat);
  } else {
    var _a2 = dutf8(dat), s = _a2.s, r = _a2.r;
    if (r.length)
      err(8);
    return s;
  }
}
var slzh = function(d, b) {
  return b + 30 + b2(d, b + 26) + b2(d, b + 28);
};
var zh = function(d, b, z21) {
  var fnl = b2(d, b + 28), efl = b2(d, b + 30), fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048)), es = b + 46 + fnl;
  var _a2 = z64hs(d, es, efl, z21, b4(d, b + 20), b4(d, b + 24), b4(d, b + 42)), sc = _a2[0], su = _a2[1], off = _a2[2];
  return [b2(d, b + 10), sc, su, fn, es + efl + b2(d, b + 32), off];
};
var z64hs = function(d, b, l, z21, sc, su, off) {
  var nsc = sc == 4294967295, nsu = su == 4294967295, noff = off == 4294967295, e = b + l;
  var nf = nsc + nsu + noff;
  if (z21 && nf) {
    for (; b + 4 < e; b += 4 + b2(d, b + 2)) {
      if (b2(d, b) == 1) {
        return [
          nsc ? b8(d, b + 4 + 8 * nsu) : sc,
          nsu ? b8(d, b + 4) : su,
          noff ? b8(d, b + 4 + 8 * (nsu + nsc)) : off,
          1
        ];
      }
    }
    if (z21 < 2)
      err(13);
  }
  return [sc, su, off, 0];
};
var exfl = function(ex) {
  var le = 0;
  if (ex) {
    for (var k in ex) {
      var l = ex[k].length;
      if (l > 65535)
        err(9);
      le += l + 4;
    }
  }
  return le;
};
var wzh = function(d, b, f, fn, u, c, ce, co) {
  var fl2 = fn.length, ex = f.extra, col = co && co.length;
  var exl = exfl(ex);
  wbytes(d, b, ce != null ? 33639248 : 67324752), b += 4;
  if (ce != null)
    d[b++] = 20, d[b++] = f.os;
  d[b] = 20, b += 2;
  d[b++] = f.flag << 1 | (c < 0 && 8), d[b++] = u && 8;
  d[b++] = f.compression & 255, d[b++] = f.compression >> 8;
  var dt = new Date(f.mtime == null ? Date.now() : f.mtime), y = dt.getFullYear() - 1980;
  if (y < 0 || y > 119)
    err(10);
  wbytes(d, b, y << 25 | dt.getMonth() + 1 << 21 | dt.getDate() << 16 | dt.getHours() << 11 | dt.getMinutes() << 5 | dt.getSeconds() >> 1), b += 4;
  if (c != -1) {
    wbytes(d, b, f.crc);
    wbytes(d, b + 4, c < 0 ? -c - 2 : c);
    wbytes(d, b + 8, f.size);
  }
  wbytes(d, b + 12, fl2);
  wbytes(d, b + 14, exl), b += 16;
  if (ce != null) {
    wbytes(d, b, col);
    wbytes(d, b + 6, f.attrs);
    wbytes(d, b + 10, ce), b += 14;
  }
  d.set(fn, b);
  b += fl2;
  if (exl) {
    for (var k in ex) {
      var exf = ex[k], l = exf.length;
      wbytes(d, b, +k);
      wbytes(d, b + 2, l);
      d.set(exf, b + 4), b += 4 + l;
    }
  }
  if (col)
    d.set(co, b), b += col;
  return b;
};
var wzf = function(o, b, c, d, e) {
  wbytes(o, b, 101010256);
  wbytes(o, b + 8, c);
  wbytes(o, b + 10, c);
  wbytes(o, b + 12, d);
  wbytes(o, b + 16, e);
};
function zipSync(data, opts) {
  if (!opts)
    opts = {};
  var r = {};
  var files = [];
  fltn(data, "", r, opts);
  var o = 0;
  var tot = 0;
  for (var fn in r) {
    var _a2 = r[fn], file = _a2[0], p = _a2[1];
    var compression = p.level == 0 ? 0 : 8;
    var f = strToU8(fn), s = f.length;
    var com = p.comment, m = com && strToU8(com), ms = m && m.length;
    var exl = exfl(p.extra);
    if (s > 65535)
      err(11);
    var d = compression ? deflateSync(file, p) : file, l = d.length;
    var c = crc();
    c.p(file);
    files.push(mrg(p, {
      size: file.length,
      crc: c.d(),
      c: d,
      f,
      m,
      u: s != fn.length || m && com.length != ms,
      o,
      compression
    }));
    o += 30 + s + exl + l;
    tot += 76 + 2 * (s + exl) + (ms || 0) + l;
  }
  var out = new u8(tot + 22), oe = o, cdl = tot - o;
  for (var i = 0; i < files.length; ++i) {
    var f = files[i];
    wzh(out, f.o, f, f.f, f.u, f.c.length);
    var badd = 30 + f.f.length + exfl(f.extra);
    out.set(f.c, f.o + badd);
    wzh(out, o, f, f.f, f.u, f.c.length, f.o, f.m), o += 16 + badd + (f.m ? f.m.length : 0);
  }
  wzf(out, o, files.length, cdl, oe);
  return out;
}
function unzipSync(data, opts) {
  var files = {};
  var e = data.length - 22;
  for (; b4(data, e) != 101010256; --e) {
    if (!e || data.length - e > 65558)
      err(13);
  }
  ;
  var c = b2(data, e + 8);
  if (!c)
    return {};
  var o = b4(data, e + 16);
  var z21 = b4(data, e - 20) == 117853008;
  if (z21) {
    var ze = b4(data, e - 12);
    z21 = b4(data, ze) == 101075792;
    if (z21) {
      c = b4(data, ze + 32);
      o = b4(data, ze + 48);
    }
  }
  var fltr = opts && opts.filter;
  for (var i = 0; i < c; ++i) {
    var _a2 = zh(data, o, z21), c_2 = _a2[0], sc = _a2[1], su = _a2[2], fn = _a2[3], no = _a2[4], off = _a2[5], b = slzh(data, off);
    o = no;
    if (!fltr || fltr({
      name: fn,
      size: sc,
      originalSize: su,
      compression: c_2
    })) {
      if (!c_2)
        files[fn] = slc(data, b, b + sc);
      else if (c_2 == 8)
        files[fn] = inflateSync(data.subarray(b, b + sc), { out: new u8(su) });
      else
        err(14, "unknown compression type " + c_2);
    }
  }
  return files;
}

// src/studio/export-resolution.mjs
var MAX_BYTES = 512 * 1024 * 1024;
var imageName = /\.(png|jpe?g|webp)$/i;
var hash = (bytes) => createHash4("sha256").update(bytes).digest("hex");
function reject(message) {
  throw new TripoError("EXPORT_RESOLUTION_UNVERIFIED", message, { stage: "export_resolution" });
}
var aligned = (bytes) => {
  const out = Buffer.alloc(Math.ceil(bytes.length / 4) * 4);
  bytes.copy(out);
  return out;
};
function parseGlb(bytes) {
  if (bytes.length < 28 || bytes.toString("ascii", 0, 4) !== "glTF" || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) reject("Invalid GLB export.");
  const size = bytes.readUInt32LE(12), end = 20 + size;
  if (size % 4 || end + 8 > bytes.length || bytes.readUInt32LE(16) !== 1313821514 || bytes.readUInt32LE(end + 4) !== 5130562 || end + 8 + bytes.readUInt32LE(end) !== bytes.length) reject("Unsupported GLB chunk layout.");
  const doc = JSON.parse(bytes.subarray(20, end).toString("utf8").trim());
  const bin = bytes.subarray(end + 8);
  if (!doc.buffers?.length || doc.buffers[0].uri || doc.buffers[0].byteLength > bin.length || doc.buffers.slice(1).some((b) => b.uri || b.extensions?.EXT_meshopt_compression?.fallback !== true)) reject("GLB must use an embedded primary buffer and optional meshopt fallback buffers.");
  return { doc, bin };
}
function imageBytes(doc, bin, image) {
  if (image.uri) {
    const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(image.uri);
    if (!match) reject("External or unsupported GLB image URI; export a self-contained model.");
    return Buffer.from(match[1], "base64");
  }
  const view = doc.bufferViews?.[image.bufferView], start = view?.byteOffset ?? 0;
  if (!view || view.buffer !== 0 || !Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(view.byteLength) || view.byteLength <= 0 || start + view.byteLength > bin.length) reject("GLB image buffer view is invalid.");
  return bin.subarray(start, start + view.byteLength);
}
async function inspectGlbTextures(bytes) {
  const { doc, bin } = parseGlb(bytes);
  return Promise.all((doc.images ?? []).map(async (image, i) => {
    const m = await sharp(imageBytes(doc, bin, image)).metadata();
    return { name: image.name ?? `image-${i}`, width: m.width, height: m.height };
  }));
}
async function resizeImage(bytes, size, name) {
  const m = await sharp(bytes).metadata();
  if (!m.width || !m.height || m.pages > 1 || !["png", "jpeg", "webp"].includes(m.format)) reject(`Unsupported texture encoding: ${name}.`);
  const changed = Math.max(m.width, m.height) > size;
  let output = bytes;
  if (changed) {
    let pipe = sharp(bytes).resize({ width: size, height: size, fit: "inside", withoutEnlargement: true });
    pipe = m.format === "jpeg" ? pipe.jpeg({ quality: 95, chromaSubsampling: "4:4:4" }) : m.format === "png" ? pipe.png() : pipe.webp({ lossless: true });
    output = await pipe.toBuffer();
  }
  const actual = await sharp(output).metadata();
  if (Math.max(actual.width, actual.height) > size) reject(`Texture still exceeds requested resolution: ${name}.`);
  return { bytes: output, changed, texture: { name, source_width: m.width, source_height: m.height, width: actual.width, height: actual.height } };
}
async function resizeGlb(bytes, size, prefix) {
  const { doc, bin } = parseGlb(bytes);
  const parts = [aligned(bin)], textures = [];
  let offset = parts[0].length, changed = false;
  for (const [i, image] of (doc.images ?? []).entries()) {
    const result = await resizeImage(imageBytes(doc, bin, image), size, `${prefix}#${image.name ?? i}`);
    textures.push(result.texture);
    if (!result.changed) continue;
    changed = true;
    if (image.uri) image.uri = `${image.uri.slice(0, image.uri.indexOf(",") + 1)}${result.bytes.toString("base64")}`;
    else {
      doc.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: result.bytes.length });
      image.bufferView = doc.bufferViews.length - 1;
      const padded2 = aligned(result.bytes);
      parts.push(padded2);
      offset += padded2.length;
    }
  }
  if (!changed) return { bytes, changed, textures };
  const binary = Buffer.concat(parts);
  doc.buffers[0].byteLength = binary.length;
  const json = Buffer.from(JSON.stringify(doc)), padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
  json.copy(padded);
  const out = Buffer.alloc(28 + padded.length + binary.length);
  out.write("glTF");
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(padded.length, 12);
  out.writeUInt32LE(1313821514, 16);
  padded.copy(out, 20);
  const b = 20 + padded.length;
  out.writeUInt32LE(binary.length, b);
  out.writeUInt32LE(5130562, b + 4);
  binary.copy(out, b + 8);
  return { bytes: out, changed, textures };
}
function boundedZip(bytes) {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (bytes.readUInt32LE(i) === 101010256 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) {
    end = i;
    break;
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) reject("Invalid or multi-volume export ZIP.");
  const count = bytes.readUInt16LE(end + 10), centralSize = bytes.readUInt32LE(end + 12);
  let offset = bytes.readUInt32LE(end + 16), total = 0;
  if (count > 1024 || offset + centralSize !== end) reject("Export archive exceeds supported bounds.");
  const names = /* @__PURE__ */ new Set();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 33639248 || bytes.readUInt16LE(offset + 8) & 1) reject("Invalid or encrypted export ZIP entry.");
    total += bytes.readUInt32LE(offset + 24);
    const length = bytes.readUInt16LE(offset + 28), name = bytes.subarray(offset + 46, offset + 46 + length).toString("utf8");
    if (total > MAX_BYTES || !name || name.includes("\\") || name.includes("\0") || name.startsWith("/") || name.split("/").includes("..") || names.has(name)) reject("Unsafe or oversized export ZIP.");
    names.add(name);
    offset += 46 + length + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  if (offset !== end) reject("Invalid ZIP central directory.");
  return unzipSync(bytes);
}
async function normalizeExport(bytes, { textureSize, format: format2, expectTextures = false }) {
  if (bytes.length > MAX_BYTES) reject("Export resolution processing currently supports files up to 512 MiB.");
  let result;
  if (bytes.toString("ascii", 0, 4) === "glTF") result = await resizeGlb(bytes, textureSize, "model.glb");
  else if (bytes.length >= 4 && bytes.readUInt32LE(0) === 67324752) {
    const files = boundedZip(bytes), textures = [];
    let changed = false;
    for (const [name, data] of Object.entries(files)) {
      let item;
      if (imageName.test(name)) {
        item = await resizeImage(Buffer.from(data), textureSize, name);
        textures.push(item.texture);
      } else if (/\.glb$/i.test(name)) {
        item = await resizeGlb(Buffer.from(data), textureSize, name);
        textures.push(...item.textures);
      }
      if (item?.changed) {
        files[name] = item.bytes;
        changed = true;
      }
    }
    if (changed && format2 === "usdz") reject("USDZ texture resizing needs an aligned USDZ writer; use GLB or ZIP FBX/OBJ for verified resolution.");
    result = { bytes: changed ? Buffer.from(zipSync(files, { level: 6, mtime: new Date(1980, 0, 1) })) : bytes, changed, textures };
  } else result = { bytes, changed: false, textures: [] };
  if (expectTextures && !result.textures.length && format2 !== "stl") reject("Textured export has no inspectable images. Use self-contained GLB or ZIP FBX/OBJ instead of embedded FBX.");
  return { ...result, verification: { requested_texture_size: textureSize, actual_texture_size_verified: result.textures.length > 0, resolution_status: result.textures.length ? "verified" : "not_applicable", resolution_method: result.changed ? "local_downsample" : "remote_verified", textures: result.textures, source_sha256: hash(bytes), output_sha256: hash(result.bytes) } };
}
async function sourceTextureInfo(ctx, detail, operatorId) {
  if (!detail.model_url) return { source_texture_size: detail.operator?.is_ultra_textured ? 8192 : detail.operator?.is_hd_textured ? 4096 : 2048, source_texture_size_verified: false };
  const root = path6.join(ctx.config.dataDir, "export-input-cache");
  const file = await resolveOutputPath({ ...ctx.config, outputRoots: [root] }, path6.join(root, `${hash(Buffer.from(operatorId))}.glb`), "source.glb");
  let bytes;
  try {
    bytes = await readFile4(file);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    await downloadArtifact({ ...ctx.config, outputRoots: [root] }, detail.model_url, file, "source.glb");
    bytes = await readFile4(file);
  }
  const textures = await inspectGlbTextures(bytes);
  return { source_texture_size: textures.length ? Math.max(...textures.map((t) => Math.max(t.width, t.height))) : 2048, source_texture_size_verified: true, source_texture_count: textures.length };
}
async function prepareExportDownload(runtime, record) {
  const { config, gateway } = runtime;
  const root = path6.join(config.assetRoot, "exports", record.task_id);
  const raw = await resolveOutputPath(config, path6.join(root, `download-${randomUUID()}.tmp`), "source.bin");
  await mkdir3(path6.dirname(raw), { recursive: true });
  const url = record.remote?.operator_id ? (await gateway.getExportDownload(record.remote.operator_id, record.payload.name)).model_url : record.result.export_url;
  await downloadArtifact(config, url, raw, "source.bin");
  const bytes = await readFile4(raw);
  const source = await resolveOutputPath(config, path6.join(root, `${hash(bytes)}.source.bin`), "source.bin");
  await writeImmutable(source, bytes);
  await unlink(raw);
  const result = await normalizeExport(bytes, { textureSize: record.payload.texture_size, format: record.result.format, expectTextures: record.metadata.source_texture_count > 0 });
  const zip = result.bytes.length >= 4 && result.bytes.readUInt32LE(0) === 67324752;
  const name = `${record.payload.name}.${zip ? "zip" : record.result.format}`;
  const target = await resolveOutputPath(config, path6.join(root, `${hash(result.bytes)}.${zip ? "zip" : record.result.format}`), name);
  await writeImmutable(target, result.bytes);
  return { localPath: target, defaultName: name, verification: { ...result.verification, source_path: source }, source: { task_id: record.task_id } };
}
async function writeImmutable(target, bytes) {
  try {
    await writeFile(target, bytes, { flag: "wx" });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    if (hash(await readFile4(target)) !== hash(bytes)) reject("Cached export artifact changed; refusing to overwrite it.");
  }
}

// src/ops/studio-extras.mjs
var id = z10.string().regex(/^[^\s\u0000-\u001f\u007f]{1,256}$/);
var fail = (message) => {
  throw new TripoError("INSUFFICIENT_EVIDENCE", message, { stage: "studio_contract" });
};
async function currentProject(ctx, projectId2, expected) {
  const detail = await ctx.gateway.getProject(projectId2);
  if (detail.id && detail.id !== projectId2) fail("Project detail identity mismatch.");
  const operatorId = detail.operator?.operator_id;
  if (!operatorId) fail("Project has no current operator ID.");
  if (expected && operatorId !== expected) fail("Project changed after staging; stage a new task before submitting.");
  return { detail, operatorId };
}
async function uvContext(ctx, projectId2, expected) {
  const { detail, operatorId } = await currentProject(ctx, projectId2, expected);
  const context = await ctx.gateway.getUvContext({ project_id: projectId2, current_operator_id: operatorId });
  if (context.project_id !== projectId2 || context.current_operator_id !== operatorId) fail("UV context identity mismatch.");
  return { context, detail, operatorId };
}
async function uvEligibility(ctx, projectId2, detail) {
  if (detail.operator?.is_segmented) throw new TripoError("INVALID_INPUT", "Smart UV does not support segmented projects.");
  if (!detail.model_url) fail("Smart UV requires a model to inspect.");
  const cache = path7.join(ctx.config.dataDir, "model-cache");
  const saved = await downloadArtifact({ ...ctx.config, outputRoots: [cache] }, detail.model_url, void 0, `uv-${encodeURIComponent(projectId2)}.glb`);
  const model = await inspectModel(saved.path);
  const quad = detail.operator?.is_quad === true;
  const maximumTriangles = 8e4;
  if (model.faceCount > maximumTriangles) throw new TripoError("INVALID_INPUT", "Smart UV allows at most 80K triangles or 40K original quads.");
  return { triangle_count: model.faceCount, original_topology: quad ? "quad" : "triangle", limit_triangles: maximumTriangles };
}
function uvIdentity(receipt, payload) {
  if (receipt.project_id !== payload.project_id || receipt.current_operator_id !== payload.current_operator_id || receipt.action !== payload.action) fail("UV receipt identity mismatch.");
}
var imageTransform = (endpoint, title) => ({
  category: "image",
  consumesCredits: true,
  title,
  description: `Studio ${endpoint}: transform one completed image output selected by output_index.`,
  inputShape: { asset_id: id, output_index: z10.number().int().min(0).max(15).default(0), submit: z10.boolean().optional() },
  async build(ctx, input) {
    const asset = await ctx.gateway.getStudioImageAsset(input.asset_id);
    const output = asset.output.data[input.output_index];
    if (asset.asset_id !== input.asset_id || asset.status !== "success" || !output?.key) fail("Selected image output is not complete.");
    return { payload: { asset_id: input.asset_id, resource_key: output.key }, snapshots: [], metadata: { source_output_index: input.output_index } };
  },
  async submitRemote(ctx, task) {
    return ctx.gateway.submitImageTransform(endpoint, task.payload);
  },
  async syncRemote(ctx, task) {
    const asset = await ctx.gateway.getStudioImageAsset(task.remote.asset_id);
    if (asset.asset_id !== task.remote.asset_id) fail("Image asset identity mismatch.");
    return { status: remoteStatus(asset.status), result: { asset_id: asset.asset_id, outputs: asset.output.data }, progress: { status: asset.status } };
  }
});
var studioExtraOperations = {
  "image.upscale": imageTransform("upscale", "Upscale image to 4K"),
  "image.split": imageTransform("split", "Automatically split image subjects"),
  "motion.generate": {
    category: "animation",
    consumesCredits: true,
    title: "Generate AI motion",
    description: "Text-to-motion or up to five stages, each 1\u201310 seconds. Optional two [x,z] waypoints per stage must connect exactly. Generate first, then model.apply_motion on a biped rig.",
    inputShape: {
      segments: z10.array(z10.object({ prompt: z10.string().trim().min(1).max(1e3), duration_seconds: z10.number().int().min(1).max(10), waypoints: z10.array(z10.array(z10.number().finite()).length(2)).length(2).optional() }).strict()).min(1).max(5),
      submit: z10.boolean().optional()
    },
    async build(ctx, input) {
      for (let index = 1; index < input.segments.length; index++) {
        const previous = input.segments[index - 1].waypoints?.[1];
        const current = input.segments[index].waypoints?.[0];
        if (previous && current && previous.some((n, i) => n !== current[i])) throw new TripoError("INVALID_INPUT", "Adjacent motion waypoints must connect.");
      }
      return { payload: { segments: input.segments }, snapshots: [], metadata: { duration_seconds: input.segments.reduce((sum, item) => sum + item.duration_seconds, 0) } };
    },
    async submitRemote(ctx, task) {
      const receipt = await ctx.gateway.submitMotion(task.payload);
      return { motion_task_id: receipt.task_id };
    },
    async syncRemote(ctx, task) {
      const progress = await ctx.gateway.getMotionTask(task.remote.motion_task_id);
      if (progress.task_id !== task.remote.motion_task_id) fail("Motion task identity mismatch.");
      const status = remoteStatus(progress.status);
      let result;
      if (status === "succeeded") {
        if (!progress.asset_id) fail("Completed motion has no asset ID.");
        const asset = await ctx.gateway.getMotionAsset(progress.asset_id);
        if (asset.asset_id !== progress.asset_id || asset.task_id && asset.task_id !== progress.task_id) fail("Motion asset identity mismatch.");
        result = { motion_asset_id: asset.asset_id, motion_url: asset.motion_url, title: asset.title ?? null, motion: asset.motion ?? null };
      }
      return { status, progress: { status: progress.status }, result };
    }
  },
  "model.apply_motion": {
    category: "animation",
    consumesCredits: true,
    title: "Apply AI motion to model",
    description: "Retarget a generated motion_asset_id to a rigged biped project through Studio retarget_model.",
    inputShape: { project_id: id, motion_asset_id: id, submit: z10.boolean().optional() },
    async build(ctx, input) {
      const pf = await preflight(ctx, "animation_retarget", input.project_id, { rigType: "biped" });
      const asset = await ctx.gateway.getMotionAsset(input.motion_asset_id);
      if (asset.asset_id !== input.motion_asset_id) fail("Motion asset identity mismatch.");
      return { ...pf, payload: { project_id: input.project_id, model_version: "default", rig_type: "biped", motion_asset_id: input.motion_asset_id }, snapshots: [] };
    },
    async submitRemote(ctx, task) {
      const receipt = await ctx.gateway.submitPostprocess("retarget_model", task.payload);
      if (receipt.project_id && receipt.project_id !== task.payload.project_id) fail("Retarget receipt identity mismatch.");
      return { operator_id: receipt.operator_id, project_id: task.payload.project_id };
    },
    syncRemote: postprocessSync()
  },
  "model.export": {
    category: "export",
    consumesCredits: false,
    title: "Export model with settings",
    description: "Export an owned Studio project to GLB, FBX, OBJ, USDZ, STL, or 3MF; supports texture resolution, skeleton, animations, UV packing, FBX preset, in-place animation, and frame baking. Server permissions still apply.",
    inputShape: {
      project_id: id,
      format: z10.enum(["glb", "fbx", "obj", "usdz", "stl", "3mf"]),
      name: z10.string().trim().min(1).max(255).regex(/^[^/\\\u0000-\u001f\u007f]+$/).optional(),
      texture_size: z10.union([z10.literal(512), z10.literal(1024), z10.literal(2048), z10.literal(4096), z10.literal(8192)]).optional().describe("Maximum exported texture edge length, without upscaling. Defaults to the actual source textures. tripo_download verifies sizes and downsamples oversized ZIP/GLB textures locally."),
      texture_packaging: z10.enum(["zip", "embedded"]).default("zip"),
      fbx_preset: z10.enum(["blender", "mixamo", "3dsmax"]).default("blender"),
      with_animation: z10.boolean().default(false),
      animations: z10.array(id).max(256).default([]),
      pack_uv: z10.boolean().default(false),
      animate_in_place: z10.boolean().default(false),
      enable_bake_animation: z10.boolean().default(false),
      bake_animation_frame: z10.number().int().min(0).max(1e6).default(0),
      export_vertex_colors: z10.boolean().default(false),
      export_orientation: z10.enum(["-y"]).default("-y"),
      submit: z10.boolean().optional()
    },
    async build(ctx, input) {
      const { detail, operatorId } = await currentProject(ctx, input.project_id);
      if (detail.is_owner !== true) throw new TripoError("INVALID_INPUT", "This export tool requires an owned project; public paid export is a separate capability.");
      if (!input.with_animation && input.animations.length) throw new TripoError("INVALID_INPUT", "animations requires with_animation=true.");
      if ((input.with_animation || input.enable_bake_animation) && !detail.operator?.is_rigged) throw new TripoError("INVALID_INPUT", "Skeleton and animation export require a rigged model.");
      if (input.export_vertex_colors && input.format !== "obj") throw new TripoError("INVALID_INPUT", "Vertex colors are an OBJ option.");
      const sourceTextures = await sourceTextureInfo(ctx, detail, operatorId);
      const sourceTextureSize = sourceTextures.source_texture_size;
      const textureSize = input.texture_size ?? ([8192, 4096, 2048, 1024, 512].find((size) => size <= sourceTextureSize) ?? 512);
      if (textureSize > Math.max(512, sourceTextureSize)) throw new TripoError("INVALID_INPUT", "Export resolution cannot exceed the project's current texture resolution; upscale its textures first.");
      const { submit, ...params } = input;
      const name = input.name ?? `model-${input.project_id}`;
      return { payload: { ...params, texture_size: textureSize, name, format: input.format === "glb" ? "gltf" : input.format, model_version: "default" }, metadata: { source_operator_id: operatorId, output_format: input.format, requested_texture_size: textureSize, ...sourceTextures }, snapshots: [] };
    },
    async beforeSubmit(ctx, task) {
      await currentProject(ctx, task.payload.project_id, task.metadata.source_operator_id);
    },
    async submitRemote(ctx, task) {
      const receipt = await ctx.gateway.submitExport(task.payload);
      return { ...receipt, project_id: task.payload.project_id };
    },
    async syncRemote(ctx, task) {
      const texture = { requested_texture_size: task.payload.texture_size, actual_texture_size_verified: false };
      if (task.remote.model_url) return { status: "succeeded", result: { project_id: task.remote.project_id, export_url: task.remote.model_url, format: task.metadata.output_format, ...texture }, progress: { status: "success" } };
      const items = await ctx.gateway.getProgress([task.remote.operator_id]);
      const item = selectProgress(items, task.remote.operator_id);
      if (item.project_id && item.project_id !== task.payload.project_id) fail("Export progress project mismatch.");
      const status = remoteStatus(item.status);
      const result = status === "succeeded" ? { project_id: task.payload.project_id, export_url: (await ctx.gateway.getExportDownload(task.remote.operator_id, task.payload.name)).model_url, format: task.metadata.output_format, ...texture } : void 0;
      return { status, result, progress: { status: item.status, progress: item.progress ?? null } };
    }
  },
  "model.uv_generate": {
    category: "postprocess",
    consumesCredits: true,
    title: "Generate Smart UV candidate",
    description: "Generate/retry Smart UV against a frozen current operator, inspect actual GLB polygon count, and return a candidate without replacing the model. Apply with model.uv_apply.",
    inputShape: { project_id: id, action: z10.enum(["generate", "retry"]).optional(), submit: z10.boolean().optional() },
    async build(ctx, input) {
      const { context, detail, operatorId } = await uvContext(ctx, input.project_id);
      if (context.running_task) throw new TripoError("INVALID_INPUT", "A Smart UV task is already running; inspect context instead of submitting again.");
      if (input.action && input.action !== context.next_action) throw new TripoError("INVALID_INPUT", "Requested UV action does not match the current context.");
      const stats = await uvEligibility(ctx, input.project_id, detail);
      return { payload: { project_id: input.project_id, current_operator_id: operatorId, action: context.next_action }, snapshots: [], metadata: { mesh_stats: stats, candidate_count: context.candidates.length }, warnings: ["Generates a candidate; apply it separately after inspection."] };
    },
    async beforeSubmit(ctx, task) {
      const { context } = await uvContext(ctx, task.payload.project_id, task.payload.current_operator_id);
      if (context.running_task || context.next_action !== task.payload.action || context.candidates.length !== task.metadata.candidate_count) fail("UV context changed after staging.");
    },
    async submitRemote(ctx, task) {
      const receipt = await ctx.gateway.submitUv(task.payload);
      uvIdentity(receipt, task.payload);
      return { operator_id: receipt.operator_id, project_id: receipt.project_id };
    },
    async syncRemote(ctx, task) {
      const item = selectProgress(await ctx.gateway.getProgress([task.remote.operator_id]), task.remote.operator_id);
      const status = remoteStatus(item.status);
      let result;
      if (status === "succeeded") {
        const { context } = await uvContext(ctx, task.payload.project_id, task.payload.current_operator_id);
        const candidate = context.candidates.find((entry) => entry.operator_id === task.remote.operator_id);
        if (!candidate) fail("Completed UV operator has no candidate in context yet.");
        result = { project_id: task.payload.project_id, candidate_operator_id: candidate.operator_id, model_url: candidate.model.url, uv_layout_url: candidate.uv_layout.url };
      }
      return { status, progress: { status: item.status, progress: item.progress ?? null }, result };
    }
  },
  "model.uv_apply": {
    category: "postprocess",
    consumesCredits: false,
    title: "Apply Smart UV candidate",
    description: "Apply an inspected UV candidate. Validates candidate membership and current operator both before staging and before applying.",
    inputShape: { project_id: id, candidate_operator_id: id, submit: z10.boolean().optional() },
    async build(ctx, input) {
      const { context, operatorId } = await uvContext(ctx, input.project_id);
      if (context.running_task || !context.candidates.some((entry) => entry.operator_id === input.candidate_operator_id)) fail("Candidate is unavailable or UV is still processing.");
      return { payload: { project_id: input.project_id, candidate_operator_id: input.candidate_operator_id, current_operator_id: operatorId }, snapshots: [] };
    },
    async beforeSubmit(ctx, task) {
      const { context } = await uvContext(ctx, task.payload.project_id, task.payload.current_operator_id);
      if (context.running_task || !context.candidates.some((entry) => entry.operator_id === task.payload.candidate_operator_id)) fail("UV candidate changed after staging.");
    },
    async submitRemote(ctx, task) {
      const receipt = await ctx.gateway.applyUv(task.payload);
      if (receipt.project_id !== task.payload.project_id || receipt.previous_operator_id !== task.payload.current_operator_id || receipt.current_operator_id !== task.payload.candidate_operator_id) fail("UV apply receipt mismatch.");
      return { project_id: receipt.project_id, operator_id: receipt.current_operator_id, applied: true };
    },
    async syncRemote(ctx, task) {
      return { status: "succeeded", result: { project_id: task.remote.project_id, operator_id: task.remote.operator_id, applied: true } };
    }
  }
};

// src/server.mjs
import { readFile as readFile12 } from "node:fs/promises";
import path22 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/mcp/result.mjs
function ok(structured, text) {
  const clean = redactDeep(structured);
  return {
    content: [{ text: text ?? summarize(clean), type: "text" }],
    structuredContent: clean
  };
}
function fail2(error) {
  const normalized = error instanceof TripoError ? error : toTripoError(error);
  const snapshot = errorSnapshot(normalized);
  const extra = normalized.task ? { task: redactDeep(normalized.task) } : {};
  return {
    content: [{ text: `${snapshot.code}: ${snapshot.message}`, type: "text" }],
    isError: true,
    structuredContent: { error: snapshot, ...extra }
  };
}
function summarize(value) {
  if (value?.download?.path) return `\u4E0B\u8F7D\u5B8C\u6210\uFF0C\u6587\u4EF6\u5DF2\u4FDD\u5B58\u5230 ${value.download.path}\u3002${value.download.blender_error ? "Blender \u517C\u5BB9\u5904\u7406\u5931\u8D25\uFF0C\u8BF7\u67E5\u770B\u5361\u7247\u4E2D\u7684\u63D0\u793A\u3002" : ""}`;
  if (value?.quote) {
    const quote = value.quote;
    const amount = quote.status !== "unknown" && Number.isFinite(quote.estimated_credits) ? `${quote.estimated_credits} \u79EF\u5206` : "\u5F85\u786E\u8BA4";
    return `\u9884\u8BA1\u8D39\u7528\uFF1A${amount}\u3002${quote.paid_request_sent === false ? "\u4EC5\u67E5\u8BE2\u62A5\u4EF7\uFF0C\u5C1A\u672A\u63D0\u4EA4\u4EFB\u52A1\u3002" : ""}`;
  }
  if (Array.isArray(value?.operations)) return `\u5DF2\u52A0\u8F7D ${value.operations.length} \u9879\u53EF\u7528\u529F\u80FD\u3002\u67E5\u770B\u529F\u80FD\u5217\u8868\u53CA\u79EF\u5206\u6807\u8BB0\uFF0C\u5177\u4F53\u8D39\u7528\u4EE5\u64CD\u4F5C\u62A5\u4EF7\u4E3A\u51C6\u3002`;
  if (value?.task) {
    const task = value.task;
    return `${task.kind} task ${task.task_id} \u2014 ${task.status}${task.remote ? "" : " (no remote ids yet)"}`;
  }
  if (Array.isArray(value?.tasks)) return `${value.tasks.length} task(s)`;
  return JSON.stringify(value, null, 2).slice(0, 4e3);
}

// src/ops/imagegen.mjs
import { z as z11 } from "zod";
var identifier2 = z11.string().regex(/^[^\s\u0000-\u001f\u007f]{1,256}$/);
var auditEnum = z11.enum(["pass", "sensitive"]);
var imageReferenceSchema = z11.object({
  bucket: z11.string().min(1).max(512),
  image_audit_result: auditEnum,
  image_source: z11.enum(["generate", "upload"]),
  key: z11.string().min(1).max(2048)
}).strict();
var imageWireSchema = z11.object({
  amount: z11.number().int().min(1).max(4),
  if_upload: z11.literal(true),
  image: imageReferenceSchema.optional(),
  images: z11.array(imageReferenceSchema).min(2).max(10).optional(),
  model_version: z11.enum(STUDIO_IMAGE_MODELS),
  prompt: z11.string().max(1e3),
  resolution: z11.enum(STUDIO_IMAGE_RESOLUTIONS),
  scale: z11.enum(STUDIO_IMAGE_RATIOS),
  sketch_to_render: z11.boolean(),
  t_pose: z11.boolean(),
  template_id: z11.string().min(1).max(256).optional()
}).strict();
var multiviewWireSchema = z11.object({ if_upload: z11.literal(true), image: imageReferenceSchema }).strict();
var regenerationWireSchema = z11.object({ asset_id: z11.string().min(1).max(256) }).strict();
var imageInputShape = {
  allow_sensitive: z11.boolean().optional().describe("Permit an output marked 'sensitive' by the Studio audit. Only set after reviewing the image."),
  amount: z11.number().int().min(1).max(4).default(1).describe("Number of images to generate (1-4)."),
  image_paths: z11.array(z11.string()).max(10).optional().describe("Local reference image paths (PNG/JPEG/WebP, up to 10). Not accepted by the Midjourney model."),
  studio_references: z11.array(z11.object({ asset_id: identifier2, output_index: z11.number().int().min(0).max(15).default(0) }).strict()).max(10).optional().describe("Reference existing completed Studio image outputs directly, without downloading/re-uploading. Combined reference limit: 10."),
  model_version: z11.enum(STUDIO_IMAGE_MODELS).default("gpt_image_2").describe("Studio image model."),
  prompt: z11.string().max(1e3).default("").describe("Text prompt; required unless reference images or a template are given."),
  resolution: z11.enum(STUDIO_IMAGE_RESOLUTIONS).default("1K"),
  scale: z11.enum(STUDIO_IMAGE_RATIOS).default("1:1"),
  sketch_to_render: z11.boolean().default(false),
  submit: z11.boolean().optional().describe("When true, stage and dispatch the paid Studio request in this single call."),
  t_pose: z11.boolean().default(false),
  template_id: identifier2.optional().describe("Studio image template id from tripo_list_image_templates.")
};
async function auditStudioOutput(ctx, output, allowSensitive) {
  let audit = output.image_audit_result;
  if (audit !== "pass" && audit !== "sensitive") {
    audit = (await ctx.gateway.auditImage({ bucket: output.bucket, key: output.key })).result;
  }
  if (audit === "sensitive" && !allowSensitive) {
    throw new TripoError("CONTENT_AUDIT_REJECTED", "The selected generated image is sensitive. Call again with allow_sensitive=true only after review.", { stage: "image_generation_audit" });
  }
  if (audit !== "pass" && audit !== "sensitive") {
    throw new TripoError("CONTENT_AUDIT_REJECTED", "The selected generated image did not pass the Studio audit.", { stage: "image_generation_audit" });
  }
  return audit;
}
var imageOperations = {
  "image.generate": {
    category: "image",
    consumesCredits: true,
    description: "Generate or edit 1-4 images in Tripo Studio using text, up to 10 local/Studio references, and/or a template, including GPT Image 2.5. Creates a durable task; dispatch only with submit=true or tripo_submit_task.",
    inputShape: imageInputShape,
    title: "Generate Studio image",
    async build(ctx, input, taskId) {
      const imagePaths = input.image_paths ?? [];
      const studioReferences = input.studio_references ?? [];
      const referenceCount = imagePaths.length + studioReferences.length;
      if (referenceCount > 10) throw new TripoError("INVALID_INPUT", "Combined local and Studio reference limit is 10.", { stage: "image_generation_prepare" });
      const prompt = input.prompt.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
      if (!prompt && referenceCount === 0 && input.template_id === void 0) {
        throw new TripoError("INVALID_INPUT", "Provide a prompt, at least one reference image, or a template_id.", { stage: "image_generation_prepare" });
      }
      if (input.model_version === "midjourney" && referenceCount > 0) {
        throw new TripoError("INVALID_INPUT", "The current Studio Midjourney mode does not accept uploaded reference images.", { stage: "image_generation_prepare" });
      }
      const snapshots = [];
      const references2 = [];
      for (const ref of studioReferences) {
        const asset = await ctx.gateway.getStudioImageAsset(ref.asset_id);
        const output = asset.output.data[ref.output_index];
        if (asset.asset_id !== ref.asset_id || asset.status !== "success" || !output?.bucket || !output.key) {
          throw new TripoError("INSUFFICIENT_EVIDENCE", "The referenced Studio image output is not complete or does not exist.", { stage: "image_generation_prepare" });
        }
        const audit = await auditStudioOutput(ctx, output, input.allow_sensitive ?? false);
        references2.push({ bucket: output.bucket, key: output.key, image_audit_result: audit, image_source: "generate" });
      }
      for (const [index, imagePath2] of imagePaths.entries()) {
        assertLocalPathSpecifier(imagePath2, "image_generation_input_policy");
        const staged = await stageLocalImage(ctx.config, ctx.gateway, ctx.uploader, imagePath2, true, {
          index: index + 1,
          label: `Reference ${index + 1}`,
          slot: `reference_${index + 1}`,
          taskId
        });
        if (staged.audit.result === "sensitive" && !input.allow_sensitive) {
          throw new TripoError("CONTENT_AUDIT_REJECTED", "A reference image is sensitive. Retry with allow_sensitive=true only after review.", {
            safeToRetryPaidOperation: true,
            stage: "image_generation_audit"
          });
        }
        snapshots.push(staged.provenance);
        references2.push({ bucket: staged.uploaded.bucket, image_audit_result: staged.audit.result, image_source: "upload", key: staged.uploaded.key });
      }
      const candidate = {
        amount: input.amount,
        if_upload: true,
        model_version: input.model_version,
        prompt,
        resolution: input.resolution,
        scale: input.scale,
        sketch_to_render: input.sketch_to_render,
        t_pose: input.t_pose,
        ...input.template_id === void 0 ? {} : { template_id: input.template_id },
        ...references2.length === 1 ? { image: references2[0] } : {},
        ...references2.length > 1 ? { images: references2 } : {}
      };
      const payload = imageWireSchema.parse(candidate);
      return { metadata: { reference_count: references2.length, studio_references: studioReferences }, payload, snapshots };
    },
    async submitRemote(ctx, task) {
      const receipt = await ctx.gateway.submitStudioImage(task.payload);
      return { asset_id: receipt.asset_id };
    },
    async syncRemote(ctx, task) {
      const asset = await ctx.gateway.getStudioImageAsset(task.remote.asset_id);
      if (asset.asset_id !== task.remote.asset_id) {
        throw new TripoError("INSUFFICIENT_EVIDENCE", "Studio returned a different image asset.", { stage: "task_progress" });
      }
      const status = remoteAssetStatus(asset.status);
      return {
        progress: { status: asset.status },
        result: status === "succeeded" ? { outputs: asset.output.data.map((o, index) => ({ index, url: o.url })), type: asset.type } : void 0,
        status
      };
    }
  },
  "image.multiview": {
    category: "image",
    consumesCredits: true,
    description: "Generate the four-view (front/left/back/right) multiview set for an existing successful generate_image Studio asset. Use tripo_list_image_assets to find the source asset.",
    inputShape: {
      allow_sensitive: z11.boolean().optional(),
      output_index: z11.number().int().min(0).max(15).default(0).describe("Which output image of the source asset feeds the multiview."),
      source_asset_id: identifier2.describe("A successful type=generate_image Studio image asset id."),
      submit: z11.boolean().optional()
    },
    title: "Generate four-view set",
    async build(ctx, input) {
      const asset = await ctx.gateway.getStudioImageAsset(input.source_asset_id);
      if (asset.asset_id !== input.source_asset_id || asset.status !== "success" || asset.type !== "generate_image") {
        throw new TripoError("INSUFFICIENT_EVIDENCE", "The multiview action requires a successful single-image Studio asset.", { stage: "image_generation_prepare" });
      }
      const output = asset.output.data[input.output_index];
      if (!output) throw new TripoError("PLAN_NOT_FOUND", "The selected generated-image output index does not exist.", { stage: "image_generation_prepare" });
      const audit = await auditStudioOutput(ctx, output, input.allow_sensitive ?? false);
      const payload = multiviewWireSchema.parse({
        if_upload: true,
        image: { bucket: output.bucket, image_audit_result: audit, image_source: "generate", key: output.key }
      });
      return { metadata: { output_index: input.output_index, source_asset_id: input.source_asset_id }, payload, snapshots: [] };
    },
    async submitRemote(ctx, task) {
      const receipt = await ctx.gateway.submitStudioMultiview(task.payload);
      return { asset_id: receipt.asset_id };
    },
    async syncRemote(ctx, task) {
      const asset = await ctx.gateway.getStudioImageAsset(task.remote.asset_id);
      const status = remoteAssetStatus(asset.status);
      return {
        progress: { status: asset.status },
        result: status === "succeeded" ? { outputs: asset.output.data.map((o, index) => ({ index, label: ["front", "left", "back", "right"][index] ?? `view_${index + 1}`, url: o.url })), type: asset.type } : void 0,
        status
      };
    }
  },
  "image.regenerate": {
    category: "image",
    consumesCredits: true,
    description: "Re-run an existing Studio image or multiview asset with the same settings. Produces a new asset; the source asset is unchanged.",
    inputShape: {
      asset_id: identifier2.describe("Studio image asset id to regenerate (generate_image or multiview_images)."),
      submit: z11.boolean().optional()
    },
    title: "Regenerate Studio image",
    async build(ctx, input) {
      const asset = await ctx.gateway.getStudioImageAsset(input.asset_id);
      if (asset.asset_id !== input.asset_id || !["generate_image", "multiview_images"].includes(asset.type) || ["prepare", "queued", "running"].includes(asset.status)) {
        throw new TripoError("INSUFFICIENT_EVIDENCE", "The source image asset is the wrong type or is still running.", { stage: "image_generation_prepare" });
      }
      return {
        metadata: { kind: asset.type === "multiview_images" ? "multiview" : "image", source_asset_id: input.asset_id },
        payload: regenerationWireSchema.parse({ asset_id: input.asset_id }),
        snapshots: []
      };
    },
    async submitRemote(ctx, task) {
      const sourceType = task.metadata?.kind;
      const receipt = sourceType === "multiview" ? await ctx.gateway.regenerateStudioMultiview(task.payload.asset_id) : await ctx.gateway.regenerateStudioImage(task.payload.asset_id);
      return { asset_id: receipt.asset_id };
    },
    async syncRemote(ctx, task) {
      const asset = await ctx.gateway.getStudioImageAsset(task.remote.asset_id);
      const status = remoteAssetStatus(asset.status);
      return {
        progress: { status: asset.status },
        result: status === "succeeded" ? { outputs: asset.output.data.map((o, index) => ({ index, url: o.url })), type: asset.type } : void 0,
        status
      };
    }
  }
};
function remoteAssetStatus(status) {
  if (status === "success") return "succeeded";
  if (status === "cancelled") return "canceled";
  if (status === "expired") return "expired";
  if (status === "banned") return "banned";
  if (status === "failed") return "failed";
  if (status === "prepare" || status === "queued") return "queued";
  return "running";
}

// src/ops/local-editing.mjs
import { z as z12 } from "zod";
import { mkdir as mkdir4, readFile as readFile6, writeFile as writeFile3, access, open as open2 } from "node:fs/promises";
import { spawn } from "node:child_process";
import path9 from "node:path";
import { fileURLToPath } from "node:url";
import sharp2 from "sharp";

// src/util/glb-decode.mjs
import { createHash as createHash5 } from "node:crypto";
import { readFile as readFile5, stat as stat5, writeFile as writeFile2 } from "node:fs/promises";
import path8 from "node:path";

// node_modules/three/examples/jsm/libs/meshopt_decoder.module.js
var MeshoptDecoder = (function() {
  var wasm_base = "b9H79Tebbbe8Fv9Gbb9Gvuuuuueu9Giuuub9Geueu9Giuuueuikqbeeedddillviebeoweuec:q:Odkr;leDo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9KW9J9V9KW9wWVtW949c919M9MWVbeY9TW79O9V9Wt9F9KW9J9V9KW69U9KW949c919M9MWVbdE9TW79O9V9Wt9F9KW9J9V9KW69U9KW949tWG91W9U9JWbiL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9p9JtblK9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9r919HtbvL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVT949Wbol79IV9Rbrq;w8Wqdbk;esezu8Jjjjjbcj;eb9Rgv8Kjjjjbc9:hodnadcefal0mbcuhoaiRbbc:Ge9hmbavaialfgrad9Radz1jjjbhwcj;abad9Uc;WFbGgocjdaocjd6EhDaicefhocbhqdnindndndnaeaq9nmbaDaeaq9RaqaDfae6Egkcsfglcl4cifcd4hxalc9WGgmTmecbhPawcjdfhsaohzinaraz9Rax6mvarazaxfgo9RcK6mvczhlcbhHinalgic9WfgOawcj;cbffhldndndndndnazaOco4fRbbaHcoG4ciGPlbedibkal9cb83ibalcwf9cb83ibxikalaoRblaoRbbgOco4gAaAciSgAE86bbawcj;cbfaifglcGfaoclfaAfgARbbaOcl4ciGgCaCciSgCE86bbalcVfaAaCfgARbbaOcd4ciGgCaCciSgCE86bbalc7faAaCfgARbbaOciGgOaOciSgOE86bbalctfaAaOfgARbbaoRbegOco4gCaCciSgCE86bbalc91faAaCfgARbbaOcl4ciGgCaCciSgCE86bbalc4faAaCfgARbbaOcd4ciGgCaCciSgCE86bbalc93faAaCfgARbbaOciGgOaOciSgOE86bbalc94faAaOfgARbbaoRbdgOco4gCaCciSgCE86bbalc95faAaCfgARbbaOcl4ciGgCaCciSgCE86bbalc96faAaCfgARbbaOcd4ciGgCaCciSgCE86bbalc97faAaCfgARbbaOciGgOaOciSgOE86bbalc98faAaOfgORbbaoRbigoco4gAaAciSgAE86bbalc99faOaAfgORbbaocl4ciGgAaAciSgAE86bbalc9:faOaAfgORbbaocd4ciGgAaAciSgAE86bbalcufaOaAfglRbbaociGgoaociSgoE86bbalaofhoxdkalaoRbwaoRbbgOcl4gAaAcsSgAE86bbawcj;cbfaifglcGfaocwfaAfgARbbaOcsGgOaOcsSgOE86bbalcVfaAaOfgORbbaoRbegAcl4gCaCcsSgCE86bbalc7faOaCfgORbbaAcsGgAaAcsSgAE86bbalctfaOaAfgORbbaoRbdgAcl4gCaCcsSgCE86bbalc91faOaCfgORbbaAcsGgAaAcsSgAE86bbalc4faOaAfgORbbaoRbigAcl4gCaCcsSgCE86bbalc93faOaCfgORbbaAcsGgAaAcsSgAE86bbalc94faOaAfgORbbaoRblgAcl4gCaCcsSgCE86bbalc95faOaCfgORbbaAcsGgAaAcsSgAE86bbalc96faOaAfgORbbaoRbvgAcl4gCaCcsSgCE86bbalc97faOaCfgORbbaAcsGgAaAcsSgAE86bbalc98faOaAfgORbbaoRbogAcl4gCaCcsSgCE86bbalc99faOaCfgORbbaAcsGgAaAcsSgAE86bbalc9:faOaAfgORbbaoRbrgocl4gAaAcsSgAE86bbalcufaOaAfglRbbaocsGgoaocsSgoE86bbalaofhoxekalao8Pbb83bbalcwfaocwf8Pbb83bbaoczfhokdnaiam9pmbaHcdfhHaiczfhlarao9RcL0mekkaiam6mvaoTmvdnakTmbawaPfRbbhHawcj;cbfhlashiakhOinaialRbbgzce4cbazceG9R7aHfgH86bbaiadfhialcefhlaOcufgOmbkkascefhsaohzaPcefgPad9hmbxikkcbc99arao9Radcaadca0ESEhoxlkaoaxad2fhCdnakmbadhlinaoTmlarao9Rax6mlaoaxfhoalcufglmbkaChoxekcbhmawcjdfhAinarao9Rax6miawamfRbbhHawcj;cbfhlaAhiakhOinaialRbbgzce4cbazceG9R7aHfgH86bbaiadfhialcefhlaOcufgOmbkaAcefhAaoaxfhoamcefgmad9hmbkaChokabaqad2fawcjdfakad2z1jjjb8Aawawcjdfakcufad2fadz1jjjb8Aakaqfhqaombkc9:hoxekc9:hokavcj;ebf8Kjjjjbaok;cseHu8Jjjjjbc;ae9Rgv8Kjjjjbc9:hodnaeci9UgrcHfal0mbcuhoaiRbbgwc;WeGc;Ge9hmbawcsGgwce0mbavc;abfcFecjez:jjjjb8AavcUf9cu83ibavc8Wf9cu83ibavcyf9cu83ibavcaf9cu83ibavcKf9cu83ibavczf9cu83ibav9cu83iwav9cu83ibaialfc9WfhDaicefgqarfhidnaeTmbcmcsawceSEhkcbhxcbhmcbhPcbhwcbhlindnaiaD9nmbc9:hoxikdndnaqRbbgoc;Ve0mbavc;abfalaocu7gscl4fcsGcitfgzydlhrazydbhzdnaocsGgHak9pmbavawasfcsGcdtfydbaxaHEhoaHThsdndnadcd9hmbabaPcetfgHaz87ebaHclfao87ebaHcdfar87ebxekabaPcdtfgHazBdbaHcwfaoBdbaHclfarBdbkaxasfhxcdhHavawcdtfaoBdbawasfhwcehsalhOxdkdndnaHcsSmbaHc987aHamffcefhoxekaicefhoai8SbbgHcFeGhsdndnaHcu9mmbaohixekaicvfhiascFbGhscrhHdninao8SbbgOcFbGaHtasVhsaOcu9kmeaocefhoaHcrfgHc8J9hmbxdkkaocefhikasce4cbasceG9R7amfhokdndnadcd9hmbabaPcetfgHaz87ebaHclfao87ebaHcdfar87ebxekabaPcdtfgHazBdbaHcwfaoBdbaHclfarBdbkcdhHavawcdtfaoBdbcehsawcefhwalhOaohmxekdnaocpe0mbaxcefgHavawaDaocsGfRbbgocl49RcsGcdtfydbaocz6gzEhravawao9RcsGcdtfydbaHazfgAaocsGgHEhoaHThCdndnadcd9hmbabaPcetfgHax87ebaHclfao87ebaHcdfar87ebxekabaPcdtfgHaxBdbaHcwfaoBdbaHclfarBdbkcdhsavawcdtfaxBdbavawcefgwcsGcdtfarBdbcihHavc;abfalcitfgOaxBdlaOarBdbavawazfgwcsGcdtfaoBdbalcefcsGhOawaCfhwaxhzaAaCfhxxekaxcbaiRbbgOEgzaoc;:eSgHfhraOcsGhCaOcl4hAdndnaOcs0mbarcefhoxekarhoavawaA9RcsGcdtfydbhrkdndnaCmbaocefhxxekaohxavawaO9RcsGcdtfydbhokdndnaHTmbaicefhHxekaicdfhHai8SbegscFeGhzdnascu9kmbaicofhXazcFbGhzcrhidninaH8SbbgscFbGaitazVhzascu9kmeaHcefhHaicrfgic8J9hmbkaXhHxekaHcefhHkazce4cbazceG9R7amfgmhzkdndnaAcsSmbaHhsxekaHcefhsaH8SbbgicFeGhrdnaicu9kmbaHcvfhXarcFbGhrcrhidninas8SbbgHcFbGaitarVhraHcu9kmeascefhsaicrfgic8J9hmbkaXhsxekascefhskarce4cbarceG9R7amfgmhrkdndnaCcsSmbashixekascefhias8SbbgocFeGhHdnaocu9kmbascvfhXaHcFbGhHcrhodninai8SbbgscFbGaotaHVhHascu9kmeaicefhiaocrfgoc8J9hmbkaXhixekaicefhikaHce4cbaHceG9R7amfgmhokdndnadcd9hmbabaPcetfgHaz87ebaHclfao87ebaHcdfar87ebxekabaPcdtfgHazBdbaHcwfaoBdbaHclfarBdbkcdhsavawcdtfazBdbavawcefgwcsGcdtfarBdbcihHavc;abfalcitfgXazBdlaXarBdbavawaOcz6aAcsSVfgwcsGcdtfaoBdbawaCTaCcsSVfhwalcefcsGhOkaqcefhqavc;abfaOcitfgOarBdlaOaoBdbavc;abfalasfcsGcitfgraoBdlarazBdbawcsGhwalaHfcsGhlaPcifgPae6mbkkcbc99aiaDSEhokavc;aef8Kjjjjbaok:flevu8Jjjjjbcz9Rhvc9:hodnaecvfal0mbcuhoaiRbbc;:eGc;qe9hmbav9cb83iwaicefhraialfc98fhwdnaeTmbdnadcdSmbcbhDindnaraw6mbc9:skarcefhoar8SbbglcFeGhidndnalcu9mmbaohrxekarcvfhraicFbGhicrhldninao8SbbgdcFbGaltaiVhiadcu9kmeaocefhoalcrfglc8J9hmbxdkkaocefhrkabaDcdtfaic8Etc8F91aicd47avcwfaiceGcdtVgoydbfglBdbaoalBdbaDcefgDae9hmbxdkkcbhDindnaraw6mbc9:skarcefhoar8SbbglcFeGhidndnalcu9mmbaohrxekarcvfhraicFbGhicrhldninao8SbbgdcFbGaltaiVhiadcu9kmeaocefhoalcrfglc8J9hmbxdkkaocefhrkabaDcetfaic8Etc8F91aicd47avcwfaiceGcdtVgoydbfgl87ebaoalBdbaDcefgDae9hmbkkcbc99arawSEhokaok:Lvoeue99dud99eud99dndnadcl9hmbaeTmeindndnabcdfgd8Sbb:Yab8Sbbgi:Ygl:l:tabcefgv8Sbbgo:Ygr:l:tgwJbb;:9cawawNJbbbbawawJbbbb9GgDEgq:mgkaqaicb9iEalMgwawNakaqaocb9iEarMgqaqNMM:r:vglNJbbbZJbbb:;aDEMgr:lJbbb9p9DTmbar:Ohixekcjjjj94hikadai86bbdndnaqalNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkavad86bbdndnawalNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohdxekcjjjj94hdkabad86bbabclfhbaecufgembxdkkaeTmbindndnabclfgd8Ueb:Yab8Uebgi:Ygl:l:tabcdfgv8Uebgo:Ygr:l:tgwJb;:FSawawNJbbbbawawJbbbb9GgDEgq:mgkaqaicb9iEalMgwawNakaqaocb9iEarMgqaqNMM:r:vglNJbbbZJbbb:;aDEMgr:lJbbb9p9DTmbar:Ohixekcjjjj94hikadai87ebdndnaqalNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkavad87ebdndnawalNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohdxekcjjjj94hdkabad87ebabcwfhbaecufgembkkk;oiliui99iue99dnaeTmbcbhiabhlindndnJ;Zl81Zalcof8UebgvciV:Y:vgoal8Ueb:YNgrJb;:FSNJbbbZJbbb:;arJbbbb9GEMgw:lJbbb9p9DTmbaw:OhDxekcjjjj94hDkalclf8Uebhqalcdf8UebhkabaiavcefciGfcetfaD87ebdndnaoak:YNgwJb;:FSNJbbbZJbbb:;awJbbbb9GEMgx:lJbbb9p9DTmbax:OhDxekcjjjj94hDkabaiavciGfgkcd7cetfaD87ebdndnaoaq:YNgoJb;:FSNJbbbZJbbb:;aoJbbbb9GEMgx:lJbbb9p9DTmbax:OhDxekcjjjj94hDkabaiavcufciGfcetfaD87ebdndnJbbjZararN:tawawN:taoaoN:tgrJbbbbarJbbbb9GE:rJb;:FSNJbbbZMgr:lJbbb9p9DTmbar:Ohvxekcjjjj94hvkabakcetfav87ebalcwfhlaiclfhiaecufgembkkk9mbdnadcd4ae2gdTmbinababydbgecwtcw91:Yaece91cjjj98Gcjjj;8if::NUdbabclfhbadcufgdmbkkk9teiucbcbydj1jjbgeabcifc98GfgbBdj1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;LeeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiclfaeclfydbBdbaicwfaecwfydbBdbaicxfaecxfydbBdbaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk;aeedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdbaicxfalBdbaicwfalBdbaiclfalBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabkkkebcjwklzNbb";
  var wasm_simd = "b9H79TebbbeKl9Gbb9Gvuuuuueu9Giuuub9Geueuikqbbebeedddilve9Weeeviebeoweuec:q:6dkr;leDo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9KW9J9V9KW9wWVtW949c919M9MWVbdY9TW79O9V9Wt9F9KW9J9V9KW69U9KW949c919M9MWVblE9TW79O9V9Wt9F9KW9J9V9KW69U9KW949tWG91W9U9JWbvL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9p9JtboK9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9r919HtbrL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVT949Wbwl79IV9RbDq:p9sqlbzik9:evu8Jjjjjbcz9Rhbcbheincbhdcbhiinabcwfadfaicjuaead4ceGglE86bbaialfhiadcefgdcw9hmbkaec:q:yjjbfai86bbaecitc:q1jjbfab8Piw83ibaecefgecjd9hmbkk:N8JlHud97euo978Jjjjjbcj;kb9Rgv8Kjjjjbc9:hodnadcefal0mbcuhoaiRbbc:Ge9hmbavaialfgrad9Rad;8qbbcj;abad9UhlaicefhodnaeTmbadTmbalc;WFbGglcjdalcjd6EhwcbhDinawaeaD9RaDawfae6Egqcsfglc9WGgkci2hxakcethmalcl4cifcd4hPabaDad2fhsakc;ab6hzcbhHincbhOaohAdndninaraA9RaP6meavcj;cbfaOak2fhCaAaPfhocbhidnazmbarao9Rc;Gb6mbcbhlinaCalfhidndndndndnaAalco4fRbbgXciGPlbedibkaipxbbbbbbbbbbbbbbbbpklbxikaiaopbblaopbbbgQclp:meaQpmbzeHdOiAlCvXoQrLgQcdp:meaQpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9ogLpxiiiiiiiiiiiiiiiip8JgQp5b9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibaKc:q:yjjbfpbbbgYaYpmbbbbbbbbbbbbbbbbaQp5e9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPaLaQp9spklbaoclfaYpQbfaKc:q:yjjbfRbbfhoxdkaiaopbbwaopbbbgQclp:meaQpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9ogLpxssssssssssssssssp8JgQp5b9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibaKc:q:yjjbfpbbbgYaYpmbbbbbbbbbbbbbbbbaQp5e9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPaLaQp9spklbaocwfaYpQbfaKc:q:yjjbfRbbfhoxekaiaopbbbpklbaoczfhokdndndndndnaXcd4ciGPlbedibkaipxbbbbbbbbbbbbbbbbpklzxikaiaopbblaopbbbgQclp:meaQpmbzeHdOiAlCvXoQrLgQcdp:meaQpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9ogLpxiiiiiiiiiiiiiiiip8JgQp5b9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibaKc:q:yjjbfpbbbgYaYpmbbbbbbbbbbbbbbbbaQp5e9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPaLaQp9spklzaoclfaYpQbfaKc:q:yjjbfRbbfhoxdkaiaopbbwaopbbbgQclp:meaQpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9ogLpxssssssssssssssssp8JgQp5b9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibaKc:q:yjjbfpbbbgYaYpmbbbbbbbbbbbbbbbbaQp5e9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPaLaQp9spklzaocwfaYpQbfaKc:q:yjjbfRbbfhoxekaiaopbbbpklzaoczfhokdndndndndnaXcl4ciGPlbedibkaipxbbbbbbbbbbbbbbbbpklaxikaiaopbblaopbbbgQclp:meaQpmbzeHdOiAlCvXoQrLgQcdp:meaQpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9ogLpxiiiiiiiiiiiiiiiip8JgQp5b9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibaKc:q:yjjbfpbbbgYaYpmbbbbbbbbbbbbbbbbaQp5e9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPaLaQp9spklaaoclfaYpQbfaKc:q:yjjbfRbbfhoxdkaiaopbbwaopbbbgQclp:meaQpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9ogLpxssssssssssssssssp8JgQp5b9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibaKc:q:yjjbfpbbbgYaYpmbbbbbbbbbbbbbbbbaQp5e9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPaLaQp9spklaaocwfaYpQbfaKc:q:yjjbfRbbfhoxekaiaopbbbpklaaoczfhokdndndndndnaXco4Plbedibkaipxbbbbbbbbbbbbbbbbpkl8WxikaiaopbblaopbbbgQclp:meaQpmbzeHdOiAlCvXoQrLgQcdp:meaQpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9ogLpxiiiiiiiiiiiiiiiip8JgQp5b9cjF;8;4;W;G;ab9:9cU1:NgXcitc:q1jjbfpbibaXc:q:yjjbfpbbbgYaYpmbbbbbbbbbbbbbbbbaQp5e9cjF;8;4;W;G;ab9:9cU1:NgXcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPaLaQp9spkl8WaoclfaYpQbfaXc:q:yjjbfRbbfhoxdkaiaopbbwaopbbbgQclp:meaQpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9ogLpxssssssssssssssssp8JgQp5b9cjF;8;4;W;G;ab9:9cU1:NgXcitc:q1jjbfpbibaXc:q:yjjbfpbbbgYaYpmbbbbbbbbbbbbbbbbaQp5e9cjF;8;4;W;G;ab9:9cU1:NgXcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPaLaQp9spkl8WaocwfaYpQbfaXc:q:yjjbfRbbfhoxekaiaopbbbpkl8Waoczfhokalc;abfhialcjefak0meaihlarao9Rc;Fb0mbkkdnaiak9pmbaici4hlinarao9RcK6miaCaifhXdndndndndnaAaico4fRbbalcoG4ciGPlbedibkaXpxbbbbbbbbbbbbbbbbpkbbxikaXaopbblaopbbbgQclp:meaQpmbzeHdOiAlCvXoQrLgQcdp:meaQpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9ogLpxiiiiiiiiiiiiiiiip8JgQp5b9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibaKc:q:yjjbfpbbbgYaYpmbbbbbbbbbbbbbbbbaQp5e9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPaLaQp9spkbbaoclfaYpQbfaKc:q:yjjbfRbbfhoxdkaXaopbbwaopbbbgQclp:meaQpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9ogLpxssssssssssssssssp8JgQp5b9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibaKc:q:yjjbfpbbbgYaYpmbbbbbbbbbbbbbbbbaQp5e9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPaLaQp9spkbbaocwfaYpQbfaKc:q:yjjbfRbbfhoxekaXaopbbbpkbbaoczfhokalcdfhlaiczfgiak6mbkkaoTmeaohAaOcefgOclSmdxbkkc9:hoxlkdnakTmbavcjdfaHfhiavaHfpbdbhYcbhXinaiavcj;cbfaXfglpblbgLcep9TaLpxeeeeeeeeeeeeeeeegQp9op9Hp9rgLalakfpblbg8Acep9Ta8AaQp9op9Hp9rg8ApmbzeHdOiAlCvXoQrLgEalamfpblbg3cep9Ta3aQp9op9Hp9rg3alaxfpblbg5cep9Ta5aQp9op9Hp9rg5pmbzeHdOiAlCvXoQrLg8EpmbezHdiOAlvCXorQLgQaQpmbedibedibedibediaYp9UgYp9AdbbaiadfglaYaQaQpmlvorlvorlvorlvorp9UgYp9AdbbaladfglaYaQaQpmwDqkwDqkwDqkwDqkp9UgYp9AdbbaladfglaYaQaQpmxmPsxmPsxmPsxmPsp9UgYp9AdbbaladfglaYaEa8EpmwDKYqk8AExm35Ps8E8FgQaQpmbedibedibedibedip9UgYp9AdbbaladfglaYaQaQpmlvorlvorlvorlvorp9UgYp9AdbbaladfglaYaQaQpmwDqkwDqkwDqkwDqkp9UgYp9AdbbaladfglaYaQaQpmxmPsxmPsxmPsxmPsp9UgYp9AdbbaladfglaYaLa8ApmwKDYq8AkEx3m5P8Es8FgLa3a5pmwKDYq8AkEx3m5P8Es8Fg8ApmbezHdiOAlvCXorQLgQaQpmbedibedibedibedip9UgYp9AdbbaladfglaYaQaQpmlvorlvorlvorlvorp9UgYp9AdbbaladfglaYaQaQpmwDqkwDqkwDqkwDqkp9UgYp9AdbbaladfglaYaQaQpmxmPsxmPsxmPsxmPsp9UgYp9AdbbaladfglaYaLa8ApmwDKYqk8AExm35Ps8E8FgQaQpmbedibedibedibedip9UgYp9AdbbaladfglaYaQaQpmlvorlvorlvorlvorp9UgYp9AdbbaladfglaYaQaQpmwDqkwDqkwDqkwDqkp9UgYp9AdbbaladfglaYaQaQpmxmPsxmPsxmPsxmPsp9UgYp9AdbbaladfhiaXczfgXak6mbkkaHclfgHad6mbkasavcjdfaqad2;8qbbavavcjdfaqcufad2fad;8qbbaqaDfgDae6mbkkcbc99arao9Radcaadca0ESEhokavcj;kbf8Kjjjjbaokwbz:bjjjbk::seHu8Jjjjjbc;ae9Rgv8Kjjjjbc9:hodnaeci9UgrcHfal0mbcuhoaiRbbgwc;WeGc;Ge9hmbawcsGgwce0mbavc;abfcFecje;8kbavcUf9cu83ibavc8Wf9cu83ibavcyf9cu83ibavcaf9cu83ibavcKf9cu83ibavczf9cu83ibav9cu83iwav9cu83ibaialfc9WfhDaicefgqarfhidnaeTmbcmcsawceSEhkcbhxcbhmcbhPcbhwcbhlindnaiaD9nmbc9:hoxikdndnaqRbbgoc;Ve0mbavc;abfalaocu7gscl4fcsGcitfgzydlhrazydbhzdnaocsGgHak9pmbavawasfcsGcdtfydbaxaHEhoaHThsdndnadcd9hmbabaPcetfgHaz87ebaHclfao87ebaHcdfar87ebxekabaPcdtfgHazBdbaHcwfaoBdbaHclfarBdbkaxasfhxcdhHavawcdtfaoBdbawasfhwcehsalhOxdkdndnaHcsSmbaHc987aHamffcefhoxekaicefhoai8SbbgHcFeGhsdndnaHcu9mmbaohixekaicvfhiascFbGhscrhHdninao8SbbgOcFbGaHtasVhsaOcu9kmeaocefhoaHcrfgHc8J9hmbxdkkaocefhikasce4cbasceG9R7amfhokdndnadcd9hmbabaPcetfgHaz87ebaHclfao87ebaHcdfar87ebxekabaPcdtfgHazBdbaHcwfaoBdbaHclfarBdbkcdhHavawcdtfaoBdbcehsawcefhwalhOaohmxekdnaocpe0mbaxcefgHavawaDaocsGfRbbgocl49RcsGcdtfydbaocz6gzEhravawao9RcsGcdtfydbaHazfgAaocsGgHEhoaHThCdndnadcd9hmbabaPcetfgHax87ebaHclfao87ebaHcdfar87ebxekabaPcdtfgHaxBdbaHcwfaoBdbaHclfarBdbkcdhsavawcdtfaxBdbavawcefgwcsGcdtfarBdbcihHavc;abfalcitfgOaxBdlaOarBdbavawazfgwcsGcdtfaoBdbalcefcsGhOawaCfhwaxhzaAaCfhxxekaxcbaiRbbgOEgzaoc;:eSgHfhraOcsGhCaOcl4hAdndnaOcs0mbarcefhoxekarhoavawaA9RcsGcdtfydbhrkdndnaCmbaocefhxxekaohxavawaO9RcsGcdtfydbhokdndnaHTmbaicefhHxekaicdfhHai8SbegscFeGhzdnascu9kmbaicofhXazcFbGhzcrhidninaH8SbbgscFbGaitazVhzascu9kmeaHcefhHaicrfgic8J9hmbkaXhHxekaHcefhHkazce4cbazceG9R7amfgmhzkdndnaAcsSmbaHhsxekaHcefhsaH8SbbgicFeGhrdnaicu9kmbaHcvfhXarcFbGhrcrhidninas8SbbgHcFbGaitarVhraHcu9kmeascefhsaicrfgic8J9hmbkaXhsxekascefhskarce4cbarceG9R7amfgmhrkdndnaCcsSmbashixekascefhias8SbbgocFeGhHdnaocu9kmbascvfhXaHcFbGhHcrhodninai8SbbgscFbGaotaHVhHascu9kmeaicefhiaocrfgoc8J9hmbkaXhixekaicefhikaHce4cbaHceG9R7amfgmhokdndnadcd9hmbabaPcetfgHaz87ebaHclfao87ebaHcdfar87ebxekabaPcdtfgHazBdbaHcwfaoBdbaHclfarBdbkcdhsavawcdtfazBdbavawcefgwcsGcdtfarBdbcihHavc;abfalcitfgXazBdlaXarBdbavawaOcz6aAcsSVfgwcsGcdtfaoBdbawaCTaCcsSVfhwalcefcsGhOkaqcefhqavc;abfaOcitfgOarBdlaOaoBdbavc;abfalasfcsGcitfgraoBdlarazBdbawcsGhwalaHfcsGhlaPcifgPae6mbkkcbc99aiaDSEhokavc;aef8Kjjjjbaok:flevu8Jjjjjbcz9Rhvc9:hodnaecvfal0mbcuhoaiRbbc;:eGc;qe9hmbav9cb83iwaicefhraialfc98fhwdnaeTmbdnadcdSmbcbhDindnaraw6mbc9:skarcefhoar8SbbglcFeGhidndnalcu9mmbaohrxekarcvfhraicFbGhicrhldninao8SbbgdcFbGaltaiVhiadcu9kmeaocefhoalcrfglc8J9hmbxdkkaocefhrkabaDcdtfaic8Etc8F91aicd47avcwfaiceGcdtVgoydbfglBdbaoalBdbaDcefgDae9hmbxdkkcbhDindnaraw6mbc9:skarcefhoar8SbbglcFeGhidndnalcu9mmbaohrxekarcvfhraicFbGhicrhldninao8SbbgdcFbGaltaiVhiadcu9kmeaocefhoalcrfglc8J9hmbxdkkaocefhrkabaDcetfaic8Etc8F91aicd47avcwfaiceGcdtVgoydbfgl87ebaoalBdbaDcefgDae9hmbkkcbc99arawSEhokaok:wPliuo97eue978Jjjjjbca9Rhiaec98Ghldndnadcl9hmbdnalTmbcbhvabhdinadadpbbbgocKp:RecKp:Sep;6egraocwp:RecKp:Sep;6earp;Geaoczp:RecKp:Sep;6egwp;Gep;Kep;LegDpxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgkp9op9rp;Kegrpxbb;:9cbb;:9cbb;:9cbb;:9cararp;MeaDaDp;Meawaqawakp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFbbbFbbbFbbbFbbbp9oaopxbbbFbbbFbbbFbbbFp9op9qarawp;Meaqp;Kecwp:RepxbFbbbFbbbFbbbFbbp9op9qaDawp;Meaqp;Keczp:RepxbbFbbbFbbbFbbbFbp9op9qpkbbadczfhdavclfgval6mbkkalaeSmeaipxbbbbbbbbbbbbbbbbgqpklbaiabalcdtfgdaeciGglcdtgv;8qbbdnalTmbaiaipblbgocKp:RecKp:Sep;6egraocwp:RecKp:Sep;6earp;Geaoczp:RecKp:Sep;6egwp;Gep;Kep;LegDaqp:2egqarpxbbbjbbbjbbbjbbbjgkp9op9rp;Kegrpxbb;:9cbb;:9cbb;:9cbb;:9cararp;MeaDaDp;Meawaqawakp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFbbbFbbbFbbbFbbbp9oaopxbbbFbbbFbbbFbbbFp9op9qarawp;Meaqp;Kecwp:RepxbFbbbFbbbFbbbFbbp9op9qaDawp;Meaqp;Keczp:RepxbbFbbbFbbbFbbbFbp9op9qpklbkadaiav;8qbbskdnalTmbcbhvabhdinadczfgxaxpbbbgopxbbbbbbFFbbbbbbFFgkp9oadpbbbgDaopmbediwDqkzHOAKY8AEgwczp:Reczp:Sep;6egraDaopmlvorxmPsCXQL358E8FpxFubbFubbFubbFubbp9op;6eawczp:Sep;6egwp;Gearp;Gep;Kep;Legopxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgmp9op9rp;Kegrpxb;:FSb;:FSb;:FSb;:FSararp;Meaoaop;Meawaqawamp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFFbbFFbbFFbbFFbbp9oaoawp;Meaqp;Keczp:Rep9qgoarawp;Meaqp;KepxFFbbFFbbFFbbFFbbp9ogrpmwDKYqk8AExm35Ps8E8Fp9qpkbbadaDakp9oaoarpmbezHdiOAlvCXorQLp9qpkbbadcafhdavclfgval6mbkkalaeSmbaiaeciGgvcitgdfcbcaad9R;8kbaiabalcitfglad;8qbbdnavTmbaiaipblzgopxbbbbbbFFbbbbbbFFgkp9oaipblbgDaopmbediwDqkzHOAKY8AEgwczp:Reczp:Sep;6egraDaopmlvorxmPsCXQL358E8FpxFubbFubbFubbFubbp9op;6eawczp:Sep;6egwp;Gearp;Gep;Kep;Legopxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgmp9op9rp;Kegrpxb;:FSb;:FSb;:FSb;:FSararp;Meaoaop;Meawaqawamp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFFbbFFbbFFbbFFbbp9oaoawp;Meaqp;Keczp:Rep9qgoarawp;Meaqp;KepxFFbbFFbbFFbbFFbbp9ogrpmwDKYqk8AExm35Ps8E8Fp9qpklzaiaDakp9oaoarpmbezHdiOAlvCXorQLp9qpklbkalaiad;8qbbkk;4wllue97euv978Jjjjjbc8W9Rhidnaec98GglTmbcbhvabhoinaiaopbbbgraoczfgwpbbbgDpmlvorxmPsCXQL358E8Fgqczp:Segkclp:RepklbaopxbbjZbbjZbbjZbbjZpx;Zl81Z;Zl81Z;Zl81Z;Zl81Zakpxibbbibbbibbbibbbp9qp;6ep;NegkaraDpmbediwDqkzHOAKY8AEgrczp:Reczp:Sep;6ep;MegDaDp;Meakarczp:Sep;6ep;Megxaxp;Meakaqczp:Reczp:Sep;6ep;Megqaqp;Mep;Kep;Kep;Lepxbbbbbbbbbbbbbbbbp:4ep;Jepxb;:FSb;:FSb;:FSb;:FSgkp;Mepxbbn0bbn0bbn0bbn0grp;KepxFFbbFFbbFFbbFFbbgmp9oaxakp;Mearp;Keczp:Rep9qgxaDakp;Mearp;Keamp9oaqakp;Mearp;Keczp:Rep9qgkpmbezHdiOAlvCXorQLgrp5baipblbpEb:T:j83ibaocwfarp5eaipblbpEe:T:j83ibawaxakpmwDKYqk8AExm35Ps8E8Fgkp5baipblbpEd:T:j83ibaocKfakp5eaipblbpEi:T:j83ibaocafhoavclfgval6mbkkdnalaeSmbaiaeciGgvcitgofcbcaao9R;8kbaiabalcitfgwao;8qbbdnavTmbaiaipblbgraipblzgDpmlvorxmPsCXQL358E8Fgqczp:Segkclp:RepklaaipxbbjZbbjZbbjZbbjZpx;Zl81Z;Zl81Z;Zl81Z;Zl81Zakpxibbbibbbibbbibbbp9qp;6ep;NegkaraDpmbediwDqkzHOAKY8AEgrczp:Reczp:Sep;6ep;MegDaDp;Meakarczp:Sep;6ep;Megxaxp;Meakaqczp:Reczp:Sep;6ep;Megqaqp;Mep;Kep;Kep;Lepxbbbbbbbbbbbbbbbbp:4ep;Jepxb;:FSb;:FSb;:FSb;:FSgkp;Mepxbbn0bbn0bbn0bbn0grp;KepxFFbbFFbbFFbbFFbbgmp9oaxakp;Mearp;Keczp:Rep9qgxaDakp;Mearp;Keamp9oaqakp;Mearp;Keczp:Rep9qgkpmbezHdiOAlvCXorQLgrp5baipblapEb:T:j83ibaiarp5eaipblapEe:T:j83iwaiaxakpmwDKYqk8AExm35Ps8E8Fgkp5baipblapEd:T:j83izaiakp5eaipblapEi:T:j83iKkawaiao;8qbbkk:Pddiue978Jjjjjbc;ab9Rhidnadcd4ae2glc98GgvTmbcbheabhdinadadpbbbgocwp:Recwp:Sep;6eaocep:SepxbbjFbbjFbbjFbbjFp9opxbbjZbbjZbbjZbbjZp:Uep;Mepkbbadczfhdaeclfgeav6mbkkdnavalSmbaialciGgecdtgdVcbc;abad9R;8kbaiabavcdtfgvad;8qbbdnaeTmbaiaipblbgocwp:Recwp:Sep;6eaocep:SepxbbjFbbjFbbjFbbjFp9opxbbjZbbjZbbjZbbjZp:Uep;Mepklbkavaiad;8qbbkk9teiucbcbydj1jjbgeabcifc98GfgbBdj1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaikkkebcjwklz:Dbb";
  var detector = new Uint8Array([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    1,
    4,
    1,
    96,
    0,
    0,
    3,
    3,
    2,
    0,
    0,
    5,
    3,
    1,
    0,
    1,
    12,
    1,
    0,
    10,
    22,
    2,
    12,
    0,
    65,
    0,
    65,
    0,
    65,
    0,
    252,
    10,
    0,
    0,
    11,
    7,
    0,
    65,
    0,
    253,
    15,
    26,
    11
  ]);
  var wasmpack = new Uint8Array([
    32,
    0,
    65,
    2,
    1,
    106,
    34,
    33,
    3,
    128,
    11,
    4,
    13,
    64,
    6,
    253,
    10,
    7,
    15,
    116,
    127,
    5,
    8,
    12,
    40,
    16,
    19,
    54,
    20,
    9,
    27,
    255,
    113,
    17,
    42,
    67,
    24,
    23,
    146,
    148,
    18,
    14,
    22,
    45,
    70,
    69,
    56,
    114,
    101,
    21,
    25,
    63,
    75,
    136,
    108,
    28,
    118,
    29,
    73,
    115
  ]);
  if (typeof WebAssembly !== "object") {
    return {
      supported: false
    };
  }
  var wasm = WebAssembly.validate(detector) ? unpack(wasm_simd) : unpack(wasm_base);
  var instance;
  var ready = WebAssembly.instantiate(wasm, {}).then(function(result) {
    instance = result.instance;
    instance.exports.__wasm_call_ctors();
  });
  function unpack(data) {
    var result = new Uint8Array(data.length);
    for (var i = 0; i < data.length; ++i) {
      var ch = data.charCodeAt(i);
      result[i] = ch > 96 ? ch - 97 : ch > 64 ? ch - 39 : ch + 4;
    }
    var write = 0;
    for (var i = 0; i < data.length; ++i) {
      result[write++] = result[i] < 60 ? wasmpack[result[i]] : (result[i] - 60) * 64 + result[++i];
    }
    return result.buffer.slice(0, write);
  }
  function decode(instance2, fun, target, count, size, source, filter) {
    var sbrk = instance2.exports.sbrk;
    var count4 = count + 3 & ~3;
    var tp = sbrk(count4 * size);
    var sp = sbrk(source.length);
    var heap = new Uint8Array(instance2.exports.memory.buffer);
    heap.set(source, sp);
    var res = fun(tp, count, size, sp, source.length);
    if (res == 0 && filter) {
      filter(tp, count4, size);
    }
    target.set(heap.subarray(tp, tp + count * size));
    sbrk(tp - sbrk(0));
    if (res != 0) {
      throw new Error("Malformed buffer data: " + res);
    }
  }
  var filters = {
    NONE: "",
    OCTAHEDRAL: "meshopt_decodeFilterOct",
    QUATERNION: "meshopt_decodeFilterQuat",
    EXPONENTIAL: "meshopt_decodeFilterExp"
  };
  var decoders = {
    ATTRIBUTES: "meshopt_decodeVertexBuffer",
    TRIANGLES: "meshopt_decodeIndexBuffer",
    INDICES: "meshopt_decodeIndexSequence"
  };
  var workers = [];
  var requestId = 0;
  function createWorker(url) {
    var worker = {
      object: new Worker(url),
      pending: 0,
      requests: {}
    };
    worker.object.onmessage = function(event2) {
      var data = event2.data;
      worker.pending -= data.count;
      worker.requests[data.id][data.action](data.value);
      delete worker.requests[data.id];
    };
    return worker;
  }
  function initWorkers(count) {
    var source = "self.ready = WebAssembly.instantiate(new Uint8Array([" + new Uint8Array(wasm) + "]), {}).then(function(result) { result.instance.exports.__wasm_call_ctors(); return result.instance; });self.onmessage = " + workerProcess.name + ";" + decode.toString() + workerProcess.toString();
    var blob = new Blob([source], { type: "text/javascript" });
    var url = URL.createObjectURL(blob);
    for (var i = workers.length; i < count; ++i) {
      workers[i] = createWorker(url);
    }
    for (var i = count; i < workers.length; ++i) {
      workers[i].object.postMessage({});
    }
    workers.length = count;
    URL.revokeObjectURL(url);
  }
  function decodeWorker(count, size, source, mode, filter) {
    var worker = workers[0];
    for (var i = 1; i < workers.length; ++i) {
      if (workers[i].pending < worker.pending) {
        worker = workers[i];
      }
    }
    return new Promise(function(resolve, reject2) {
      var data = new Uint8Array(source);
      var id3 = ++requestId;
      worker.pending += count;
      worker.requests[id3] = { resolve, reject: reject2 };
      worker.object.postMessage({ id: id3, count, size, source: data, mode, filter }, [data.buffer]);
    });
  }
  function workerProcess(event2) {
    var data = event2.data;
    if (!data.id) {
      return self.close();
    }
    self.ready.then(function(instance2) {
      try {
        var target = new Uint8Array(data.count * data.size);
        decode(instance2, instance2.exports[data.mode], target, data.count, data.size, data.source, instance2.exports[data.filter]);
        self.postMessage({ id: data.id, count: data.count, action: "resolve", value: target }, [target.buffer]);
      } catch (error) {
        self.postMessage({ id: data.id, count: data.count, action: "reject", value: error });
      }
    });
  }
  return {
    ready,
    supported: true,
    useWorkers: function(count) {
      initWorkers(count);
    },
    decodeVertexBuffer: function(target, count, size, source, filter) {
      decode(instance, instance.exports.meshopt_decodeVertexBuffer, target, count, size, source, instance.exports[filters[filter]]);
    },
    decodeIndexBuffer: function(target, count, size, source) {
      decode(instance, instance.exports.meshopt_decodeIndexBuffer, target, count, size, source);
    },
    decodeIndexSequence: function(target, count, size, source) {
      decode(instance, instance.exports.meshopt_decodeIndexSequence, target, count, size, source);
    },
    decodeGltfBuffer: function(target, count, size, source, mode, filter) {
      decode(instance, instance.exports[decoders[mode]], target, count, size, source, instance.exports[filters[filter]]);
    },
    decodeGltfBufferAsync: function(count, size, source, mode, filter) {
      if (workers.length > 0) {
        return decodeWorker(count, size, source, decoders[mode], filters[filter]);
      }
      return ready.then(function() {
        var target = new Uint8Array(count * size);
        decode(instance, instance.exports[decoders[mode]], target, count, size, source, instance.exports[filters[filter]]);
        return target;
      });
    }
  };
})();

// src/util/glb-decode.mjs
var invalid2 = (message) => new TripoError("FILE_INVALID", message, { stage: "model_decode" });
var hash2 = (bytes) => createHash5("sha256").update(bytes).digest("hex");
var integer = (value) => Number.isSafeInteger(value) && value >= 0;
async function decodeMeshoptGlb(bytes, maxBytes = MAX_IMPORT_MODEL_BYTES) {
  if (bytes.length < 28 || bytes.length > maxBytes || bytes.toString("ascii", 0, 4) !== "glTF" || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw invalid2("Invalid or oversized GLB v2 file.");
  let json, binary, offset = 12;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw invalid2("Truncated GLB chunk header.");
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    if (length % 4 || offset + 8 + length > bytes.length) throw invalid2("Truncated or misaligned GLB chunk.");
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (offset === 12 && type !== 1313821514) throw invalid2("GLB must start with a JSON chunk.");
    if (type === 1313821514) {
      if (json) throw invalid2("Duplicate GLB JSON chunk.");
      try {
        json = JSON.parse(chunk.toString("utf8").replace(/[\u0000\u0020]+$/g, ""));
      } catch {
        throw invalid2("Invalid GLB JSON.");
      }
    } else if (type === 5130562) {
      if (binary) throw invalid2("Duplicate GLB binary chunk.");
      binary = chunk;
    }
    offset += 8 + length;
  }
  if (!json) throw invalid2("GLB has no JSON document.");
  if (!json.bufferViews?.some((v) => v.extensions?.EXT_meshopt_compression)) return bytes;
  if (!binary || !json.buffers?.length || json.buffers[0].uri || json.buffers[0].byteLength > binary.length || json.buffers.slice(1).some((b) => b.uri || b.extensions?.EXT_meshopt_compression?.fallback !== true)) throw invalid2("Meshopt decoding requires an embedded buffer and optional virtual fallback buffers.");
  if (json.images?.some((i) => i.uri && !i.uri.startsWith("data:"))) throw invalid2("External GLB images are not supported.");
  await MeshoptDecoder.ready;
  const chunks = [binary];
  let total = binary.length;
  for (const view of json.bufferViews) {
    const extension = view.extensions?.EXT_meshopt_compression;
    if (!extension) {
      if (view.buffer !== 0 || !integer(view.byteOffset ?? 0) || !integer(view.byteLength) || (view.byteOffset ?? 0) + view.byteLength > binary.length) throw invalid2("Invalid embedded GLB buffer view.");
      continue;
    }
    const start = extension.byteOffset ?? 0;
    const length = extension.count * extension.byteStride;
    const paddedLength = Math.ceil(length / 4) * 4;
    if (extension.buffer !== 0 || !integer(extension.count) || !integer(extension.byteStride) || !extension.byteStride || !integer(start) || !integer(extension.byteLength) || start + extension.byteLength > binary.length || !integer(length) || total + paddedLength > maxBytes) throw invalid2("Invalid or oversized Meshopt buffer view.");
    const decoded = Buffer.alloc(length);
    try {
      MeshoptDecoder.decodeGltfBuffer(decoded, extension.count, extension.byteStride, binary.subarray(start, start + extension.byteLength), extension.mode, extension.filter ?? "NONE");
    } catch {
      throw invalid2("Could not decode the Meshopt geometry.");
    }
    view.buffer = 0;
    view.byteOffset = total;
    view.byteLength = length;
    delete view.extensions.EXT_meshopt_compression;
    if (!Object.keys(view.extensions).length) delete view.extensions;
    chunks.push(decoded, Buffer.alloc(paddedLength - length));
    total += paddedLength;
  }
  json.buffers = [{ byteLength: total }];
  for (const key of ["extensionsUsed", "extensionsRequired"]) {
    if (json[key]) {
      json[key] = json[key].filter((name) => name !== "EXT_meshopt_compression");
      if (!json[key].length) delete json[key];
    }
  }
  const rawJson = Buffer.from(JSON.stringify(json));
  const jsonBytes = Buffer.alloc(Math.ceil(rawJson.length / 4) * 4, 32);
  rawJson.copy(jsonBytes);
  if (28 + jsonBytes.length + total > maxBytes) throw invalid2("Decoded GLB exceeds the model size limit.");
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.write("glTF");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + jsonBytes.length + total, 8);
  header.writeUInt32LE(jsonBytes.length, 12);
  header.writeUInt32LE(1313821514, 16);
  binHeader.writeUInt32LE(total);
  binHeader.writeUInt32LE(5130562, 4);
  return Buffer.concat([header, jsonBytes, binHeader, ...chunks]);
}
async function prepareGlbForBlender(config, sourcePath) {
  if ((await stat5(sourcePath)).size > MAX_IMPORT_MODEL_BYTES) throw invalid2("GLB exceeds the 150 MiB local model limit.");
  const source = await readFile5(sourcePath);
  const decoded = await decodeMeshoptGlb(source);
  const sourceHash = hash2(source), decodedHash = decoded === source ? sourceHash : hash2(decoded);
  let target = sourcePath;
  if (decoded !== source) {
    const parsed = path8.parse(sourcePath);
    target = await resolveOutputPath(config, path8.join(parsed.dir, `${parsed.name}.decoded-${sourceHash.slice(0, 12)}.glb`), "decoded.glb");
    try {
      await writeFile2(target, decoded, { flag: "wx", mode: 256 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (hash2(await readFile5(target)) !== decodedHash) throw invalid2("The retained decoded GLB changed; refusing to overwrite it.");
    }
  }
  return { blender_path: target, meshopt_decoded: decoded !== source, source_sha256: sourceHash, blender_sha256: decodedHash, blender_bytes: decoded.length };
}

// src/ops/local-editing.mjs
var matrix = z12.array(z12.number().finite()).length(16);
var dimension = z12.number().int().min(64).max(2048);
var partName = z12.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$/);
function imagePath(ctx, taskId, provenance) {
  return path9.join(snapshotDirectory(ctx.config, taskId), path9.basename(provenance.relative_path));
}
async function retainImage(ctx, filePath, taskId, index = 1) {
  const image = await stageLocalImage(ctx.config, null, null, filePath, false, { taskId, index, label: "Local image", slot: "image", upload: false });
  return { ...image, path: imagePath(ctx, taskId, image.provenance) };
}
async function retainModel(ctx, filePath, taskId) {
  if (path9.extname(filePath).toLowerCase() !== ".glb") throw new TripoError("INVALID_INPUT", "Local viewport/edit tools require a self-contained GLB.");
  const model = await stageLocalModelFile(ctx.config, filePath, { taskId, index: 1, label: "Local GLB", slot: "model" });
  await inspectModel(model.path);
  const bytes = await readFile6(model.path);
  const jsonLength = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
  for (const resource of [...document.buffers ?? [], ...document.images ?? []]) {
    if (resource.uri && !resource.uri.startsWith("data:")) throw new TripoError("INVALID_INPUT", "External GLB resources are not accepted. Embed them before using local tools.");
  }
  const compatible = await prepareGlbForBlender({ ...ctx.config, outputRoots: [snapshotDirectory(ctx.config, taskId)] }, model.path);
  if (!compatible.meshopt_decoded) return { ...model, snapshots: [model.provenance] };
  const derived = { format: "glb", label: "Decoded Blender GLB", relative_path: path9.relative(ctx.config.dataDir, compatible.blender_path).split(path9.sep).join("/"), sha256: compatible.blender_sha256, size_bytes: compatible.blender_bytes, slot: "blender_model", source_name: path9.basename(filePath) };
  return { ...model, path: compatible.blender_path, snapshots: [model.provenance, derived] };
}
async function blender(ctx, task, job) {
  const output = path9.join(ctx.config.assetRoot, "operations", task.task_id);
  await mkdir4(output, { recursive: true });
  const jobPath = path9.join(snapshotDirectory(ctx.config, task.task_id), "worker-job.json");
  await writeFile3(jobPath, JSON.stringify({ ...job, output_dir: output }), { mode: 384 });
  const moduleDir = path9.dirname(fileURLToPath(import.meta.url));
  const candidates = [path9.resolve(moduleDir, "../../scripts/blender-worker.py"), path9.resolve(moduleDir, "../scripts/blender-worker.py")];
  let script;
  for (const candidate of candidates) {
    try {
      await access(candidate);
      script = candidate;
      break;
    } catch {
    }
  }
  if (!script) throw new TripoError("CONFIGURATION_ERROR", "Packaged Blender worker is missing.");
  const logPath = path9.join(output, "blender.log");
  const log = await open2(logPath, "w", 384);
  try {
    await new Promise((resolve, reject2) => {
      const proc = spawn(ctx.config.blenderExecutable ?? "blender", ["--background", "--factory-startup", "--python-exit-code", "1", "--python", script, "--", jobPath], { stdio: ["ignore", log.fd, log.fd] });
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        reject2(new TripoError("LOCAL_PROCESS_FAILED", "Blender exceeded the 15-minute limit."));
      }, 15 * 60 * 1e3);
      proc.on("error", () => {
        clearTimeout(timer);
        reject2(new TripoError("CONFIGURATION_ERROR", "Blender is unavailable. Install Blender and set TRIPO_BLENDER_EXECUTABLE to its executable."));
      });
      proc.on("exit", (code) => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject2(new TripoError("LOCAL_PROCESS_FAILED", "Blender could not process this model; inspect the retained worker job.", { details: { exit_code: code, log_path: logPath }, stage: "local_worker" }));
      });
    });
  } finally {
    await log.close();
  }
  const result = JSON.parse(await readFile6(path9.join(output, "result.json"), "utf8"));
  if (result.render_path) {
    const webp = path9.join(output, "viewport.webp");
    await sharp2(result.render_path).flatten({ background: "#eeeeee" }).webp({ lossless: true }).toFile(webp);
    result.render_image_path = webp;
  }
  return { local_result: result };
}
var local = (title, description, inputShape, build, run) => ({ category: "local", consumesCredits: false, title, description, inputShape: { ...inputShape, submit: z12.boolean().optional() }, build, submitRemote: run, async syncRemote(ctx, task) {
  return { status: "succeeded", result: task.remote.local_result };
} });
var viewShape = { viewport_width: dimension.default(512), viewport_height: dimension.default(512), fov_degrees: z12.number().min(10).max(120).default(50), camera_matrix: matrix.optional(), view: z12.enum(["front", "left", "back", "right", "three_quarter"]).default("three_quarter") };
async function modelJob(ctx, input, taskId, kind) {
  const model = await retainModel(ctx, input.model_path, taskId);
  const { submit, ...params } = input;
  return { payload: { ...params, model_path: model.path, kind }, snapshots: model.snapshots };
}
var localEditingOperations = {
  "local.render": local("Render model viewport", "Render a self-contained local GLB with Blender in background. Outputs a static WebP at exactly 2x viewport plus a Three.js Y-up camera world matrix for Magic Brush. Requires local Blender; changes no Studio project.", { model_path: z12.string(), ...viewShape }, (ctx, input, taskId) => modelJob(ctx, input, taskId, "render"), (ctx, task) => blender(ctx, task, task.payload)),
  "local.inspect_parts": local("Inspect local mesh parts", "Inspect GLB parts, polygon counts, UV presence, skinning and estimated UV utilization per part (256x256 union in tile [0,1]). This estimate is not Studio's exact UI metric. Face indices refer to Blender-imported polygons. Requires Blender.", { model_path: z12.string() }, (ctx, input, taskId) => modelJob(ctx, input, taskId, "inspect"), (ctx, task) => blender(ctx, task, task.payload)),
  "local.edit_parts": local("Edit parts in a model copy", "Merge, hide, delete, or split selected face indices in a local GLB copy with Blender. Preserves original input; structural edits of skinned parts are rejected. Upload the inspected result with model.import if needed.", {
    model_path: z12.string(),
    edits: z12.array(z12.object({ action: z12.enum(["merge", "hide", "delete", "split"]), part_names: z12.array(partName).min(1).max(200), name: partName.optional(), face_indices: z12.array(z12.number().int().nonnegative()).min(1).max(1e5).optional() }).strict()).min(1).max(100)
  }, async (ctx, input, taskId) => {
    for (const edit of input.edits) {
      if (["merge", "split"].includes(edit.action) && !edit.name) throw new TripoError("INVALID_INPUT", "Merge/split requires a result name.");
      if (edit.action === "split" && (edit.part_names.length !== 1 || !edit.face_indices)) throw new TripoError("INVALID_INPUT", "Split requires one part and face_indices.");
      if (new Set(edit.part_names).size !== edit.part_names.length) throw new TripoError("INVALID_INPUT", "Duplicate part names.");
    }
    return modelJob(ctx, input, taskId, "edit_parts");
  }, (ctx, task) => blender(ctx, task, task.payload)),
  "local.project_texture": local("Bake viewport edit to part textures", "Project an edited viewport image onto a local GLB using the exact camera matrix/FOV and bake complete per-part UV textures. Face-center ray casting masks occlusion; coarse triangles need inspection. Feed the resulting textures into texture.edit_apply. Requires Blender; no Studio write.", {
    model_path: z12.string(),
    image_path: z12.string(),
    ...viewShape,
    camera_matrix: matrix,
    part_names: z12.array(partName).min(1).max(200).optional(),
    resolution: z12.union([z12.literal(512), z12.literal(1024), z12.literal(2048), z12.literal(4096)]).default(2048),
    strength: z12.number().min(0).max(1).default(1)
  }, async (ctx, input, taskId) => {
    const model = await modelJob(ctx, input, taskId, "project_texture");
    const image = await retainImage(ctx, input.image_path, taskId, 2);
    if (image.metadata.width !== input.viewport_width * 2 || image.metadata.height !== input.viewport_height * 2) throw new TripoError("INVALID_INPUT", "Projection image dimensions must be exactly 2x viewport dimensions.");
    model.snapshots.push(image.provenance);
    model.payload.image_path = image.path;
    return model;
  }, (ctx, task) => blender(ctx, task, task.payload)),
  "local.paint": local("Paint texture with UV brush strokes", "Paint normalized UV brush strokes onto a local texture copy, preserving the original. u/v are in [0,1], v=0 bottom; radius is pixels, RGB is 0\u2013255. Feed the PNG into texture.edit_apply for the corresponding part.", {
    image_path: z12.string(),
    strokes: z12.array(z12.object({ points: z12.array(z12.array(z12.number().min(0).max(1)).length(2)).min(1).max(1e4), radius: z12.number().min(1).max(2048), color: z12.array(z12.number().int().min(0).max(255)).length(3), opacity: z12.number().min(0).max(1).default(1) }).strict()).min(1).max(1e3)
  }, async (ctx, input, taskId) => {
    const image = await retainImage(ctx, input.image_path, taskId);
    return { payload: { image_path: image.path, strokes: input.strokes }, snapshots: [image.provenance] };
  }, async (ctx, task) => {
    const { data, info } = await sharp2(task.payload.image_path, { limitInputPixels: 64 * 1024 * 1024 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const stroke of task.payload.strokes) {
      const mask = new Float32Array(info.width * info.height);
      const stamp = (u, v) => {
        const x = u * (info.width - 1), y = (1 - v) * (info.height - 1), r = stroke.radius;
        for (let py = Math.max(0, Math.floor(y - r)); py <= Math.min(info.height - 1, Math.ceil(y + r)); py++) for (let px = Math.max(0, Math.floor(x - r)); px <= Math.min(info.width - 1, Math.ceil(x + r)); px++) {
          const coverage = Math.max(0, Math.min(1, r + 0.5 - Math.hypot(px - x, py - y))) * stroke.opacity;
          const index = py * info.width + px;
          mask[index] = Math.max(mask[index], coverage);
        }
      };
      for (let i = 0; i < stroke.points.length; i++) {
        const [u, v] = stroke.points[i], previous = stroke.points[i - 1] ?? [u, v];
        const steps = Math.max(1, Math.ceil(Math.hypot((u - previous[0]) * info.width, (v - previous[1]) * info.height) / Math.max(1, stroke.radius / 2)));
        for (let step = 0; step <= steps; step++) stamp(previous[0] + (u - previous[0]) * step / steps, previous[1] + (v - previous[1]) * step / steps);
      }
      for (let pixel = 0; pixel < mask.length; pixel++) if (mask[pixel]) for (let channel = 0; channel < 3; channel++) data[pixel * 4 + channel] = Math.round(data[pixel * 4 + channel] * (1 - mask[pixel]) + stroke.color[channel] * mask[pixel]);
    }
    const dir = path9.join(ctx.config.assetRoot, "operations", task.task_id);
    await mkdir4(dir, { recursive: true });
    const output = path9.join(dir, "painted-texture.png");
    await sharp2(data, { raw: info }).png().toFile(output);
    return { local_result: { image_path: output, width: info.width, height: info.height } };
  }),
  "local.crop": local("Crop image copy", "Crop a local image to an explicit pixel rectangle without changing its source; Studio automatic subject cutout is image.split.", {
    image_path: z12.string(),
    left: z12.number().int().nonnegative(),
    top: z12.number().int().nonnegative(),
    width: z12.number().int().min(1).max(16384),
    height: z12.number().int().min(1).max(16384)
  }, async (ctx, input, taskId) => {
    const image = await retainImage(ctx, input.image_path, taskId);
    if (input.left + input.width > image.metadata.width || input.top + input.height > image.metadata.height) throw new TripoError("INVALID_INPUT", "Crop rectangle is outside the image.");
    return { payload: { image_path: image.path, rectangle: { left: input.left, top: input.top, width: input.width, height: input.height } }, snapshots: [image.provenance] };
  }, async (ctx, task) => {
    const dir = path9.join(ctx.config.assetRoot, "operations", task.task_id);
    await mkdir4(dir, { recursive: true });
    const output = path9.join(dir, "cropped-image.png");
    await sharp2(task.payload.image_path).extract(task.payload.rectangle).png().toFile(output);
    return { local_result: { image_path: output } };
  })
};

// src/ops/registry.mjs
var OPERATIONS = {
  ...imageOperations,
  ...modelOperations,
  ...postprocessOperations,
  ...studioExtraOperations,
  ...localEditingOperations
};
function getOperation(kind) {
  const operation = OPERATIONS[kind];
  if (!operation) {
    throw new TripoError("UNSUPPORTED_CAPABILITY", `Unknown operation kind: ${kind}`, { stage: "operation_registry" });
  }
  return operation;
}
function operationCatalog() {
  return Object.entries(OPERATIONS).map(([kind, operation]) => ({
    category: operation.category,
    consumes_credits: operation.consumesCredits,
    description: operation.description,
    kind,
    title: operation.title
  }));
}

// src/ops/service.mjs
import { z as z14 } from "zod";

// src/util/misc.mjs
import { createHash as createHash6, randomUUID as randomUUID2 } from "node:crypto";
function hashObject(value) {
  return createHash6("sha256").update(stableStringify(value), "utf8").digest("hex");
}
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}
function uuid() {
  return randomUUID2();
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function isoNow() {
  return (/* @__PURE__ */ new Date()).toISOString();
}

// src/ops/task-groups.mjs
import { z as z13 } from "zod";
var characterName = z13.string().trim().min(1).max(80).refine((s) => !/[\u0000-\u001f\u007f]/.test(s), "Character name must be a readable single line.");
var taskContextShape = {
  character_name: characterName.optional().describe("AI: when creating work for a character, always supply its concise canonical name from user context (e.g. \u6D3E\u8499). Reuse that name across images, modeling, textures, rigging and exports. Local character metadata for asset-library grouping; never sent to Studio. Omit when no single character is known."),
  parent_task_id: z13.string().uuid().optional().describe("Source plugin task id. Follow-up tasks inherit its character group unless character_name explicitly overrides it.")
};
var UNGROUPED = "ungrouped";
var normalizedCharacter = (name) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
function characterGroup(name, account, assignedBy = "explicit", sourceTaskId) {
  name = characterName.parse(name.normalize("NFKC").replace(/\s+/g, " "));
  return { id: `char_${hashObject({ name: normalizedCharacter(name), account }).slice(0, 24)}`, name, assigned_by: assignedBy, ...sourceTaskId ? { source_task_id: sourceTaskId } : {} };
}
function labeledCharacter(input) {
  for (const text of [input.prompt, input.name]) {
    if (typeof text !== "string") continue;
    const match = text.match(/(?:^|\n)\s*(?:角色|角色名|character(?: name)?)\s*[:：]\s*([^\n,，。;；:：]{1,80})(?=$|[\n,，。;；:：])/i);
    const name = match?.[1]?.trim();
    if (name && !/[、/&+＋]/.test(name) && characterName.safeParse(name).success) return name;
  }
  return null;
}
function references(input) {
  const refs = /* @__PURE__ */ new Map();
  const add = (kind, value) => {
    if (typeof value === "string" && value) refs.set(`${kind}:${value}`, true);
  };
  const walk = (obj) => {
    if (!obj || typeof obj !== "object") return;
    for (const [key, value] of Object.entries(obj)) {
      if (["project_id", "asset_id", "motion_asset_id", "candidate_operator_id"].includes(key)) add(key, value);
      else if (key.endsWith("_path")) add("path", value);
      else if (key === "image_paths" && Array.isArray(value)) value.forEach((v) => add("path", v));
      else if (typeof value === "object") walk(value);
    }
  };
  walk(input);
  return refs;
}
function outputReferences(record) {
  const refs = references({ ...record.remote ?? {}, ...record.result ?? {} });
  for (const ids of [record.remote?.project_ids, record.result?.project_ids]) for (const id3 of ids ?? []) refs.set(`project_id:${id3}`, true);
  for (const file of record.downloads ?? []) {
    refs.set(`path:${file.path}`, true);
    if (file.blender_path) refs.set(`path:${file.blender_path}`, true);
  }
  return refs;
}
async function resolveCharacterGroup(store, input, account, { name, parentTaskId } = {}) {
  let parent;
  if (parentTaskId) {
    parent = await store.get(parentTaskId);
    if (account !== "local" && parent.account_fingerprint !== "local" && parent.account_fingerprint !== account) throw new TripoError("PLAN_MISMATCH", "Source task belongs to another Studio account.", { stage: "task_group" });
  }
  const explicit = name === void 0 ? null : characterGroup(name, account);
  if (explicit && parent) return { group: parent.character_group && normalizedCharacter(parent.character_group.name) === normalizedCharacter(explicit.name) ? { ...parent.character_group, assigned_by: "explicit", source_task_id: parent.task_id } : explicit, parentTaskId };
  if (parent?.character_group) return { group: { ...parent.character_group, assigned_by: "inherited", source_task_id: parent.task_id }, parentTaskId };
  if (parent) return { group: null, parentTaskId };
  const refs = references(input);
  if (refs.size) {
    const matches = /* @__PURE__ */ new Map();
    for (const record of await store.list({ limit: 5e3 })) {
      if (!record.character_group || account !== "local" && !["local", account].includes(record.account_fingerprint)) continue;
      if (explicit && normalizedCharacter(record.character_group.name) !== normalizedCharacter(explicit.name)) continue;
      if (![...outputReferences(record).keys()].some((ref) => refs.has(ref))) continue;
      if (!matches.has(record.character_group.id)) matches.set(record.character_group.id, record);
    }
    if (matches.size === 1) {
      const source = [...matches.values()][0];
      return { group: { ...source.character_group, assigned_by: explicit ? "explicit" : "inherited", source_task_id: source.task_id }, parentTaskId: parentTaskId ?? source.task_id };
    }
    if (matches.size > 1 && !explicit) return { group: null, parentTaskId, warning: "Sources refer to multiple character groups. Supply character_name to choose the intended character." };
  }
  if (explicit) return { group: explicit, parentTaskId };
  const inferred = labeledCharacter(input);
  return { group: inferred ? characterGroup(inferred, account, "inferred") : null, parentTaskId };
}
function summarizeGroups(records) {
  const groups = /* @__PURE__ */ new Map();
  for (const task of records) {
    const group = task.character_group, id3 = group?.id ?? UNGROUPED;
    if (!groups.has(id3)) groups.set(id3, { id: id3, name: group?.name ?? "\u672A\u5206\u7EC4", total: 0, active: 0, statuses: {}, latest_at: task.created_at });
    const summary = groups.get(id3);
    summary.total++;
    summary.statuses[task.status] = (summary.statuses[task.status] ?? 0) + 1;
    if (["dispatching", "queued", "running", "waiting_for_auth"].includes(task.status)) summary.active++;
  }
  return [...groups.values()];
}

// src/ops/service.mjs
var CONTRACT_VERSION = "tripo-studio-plugin-v1";
var RECONCILE_CONFIRMATION = "ADOPT_REMOTE_IDS";
var TERMINAL = /* @__PURE__ */ new Set(["succeeded", "failed", "canceled", "outcome_unknown", "expired"]);
function event(type, detail) {
  return { at: isoNow(), detail: detail ?? null, type };
}
function stripUrls(value) {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return { url_available: true };
  if (Array.isArray(value)) return value.map(stripUrls);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if ((key === "url" || key.endsWith("_url")) && typeof entry === "string") {
        out[`${key}_available`] = entry.length > 0;
        continue;
      }
      out[key] = stripUrls(entry);
    }
    return out;
  }
  return value;
}
function publicTask(record) {
  const consumesCredits = record.consumes_credits ?? getOperation(record.kind).consumesCredits;
  const output = {
    account_fingerprint: record.account_fingerprint,
    created_at: record.created_at,
    dispatch_state: record.dispatch_state,
    expires_at: record.expires_at ?? null,
    kind: record.kind,
    consumes_credits: consumesCredits,
    cost_estimate: record.cost_estimate ?? null,
    paid_request_sent: record.dispatch_started_at !== void 0 && consumesCredits,
    request_hash: record.request_hash,
    revision: record.revision ?? 0,
    status: record.status,
    task_id: record.task_id,
    updated_at: record.updated_at,
    character_group: record.character_group ?? null,
    ...record.confirmation === void 0 ? {} : { confirmation: record.confirmation },
    ...record.remote === null ? { remote: null } : { remote: stripUrls(record.remote ?? null) },
    ...record.progress === void 0 ? {} : { progress: stripUrls(record.progress) },
    ...record.result === void 0 ? {} : { result: stripUrls(record.result) },
    ...record.error === void 0 ? {} : { error: record.error },
    ...record.warnings?.length ? { warnings: record.warnings } : {},
    ...record.parent_task_id ? { parent_task_id: record.parent_task_id } : {},
    ...record.workflow_id ? { workflow_id: record.workflow_id } : {},
    metadata: redactDeep(record.metadata ?? {}),
    effective_settings: record.settings ?? null,
    snapshots: (record.snapshots ?? []).map((s) => ({
      format: s.format,
      height: s.height ?? null,
      label: s.label,
      sha256: s.sha256,
      size_bytes: s.size_bytes,
      slot: s.slot,
      source_name: s.source_name,
      width: s.width ?? null
    })),
    input_summary: redactDeep(record.input_summary ?? {}),
    downloads: record.downloads ?? []
  };
  return output;
}
var OperationService = class {
  #ctx;
  constructor(ctx) {
    this.#ctx = ctx;
  }
  // Recovery: anything still "dispatching" when the process died crossed the
  // paid boundary without a recorded outcome. It becomes outcome_unknown —
  // never an automatic resubmission.
  async recover() {
    const store = this.#ctx.store;
    let recovered = 0;
    for (const task of await store.listDispatching()) {
      await store.update(task.task_id, (record) => {
        if (record.dispatch_state === "dispatching" && !record.remote) {
          const local2 = getOperation(record.kind).category === "local";
          record.status = local2 ? "failed" : "outcome_unknown";
          record.dispatch_state = local2 ? "rejected" : "outcome_unknown";
          record.error = errorSnapshot(
            new TripoError(local2 ? "LOCAL_INTERRUPTED" : "OUTCOME_UNKNOWN", local2 ? "The local operation was interrupted. Its input snapshots remain intact; stage a new task to run again." : "The previous request crossed the durable dispatch boundary; reconcile it instead of resubmitting.", { stage: "task_recovery" })
          );
          record.events.push(event(local2 ? "recovery.local_interrupted" : "recovery.outcome_unknown"));
        }
        return record;
      }).catch(() => {
      });
      recovered += 1;
    }
    return recovered;
  }
  async prepare(kind, input, options = {}) {
    const operation = getOperation(kind);
    const validated = z14.object({ ...operation.inputShape, ...taskContextShape }).strict().parse(input);
    const { character_name, parent_task_id, ...parsedInput } = validated;
    const accountFingerprint = operation.category === "local" ? "local" : await this.#ctx.session.accountFingerprint();
    const grouping = await resolveCharacterGroup(this.#ctx.store, parsedInput, accountFingerprint, { name: character_name ?? options.characterName, parentTaskId: parent_task_id ?? options.parentTaskId });
    const dedupeKey = hashObject({ account_fingerprint: accountFingerprint, input: stripSubmitFlag(parsedInput), kind });
    const duplicate = await this.#ctx.store.findFirst(
      (record2) => record2.dedupe_key === dedupeKey && record2.account_fingerprint === accountFingerprint && !TERMINAL.has(record2.status)
    );
    if (duplicate) {
      this.#checkDuplicateGroup(duplicate, grouping.group, character_name ?? options.characterName);
      return { deduplicated: true, paid_request_sent: duplicate.dispatch_started_at !== void 0 && operation.consumesCredits, task: publicTask(duplicate) };
    }
    const taskId = uuid();
    const built = await operation.build(this.#ctx, parsedInput, taskId);
    const requestHash = hashObject({
      account_fingerprint: accountFingerprint,
      contract_version: CONTRACT_VERSION,
      consumes_credits: operation.consumesCredits,
      kind,
      payload: built.payload,
      snapshots: (built.snapshots ?? []).map((s) => ({ relative_path: s.relative_path, sha256: s.sha256, slot: s.slot }))
    });
    const existing = await this.#ctx.store.findByRequestHash(requestHash, accountFingerprint);
    if (existing) {
      this.#checkDuplicateGroup(existing, grouping.group, character_name ?? options.characterName);
      return { deduplicated: true, paid_request_sent: existing.dispatch_started_at !== void 0 && operation.consumesCredits, task: publicTask(existing) };
    }
    const now = isoNow();
    const record = {
      account_fingerprint: accountFingerprint,
      contract_version: CONTRACT_VERSION,
      created_at: now,
      dedupe_key: dedupeKey,
      dispatch_state: "none",
      downloads: [],
      events: [event("task.staged")],
      expires_at: new Date(Date.now() + this.#ctx.config.planTtlMs).toISOString(),
      input_summary: inputSummary(parsedInput),
      kind,
      metadata: built.metadata ?? {},
      parent_task_id: grouping.parentTaskId ?? null,
      character_group: grouping.group,
      progress: null,
      remote: null,
      request_hash: requestHash,
      confirmation: `SUBMIT_${kind.replace(/\./g, "_").toUpperCase()}:${requestHash.slice(0, 12).toUpperCase()}`,
      result: void 0,
      revision: 0,
      schema_version: 1,
      consumes_credits: operation.consumesCredits,
      snapshots: built.snapshots ?? [],
      status: "staged",
      task_id: taskId,
      updated_at: now,
      warnings: [...built.warnings ?? [], ...grouping.warning ? [grouping.warning] : []],
      workflow_id: options.workflowId ?? null,
      payload: built.payload,
      settings: built.settings ?? null
    };
    if (this.#ctx.pricing) record.cost_estimate = await this.#ctx.pricing.quote(kind, {}, { task: record });
    const created = await this.#ctx.store.create(record);
    const submitted = input.submit === true ? await this.submit(taskId, { confirmation: record.confirmation, requestHash }) : null;
    return {
      confirmation: record.confirmation,
      deduplicated: false,
      paid_request_sent: Boolean(submitted && operation.consumesCredits),
      request_hash: requestHash,
      task: publicTask(submitted?.task ?? created),
      ...submitted ? { submitted } : {},
      warnings: record.warnings
    };
  }
  #checkDuplicateGroup(task, group, explicitName) {
    if (explicitName !== void 0 && task.character_group?.id !== group?.id) throw new TripoError("TASK_GROUP_CONFLICT", "An identical live task already exists in another group. Use tripo_set_task_character to correct its local grouping; do not dispatch a duplicate.", { stage: "task_group", details: { task_id: task.task_id } });
  }
  async setCharacter(taskId, name) {
    const record = await this.#ctx.store.update(taskId, (current) => {
      current.character_group = name === null ? null : current.character_group && normalizedCharacter(current.character_group.name) === normalizedCharacter(name) ? { ...current.character_group, assigned_by: "manual" } : characterGroup(name, current.account_fingerprint, "manual");
      current.events.push(event("task.character_changed", { character_group: current.character_group }));
      return current;
    });
    return { task: publicTask(record), paid_request_sent: false };
  }
  async listGroups(options = {}) {
    const records = await this.#ctx.store.list({ ...options, limit: 5e3, offset: 0 });
    return { groups: summarizeGroups(records), total: records.length };
  }
  async submit(taskId, input = {}) {
    const store = this.#ctx.store;
    const staged = await store.get(taskId);
    if (staged.status !== "staged") {
      throw new TripoError("STAGING_REQUIRED", `A task in ${staged.status} state cannot be submitted.`, { safeToRetryPaidOperation: false, stage: "task_dispatch" });
    }
    if (Date.now() >= Date.parse(staged.expires_at)) {
      await store.update(taskId, (record) => {
        record.status = "expired";
        record.events.push(event("task.expired"));
        return record;
      }).catch(() => {
      });
      throw new TripoError("PLAN_EXPIRED", "The staged task expired; prepare a new one.", { safeToRetryPaidOperation: true, stage: "task_dispatch" });
    }
    if (input.requestHash !== void 0 && input.requestHash !== staged.request_hash) {
      throw new TripoError("PLAN_MISMATCH", "The supplied request_hash does not match this task.", { safeToRetryPaidOperation: false, stage: "task_dispatch" });
    }
    if (input.confirmation !== void 0 && input.confirmation !== staged.confirmation) {
      throw new TripoError("PLAN_MISMATCH", `The confirmation must be exactly "${staged.confirmation}".`, { safeToRetryPaidOperation: false, stage: "task_dispatch" });
    }
    const accountFingerprint = getOperation(staged.kind).category === "local" ? "local" : await this.#ctx.session.accountFingerprint();
    if (accountFingerprint !== staged.account_fingerprint) {
      throw new TripoError("PLAN_MISMATCH", "The authenticated Studio account differs from the staged task account.", { safeToRetryPaidOperation: false, stage: "task_dispatch" });
    }
    for (const snapshot of staged.snapshots ?? []) {
      await verifySnapshot(this.#ctx.config, taskId, snapshot);
    }
    const operation = getOperation(staged.kind);
    if (operation.beforeSubmit) await operation.beforeSubmit(this.#ctx, staged);
    await store.update(taskId, (record) => {
      if (record.status !== "staged") throw new TripoError("STAGING_REQUIRED", "The task state changed before dispatch.", { stage: "task_dispatch" });
      record.status = "dispatching";
      record.dispatch_state = "dispatching";
      record.dispatch_started_at = isoNow();
      record.events.push(event("dispatch.begin"));
      return record;
    });
    let remote;
    try {
      remote = await operation.submitRemote(this.#ctx, staged);
    } catch (error) {
      const normalized = toTripoError(error, "task_dispatch");
      if (operation.category === "local" || isDefinitiveRemoteRejection(normalized)) {
        const rejected = await store.update(taskId, (record) => {
          record.status = "failed";
          record.dispatch_state = "rejected";
          record.error = errorSnapshot(normalized);
          record.events.push(event("dispatch.rejected", { code: normalized.code }));
          return record;
        }).catch(() => void 0);
        throw Object.assign(normalized, { task: rejected ? publicTask(rejected) : void 0 });
      }
      const unknown = await store.update(taskId, (record) => {
        record.status = "outcome_unknown";
        record.dispatch_state = "outcome_unknown";
        record.error = errorSnapshot(
          new TripoError("OUTCOME_UNKNOWN", "The Studio write may have reached Tripo, but no valid receipt was durably obtained. Do not resubmit; reconcile via tripo_task_reconcile.", { stage: "task_dispatch" })
        );
        record.events.push(event("dispatch.outcome_unknown", { code: normalized.code }));
        return record;
      }).catch(() => void 0);
      const outcomeError = new TripoError("OUTCOME_UNKNOWN", "The Studio write may have reached Tripo, but no valid receipt was durably obtained. Do not resubmit; reconcile via tripo_task_reconcile.", {
        cause: error,
        details: { task_id: taskId },
        safeToRetryPaidOperation: false,
        stage: "task_dispatch"
      });
      if (unknown) outcomeError.task = publicTask(unknown);
      throw outcomeError;
    }
    const submitted = await store.update(taskId, (record) => {
      if (record.dispatch_state !== "dispatching") return record;
      record.dispatch_state = "submitted";
      record.remote = remote;
      record.status = "queued";
      record.events.push(event("dispatch.submitted", stripUrls(redactDeep(remote))));
      return record;
    }).catch((error) => {
      throw new TripoError("OUTCOME_UNKNOWN", "Tripo returned remote IDs but they could not be saved durably. Keep the returned IDs and never resubmit.", {
        cause: error,
        details: { remote: redactDeep(remote) },
        stage: "task_receipt"
      });
    });
    return { paid_request_sent: operation.consumesCredits, remote: stripUrls(redactDeep(remote)), task: publicTask(submitted) };
  }
  async sync(taskId) {
    const store = this.#ctx.store;
    const record = await store.get(taskId);
    if (!record.remote) {
      return { task: publicTask(record) };
    }
    if (TERMINAL.has(record.status)) {
      return { task: publicTask(record) };
    }
    const operation = getOperation(record.kind);
    let remote;
    try {
      remote = await operation.syncRemote(this.#ctx, record);
    } catch (error) {
      const normalized = toTripoError(error, "task_progress");
      if (normalized.code === "AUTH_EXPIRED" || normalized.code === "AUTH_REQUIRED") {
        const waiting = await store.update(taskId, (current) => {
          if (!TERMINAL.has(current.status)) {
            current.status = "waiting_for_auth";
            current.events.push(event("task.waiting_for_auth"));
          }
          return current;
        }).catch(() => record);
        return { task: publicTask(waiting) };
      }
      return { progress_error: errorSnapshot(normalized), task: publicTask(record) };
    }
    const updated = await store.update(taskId, (current) => {
      if (TERMINAL.has(current.status)) return current;
      current.progress = remote.progress ?? current.progress;
      if (remote.result !== void 0) current.result = remote.result;
      const status = remote.status;
      if (status && status !== current.status) {
        current.status = status;
        current.events.push(event(`remote.${status}`, remote.progress ?? null));
      }
      if (status === "failed" && current.error === void 0) {
        current.error = errorSnapshot(new TripoError("REMOTE_FAILED", "The Studio task failed remotely.", { stage: "task_progress" }));
      }
      return current;
    });
    return { task: publicTask(updated) };
  }
  async wait(taskId, timeoutSeconds = 300, pollSeconds = 5) {
    const deadline = Date.now() + timeoutSeconds * 1e3;
    let last;
    while (Date.now() < deadline) {
      last = await this.sync(taskId);
      const status = last.task.status;
      if (["succeeded", "failed", "canceled", "expired", "banned", "outcome_unknown"].includes(status)) {
        return { completed: true, ...last };
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(pollSeconds * 1e3, Math.max(0, deadline - Date.now()))));
    }
    return { completed: false, ...last ?? { task: publicTask(await this.#ctx.store.get(taskId)) } };
  }
  async cancel(taskId) {
    const store = this.#ctx.store;
    const record = await store.get(taskId);
    if (record.dispatch_started_at !== void 0 || !["staged", "dispatching"].includes(record.status)) {
      throw new TripoError("PLAN_NOT_RETRYABLE", `Only a staged (not-yet-submitted) task can be canceled. This task is ${record.status}; already-submitted remote work cannot be withdrawn through Studio.`, {
        safeToRetryPaidOperation: false,
        stage: "task_cancel"
      });
    }
    const cancelled = await store.update(taskId, (current) => {
      current.status = "canceled";
      current.dispatch_state = "rejected";
      current.events.push(event("task.canceled"));
      return current;
    });
    if ((cancelled.snapshots ?? []).length > 0) await removeSnapshots(this.#ctx.config, taskId).catch(() => {
    });
    return { task: publicTask(cancelled) };
  }
  // Adopt confirmed remote IDs into an outcome_unknown task. Requires the
  // exact ADOPT_REMOTE_IDS confirmation plus matching account + project.
  async reconcile(taskId, input) {
    if (input.confirmation !== RECONCILE_CONFIRMATION) {
      throw new TripoError("PLAN_MISMATCH", `Use the exact ${RECONCILE_CONFIRMATION} confirmation.`, { stage: "task_reconcile" });
    }
    const store = this.#ctx.store;
    const current = await store.get(taskId);
    if (current.status !== "outcome_unknown") {
      throw new TripoError("PLAN_NOT_RETRYABLE", "Only an outcome_unknown task can adopt remote IDs.", { stage: "task_reconcile" });
    }
    const accountFingerprint = await this.#ctx.session.accountFingerprint();
    if (current.account_fingerprint !== accountFingerprint) {
      throw new TripoError("PLAN_MISMATCH", "The active Tripo account does not match this task.", { stage: "task_reconcile" });
    }
    const remote = input.remote;
    if (!remote || typeof remote !== "object" || !remote.operator_id && !remote.asset_id && !remote.operator_ids && !remote.motion_task_id) {
      throw new TripoError("INVALID_INPUT", "remote must include operator_id, operator_ids, or asset_id observed in Studio.", { stage: "task_reconcile" });
    }
    if (current.kind === "motion.generate") {
      if (!remote.motion_task_id) throw new TripoError("INVALID_INPUT", "Motion reconciliation requires motion_task_id.");
      const task = await this.#ctx.gateway.getMotionTask(remote.motion_task_id);
      if (task.task_id !== remote.motion_task_id) throw new TripoError("INSUFFICIENT_EVIDENCE", "Motion task identity mismatch.");
    } else if (remote.asset_id) {
      const asset = await this.#ctx.gateway.getStudioImageAsset(remote.asset_id);
      if (asset.asset_id !== remote.asset_id) {
        throw new TripoError("INSUFFICIENT_EVIDENCE", "The supplied asset_id does not identify a Studio image asset.", { stage: "task_reconcile" });
      }
    } else {
      const ids = remote.operator_ids ?? [remote.operator_id];
      const items = await this.#ctx.gateway.getProgress(ids);
      for (const id3 of ids) {
        selectForReconcile(items, id3);
      }
      if (remote.project_id) {
        const project = await this.#ctx.gateway.getProject(remote.project_id, ids[0]);
        if (project.id && project.id !== remote.project_id) {
          throw new TripoError("INSUFFICIENT_EVIDENCE", "The supplied project and operator IDs do not identify the same remote operation.", { stage: "task_reconcile" });
        }
      }
    }
    await store.update(taskId, (current2) => {
      current2.dispatch_state = "submitted";
      current2.remote = remote;
      current2.status = "queued";
      delete current2.error;
      current2.events.push(event("task.reconciled", redactDeep(remote)));
      return current2;
    });
    const synced = await this.sync(taskId);
    return { ...synced, reconciled: true };
  }
  async get(taskId) {
    const record = await this.#ctx.store.get(taskId);
    return { events: stripUrls(record.events ?? []), task: publicTask(record) };
  }
  async list(options = {}) {
    const limit = options.limit ?? 50, offset = options.offset ?? 0;
    const records = await this.#ctx.store.list({ ...options, limit: limit + 1 });
    return { tasks: records.slice(0, limit).map(publicTask), offset, next_offset: records.length > limit ? offset + limit : null };
  }
};
function stripSubmitFlag(input) {
  const { submit, ...rest } = input ?? {};
  return rest;
}
function selectForReconcile(items, operatorId) {
  const exact = items.find((entry) => entry.operator_id === operatorId || entry.id === operatorId);
  if (exact) return exact;
  if (items.length === 1 && items[0]?.operator_id === void 0 && items[0]?.id === void 0) return items[0];
  throw new TripoError("INSUFFICIENT_EVIDENCE", "Tripo progress did not include the supplied operator ID.", { stage: "task_reconcile" });
}
function inputSummary(input) {
  const summary = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (value === void 0 || key === "submit") continue;
    if (typeof value === "string" && value.length > 300) {
      summary[key] = `${value.slice(0, 300)}\u2026`;
    } else if (Array.isArray(value) && value.length > 12) {
      summary[key] = `${value.length} items`;
    } else {
      summary[key] = value;
    }
  }
  return summary;
}

// src/runtime.mjs
import { mkdir as mkdir8 } from "node:fs/promises";

// src/auth/coordinator.mjs
import { execFile } from "node:child_process";

// src/store/lock.mjs
import { mkdir as mkdir5, open as open3, readFile as readFile7, rm as rm2, stat as stat6, writeFile as writeFile4 } from "node:fs/promises";
import path10 from "node:path";
import { randomUUID as randomUUID3 } from "node:crypto";
var FileLock = class {
  #dir;
  constructor(locksDir) {
    this.#dir = locksDir;
  }
  async acquire(name, { timeoutMs = 3e4, staleMs = 12e4 } = {}) {
    if (!/^[a-z0-9][a-z0-9_-]{0,62}$/i.test(name)) throw new Error(`Invalid lock name: ${name}`);
    const lockPath = path10.join(this.#dir, `${name}.lock`);
    const ownerPath = path10.join(lockPath, "owner.json");
    const owner = { id: randomUUID3(), pid: process.pid, at: (/* @__PURE__ */ new Date()).toISOString() };
    const deadline = Date.now() + timeoutMs;
    await mkdir5(this.#dir, { recursive: true });
    for (; ; ) {
      try {
        await mkdir5(lockPath);
        await writeFile4(ownerPath, `${JSON.stringify(owner)}
`, { mode: 384 });
        return this.#handle(lockPath, ownerPath, owner.id);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        if (await this.#reclaimIfStale(lockPath, ownerPath, staleMs)) continue;
        if (Date.now() >= deadline) {
          const err2 = new Error(`Timed out acquiring lock ${name}.`);
          err2.code = "LOCK_TIMEOUT";
          throw err2;
        }
        await delay(80 + Math.floor(Math.random() * 70));
      }
    }
  }
  async #reclaimIfStale(lockPath, ownerPath, staleMs) {
    try {
      const owner = JSON.parse(await readFile7(ownerPath, "utf8"));
      const info = await stat6(lockPath);
      const ageMs = Date.now() - Math.max(info.mtimeMs, Date.parse(owner.at ?? "") || 0);
      const alive = typeof owner.pid === "number" && process.kill(owner.pid, 0) !== false;
      if (alive && ageMs < staleMs) return false;
      await rm2(lockPath, { force: true, recursive: true });
      return true;
    } catch (error) {
      if (error?.code === "ENOENT") return true;
      if (error?.code === "ESRCH") {
        await rm2(lockPath, { force: true, recursive: true }).catch(() => {
        });
        return true;
      }
      if (error?.code === "EPERM") return false;
      try {
        const info = await stat6(lockPath);
        if (Date.now() - info.mtimeMs > staleMs) {
          await rm2(lockPath, { force: true, recursive: true });
          return true;
        }
      } catch {
      }
      return false;
    }
  }
  #handle(lockPath, ownerPath, id3) {
    let released = false;
    return {
      id: id3,
      release: async () => {
        if (released) return;
        released = true;
        await rm2(lockPath, { force: true, recursive: true }).catch(() => {
        });
      },
      [Symbol.asyncDispose]: async () => {
        if (!released) {
          released = true;
          await rm2(lockPath, { force: true, recursive: true }).catch(() => {
          });
        }
      }
    };
  }
  async withLock(name, fn, options) {
    const lock = await this.acquire(name, options);
    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }
};

// src/auth/cookies.mjs
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createDecipheriv, createHash as createHash7, pbkdf2Sync } from "node:crypto";
import os from "node:os";
import path11 from "node:path";
var TRIPO_COOKIE_NAMES = ["ory_kratos_session", "tripo_device_id"];
var DatabaseSync;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {
  DatabaseSync = null;
}
function sqliteRows(dbPath, sql) {
  if (DatabaseSync) {
    const db = new DatabaseSync(dbPath, { readOnly: true, readBigInts: true });
    try {
      return db.prepare(sql).all();
    } finally {
      db.close();
    }
  }
  const out = execFileSync("sqlite3", ["-json", dbPath, sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out || "[]");
}
function chromiumBrowserRoots(platform, env) {
  const home = os.homedir();
  const roots = [];
  const push = (name, rel, keychainLabel) => {
    const dir = platform === "darwin" || platform === "linux" || platform === "win32" ? path11.join(home, rel) : null;
    if (dir) roots.push({ name, dir, keychainLabel });
  };
  if (platform === "darwin") {
    const as = (rel) => path11.join("Library", "Application Support", rel);
    push("chrome", as(path11.join("Google", "Chrome")), "Chrome Safe Storage");
    push("chrome-beta", as(path11.join("Google", "Chrome Beta")), "Chrome Safe Storage");
    push("chromium", as("Chromium"), "Chromium Safe Storage");
    push("edge", as("Microsoft Edge"), "Microsoft Edge Safe Storage");
    push("brave", as(path11.join("BraveSoftware", "Brave-Browser")), "Brave Safe Storage");
    push("arc", as(path11.join("Arc", "User Data")), "Arc Safe Storage");
    push("vivaldi", as("Vivaldi"), "Vivaldi Safe Storage");
  } else if (platform === "linux") {
    const cfg = (rel) => path11.join(".config", rel);
    push("chrome", cfg("google-chrome"), "Chrome Safe Storage");
    push("chromium", cfg("chromium"), "Chromium Safe Storage");
    push("edge", cfg("microsoft-edge"), "Microsoft Edge Safe Storage");
    push("brave", cfg(path11.join("BraveSoftware", "Brave-Browser")), "Brave Safe Storage");
  }
  if (env?.TRIPO_BROWSER_PROFILE_DIR) {
    roots.push({ name: "custom", dir: path11.resolve(env.TRIPO_BROWSER_PROFILE_DIR), keychainLabel: "Chrome Safe Storage" });
  }
  return roots;
}
function firefoxRoots(platform, env) {
  const home = os.homedir();
  if (platform === "darwin") return [path11.join(home, "Library", "Application Support", "Firefox", "Profiles")];
  if (platform === "linux") return [path11.join(home, ".mozilla", "firefox"), path11.join(home, "snap", "firefox", "common", ".mozilla", "firefox")];
  if (platform === "win32") return [path11.join(env?.APPDATA ?? path11.join(home, "AppData", "Roaming"), "Mozilla", "Firefox", "Profiles")];
  return [];
}
function profileCookieDbs(rootDir) {
  const dbs = [];
  const candidates = [rootDir];
  try {
    for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
      if (entry.isDirectory()) candidates.push(path11.join(rootDir, entry.name));
    }
  } catch {
    return dbs;
  }
  for (const dir of candidates) {
    for (const rel of ["Cookies", path11.join("Network", "Cookies")]) {
      const dbPath = path11.join(dir, rel);
      if (existsSync(dbPath)) dbs.push({ dbPath, profile: path11.basename(dir) });
    }
  }
  return dbs;
}
function safeStorageKey(label) {
  try {
    const password = execFileSync("security", ["find-generic-password", "-l", label, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 15e3
    }).trim();
    if (password) return pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
  } catch {
  }
  return null;
}
function linuxFallbackKey() {
  return pbkdf2Sync("peanuts", "saltysalt", 1, 16, "sha1");
}
function decryptChromiumValue(encryptedHex, hostKey, keys) {
  const raw = Buffer.from(encryptedHex, "hex");
  if (raw.length < 3 + 16) return null;
  const version = raw.subarray(0, 3).toString("latin1");
  if (version !== "v10" && version !== "v11") return null;
  for (const key of keys) {
    try {
      const decipher = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 32));
      decipher.setAutoPadding(false);
      let plain = Buffer.concat([decipher.update(raw.subarray(3)), decipher.final()]);
      const pad = plain[plain.length - 1];
      if (pad < 1 || pad > 16) continue;
      plain = plain.subarray(0, plain.length - pad);
      if (plain.length > 32 && plain.subarray(0, 32).equals(createHash7("sha256").update(hostKey).digest())) {
        plain = plain.subarray(32);
      }
      const value = plain.toString("utf8");
      if (value && !/[\u0000-\u001f]/.test(value)) return value;
    } catch {
    }
  }
  return null;
}
function* copyDbForRead(dbPath) {
  const dir = mkdtempSync(path11.join(os.tmpdir(), "tripo-cookies-"));
  const target = path11.join(dir, "Cookies");
  try {
    for (const suffix of ["", "-wal", "-shm", "-journal"]) {
      const src = dbPath + suffix;
      if (existsSync(src)) copyFileSync(src, target + suffix);
    }
    yield target;
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}
function chromiumCookies(env) {
  const platform = process.platform;
  const results = [];
  for (const browser of chromiumBrowserRoots(platform, env)) {
    if (!existsSync(browser.dir)) continue;
    let keys = null;
    for (const { dbPath, profile } of profileCookieDbs(browser.dir)) {
      let rows;
      try {
        for (const copy of copyDbForRead(dbPath)) {
          rows = sqliteRows(
            copy,
            `SELECT host_key, name, value, hex(encrypted_value) AS encrypted_hex, expires_utc FROM cookies WHERE name IN (${TRIPO_COOKIE_NAMES.map((n) => `'${n}'`).join(",")}) AND host_key LIKE '%tripo3d.ai'`
          );
        }
      } catch {
        continue;
      }
      if (!rows?.length) continue;
      if (keys === null) {
        keys = [];
        if (platform === "darwin") {
          const key = safeStorageKey(browser.keychainLabel);
          if (key) keys.push(key);
          if (browser.keychainLabel !== "Chromium Safe Storage") {
            const alt = safeStorageKey("Chromium Safe Storage");
            if (alt) keys.push(alt);
          }
        } else if (platform === "linux") {
          keys.push(linuxFallbackKey());
          const key = safeStorageKey(browser.keychainLabel);
          if (key) keys.push(key);
        }
      }
      for (const row of rows) {
        const expiresUtc = Number(row.expires_utc ?? 0);
        const expiresAtMs = expiresUtc > 0 ? Math.round(expiresUtc / 1e3) - 116444736e5 : null;
        let value = typeof row.value === "string" && row.value !== "" ? row.value : null;
        if (!value && row.encrypted_hex) {
          value = decryptChromiumValue(row.encrypted_hex, row.host_key, keys);
        }
        if (value) {
          results.push({
            browser: browser.name,
            profile,
            name: row.name,
            value,
            host: row.host_key,
            expiresAtMs,
            sourcePath: dbPath
          });
        }
      }
    }
  }
  return results;
}
function firefoxCookies(env) {
  const results = [];
  for (const root of firefoxRoots(process.platform, env)) {
    if (!existsSync(root)) continue;
    let profiles;
    try {
      profiles = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of profiles) {
      if (!entry.isDirectory()) continue;
      const dbPath = path11.join(root, entry.name, "cookies.sqlite");
      if (!existsSync(dbPath)) continue;
      let rows;
      try {
        for (const copy of copyDbForRead(dbPath)) {
          rows = sqliteRows(
            copy,
            `SELECT host AS host_key, name, value, expiry FROM moz_cookies WHERE name IN (${TRIPO_COOKIE_NAMES.map((n) => `'${n}'`).join(",")}) AND host LIKE '%tripo3d.ai'`
          );
        }
      } catch {
        continue;
      }
      for (const row of rows ?? []) {
        if (typeof row.value !== "string" || row.value === "") continue;
        results.push({
          browser: "firefox",
          profile: entry.name,
          name: row.name,
          value: row.value,
          host: row.host_key,
          expiresAtMs: Number(row.expiry ?? 0) > 0 ? Number(row.expiry) * 1e3 : null,
          sourcePath: dbPath
        });
      }
    }
  }
  return results;
}
function extractTripoCookies(env = process.env) {
  const all = [...chromiumCookies(env), ...firefoxCookies(env)];
  all.sort((a, b) => (b.expiresAtMs ?? 0) - (a.expiresAtMs ?? 0));
  return all;
}
function sessionCandidates(env = process.env) {
  const byValue = /* @__PURE__ */ new Map();
  const devices = /* @__PURE__ */ new Map();
  for (const cookie of extractTripoCookies(env)) {
    if (cookie.name === "tripo_device_id" && !devices.has(cookie.value)) devices.set(cookie.value, cookie.value);
    if (cookie.name !== "ory_kratos_session") continue;
    if (cookie.expiresAtMs !== null && cookie.expiresAtMs <= Date.now()) continue;
    if (!byValue.has(cookie.value)) {
      byValue.set(cookie.value, {
        cookie: cookie.value,
        browser: cookie.browser,
        expiresAtMs: cookie.expiresAtMs
      });
    }
  }
  const candidates = [...byValue.values()];
  const deviceId = [...devices.values()][0];
  for (const candidate of candidates) candidate.deviceId = deviceId;
  return candidates;
}

// src/auth/coordinator.mjs
var LOGIN_WAIT_MS = 10 * 60 * 1e3;
var POLL_INTERVAL_MS = 2500;
var WHOAMI_URL = "https://auth.tripo3d.ai/sessions/whoami";
var VERIFY_PATH = "/v2/studio/user/profile/payment";
function openInDefaultBrowser(url) {
  return new Promise((resolve) => {
    const [cmd, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
    execFile(cmd, args, { timeout: 15e3 }, (error) => resolve(!error));
  });
}
async function verifyCookie(config, cookieValue) {
  const headers = {
    accept: "application/json",
    cookie: `ory_kratos_session=${cookieValue}`,
    origin: config.studioOrigin,
    referer: `${config.studioOrigin}/`,
    "x-tripo-device-id": config.deviceId,
    "x-tripo-region": "rg1"
  };
  try {
    const response = await fetch(`${config.apiBaseUrl}${VERIFY_PATH}`, { headers, redirect: "error" });
    if (response.status !== 200) return null;
    const envelope = await response.json().catch(() => null);
    if (!envelope || envelope.code !== 0) return null;
  } catch {
    return null;
  }
  let identityId;
  let expiresAtMs;
  try {
    const whoami = await fetch(WHOAMI_URL, { headers: { cookie: `ory_kratos_session=${cookieValue}` }, redirect: "error" });
    if (whoami.status === 200) {
      const session = await whoami.json().catch(() => null);
      identityId = session?.identity?.id ?? session?.identity?.traits?.subId ?? void 0;
      const parsedExpiry = Date.parse(session?.expires_at ?? "");
      if (Number.isFinite(parsedExpiry)) expiresAtMs = parsedExpiry;
    }
  } catch {
  }
  return { expiresAtMs, identityId };
}
var AuthCoordinator = class {
  #config;
  #session;
  #lock;
  constructor(config, session) {
    this.#config = config;
    this.#session = session;
    this.#lock = new FileLock(`${config.dataDir}/locks`);
  }
  // Full login: reuse an already-valid browser session when present,
  // otherwise open the default browser at Studio and wait (up to ten
  // minutes) for a session cookie to appear in the browser's cookie store.
  async login() {
    return await this.#lock.withLock("auth", async () => {
      const reused = await this.#tryCandidates(/* @__PURE__ */ new Set());
      if (reused) return await this.#session.status();
      const opened = await openInDefaultBrowser(STUDIO_WORKSPACE_URL);
      const rejected = /* @__PURE__ */ new Set();
      const deadline = Date.now() + LOGIN_WAIT_MS;
      while (Date.now() < deadline) {
        const captured = await this.#tryCandidates(rejected);
        if (captured) return await this.#session.status();
        await delay(POLL_INTERVAL_MS);
      }
      throw new TripoError(
        "AUTH_REQUIRED",
        `No usable Tripo Studio session appeared in the browser cookie store${opened ? "" : " (and the browser could not be opened automatically \u2014 open https://studio.tripo3d.ai/ and sign in)"}. Sign in with your normal browser; the plugin picks the session up automatically.`,
        { stage: "authentication" }
      );
    });
  }
  // Silent refresh: re-read the browser cookie stores and adopt any valid
  // session. Runs entirely headless — succeeds while the user stays logged
  // into Tripo Studio in any supported browser on this machine.
  async refresh() {
    try {
      return await this.#lock.withLock(
        "auth",
        async () => {
          const status = await this.#session.status();
          if (status.authenticated && (status.expires_in_seconds === null || status.expires_in_seconds > 300)) return true;
          return await this.#tryCandidates(/* @__PURE__ */ new Set());
        },
        { timeoutMs: 9e4 }
      );
    } catch (error) {
      if (error.code === "LOCK_TIMEOUT") return false;
      throw error;
    }
  }
  // Recovery hook used by the HTTP layer on 401/403/AUTH_REQUIRED.
  async recover({ reason } = {}) {
    const ok2 = await this.refresh();
    if (!ok2) {
      throw new TripoError("AUTH_REQUIRED", `Tripo Studio session refresh failed (${reason ?? "auth"}). Run tripo_auth_login and sign in once in your browser.`, {
        nextAction: "tripo_auth_login",
        stage: "authentication"
      });
    }
    return true;
  }
  async importCookie(cookieValue) {
    return await this.#lock.withLock("auth", async () => {
      const verified = await verifyCookie(this.#config, cookieValue);
      if (!verified) {
        throw new TripoError("AUTH_CAPTURE_FAILED", "The provided Tripo Studio session cookie was rejected by the API.", { stage: "authentication" });
      }
      await this.#session.set({ cookie: cookieValue, source: "imported", ...verified });
      return await this.#session.status();
    });
  }
  async logout() {
    return await this.#lock.withLock("auth", async () => {
      await this.#session.clear();
      return { logged_out: true };
    });
  }
  async #tryCandidates(rejected) {
    for (const candidate of sessionCandidates(process.env)) {
      if (rejected.has(candidate.cookie)) continue;
      const verified = await verifyCookie(this.#config, candidate.cookie);
      if (!verified) {
        rejected.add(candidate.cookie);
        continue;
      }
      await this.#session.set({
        cookie: candidate.cookie,
        deviceId: candidate.deviceId,
        expiresAtMs: verified.expiresAtMs ?? candidate.expiresAtMs,
        identityId: verified.identityId,
        source: `cookie_store:${candidate.browser}`
      });
      return true;
    }
    return false;
  }
};

// src/auth/session.mjs
import { Buffer as Buffer2 } from "node:buffer";
import { createHash as createHash8 } from "node:crypto";
import path13 from "node:path";

// src/store/jsondoc.mjs
import { mkdir as mkdir6, open as open4, readFile as readFile8, rename, unlink as unlink2 } from "node:fs/promises";
import path12 from "node:path";
import { randomUUID as randomUUID4 } from "node:crypto";
var JsonDocument = class {
  #file;
  #mutation = Promise.resolve();
  constructor(file) {
    this.#file = path12.resolve(file);
  }
  get file() {
    return this.#file;
  }
  async read(fallback) {
    let text;
    try {
      text = await readFile8(this.#file, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return typeof fallback === "function" ? fallback() : fallback;
      throw new TripoError("PERSISTENCE_ERROR", `Could not read ${path12.basename(this.#file)}.`, { cause: error });
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new TripoError("PERSISTENCE_ERROR", `${path12.basename(this.#file)} is not valid JSON.`, { cause: error });
    }
  }
  async write(value) {
    await mkdir6(path12.dirname(this.#file), { recursive: true });
    const temporary = path12.join(path12.dirname(this.#file), `.${path12.basename(this.#file)}.${randomUUID4()}.tmp`);
    let handle;
    try {
      handle = await open4(temporary, "wx", 384);
      await handle.writeFile(`${JSON.stringify(value)}
`, "utf8");
      await handle.sync();
      await handle.close();
      handle = void 0;
      await rename(temporary, this.#file);
      if (process.platform !== "win32") {
        const directory = await open4(path12.dirname(this.#file), "r");
        try {
          await directory.sync();
        } finally {
          await directory.close();
        }
      }
    } catch (error) {
      throw new TripoError("PERSISTENCE_ERROR", `Could not durably update ${path12.basename(this.#file)}.`, { cause: error });
    } finally {
      await handle?.close().catch(() => {
      });
      await unlink2(temporary).catch(() => {
      });
    }
  }
  async update(mutator, fallback) {
    const previous = this.#mutation;
    let release;
    this.#mutation = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const current = await this.read(fallback);
      const next = await mutator(current);
      await this.write(next);
      return next;
    } finally {
      release();
    }
  }
  async remove() {
    await unlink2(this.#file).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
};

// src/auth/session.mjs
var EXPIRY_GUARD_MS = 6e4;
function decodeJwtPayload(token) {
  const parts = token.split(".");
  const payload = parts[1];
  if (parts.length !== 3 || !payload) {
    throw new TripoError("AUTH_CAPTURE_FAILED", "Captured bearer value is not a JWT.", { stage: "authentication" });
  }
  try {
    return JSON.parse(Buffer2.from(payload, "base64url").toString("utf8"));
  } catch (error) {
    throw new TripoError("AUTH_CAPTURE_FAILED", "Captured JWT payload is invalid.", { cause: error, stage: "authentication" });
  }
}
function normalizeBearerToken(value) {
  const token = value.trim().replace(/^Bearer\s+/i, "").trim();
  const payload = decodeJwtPayload(token);
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
    throw new TripoError("AUTH_CAPTURE_FAILED", "Captured JWT does not include a numeric expiration.", { stage: "authentication" });
  }
  const identity = [
    ["sub", payload.sub],
    ["user_id", payload.user_id],
    ["userId", payload.userId],
    ["uid", payload.uid],
    ["account_id", payload.account_id]
  ].find((entry) => {
    const v = entry[1];
    return typeof v === "string" && v.trim().length > 0 || typeof v === "number" && Number.isFinite(v);
  });
  if (!identity) {
    throw new TripoError("AUTH_CAPTURE_FAILED", "Captured JWT does not include a stable account identifier.", { stage: "authentication" });
  }
  return {
    accountFingerprint: createHash8("sha256").update(JSON.stringify(identity)).digest("hex"),
    expiresAtMs: payload.exp * 1e3,
    token
  };
}
function fingerprintFromIdentityId(identityId, cookieValue) {
  if (typeof identityId === "string" && identityId.trim()) {
    return createHash8("sha256").update(`kratos:${identityId.trim()}`).digest("hex");
  }
  return createHash8("sha256").update(`cookie:${cookieValue}`).digest("hex");
}
var SessionManager = class {
  #config;
  #doc;
  #session;
  #loaded = false;
  constructor(config) {
    this.#config = config;
    this.#doc = new JsonDocument(path13.join(config.dataDir, "session.json"));
  }
  async #ensureLoaded() {
    if (this.#loaded) return;
    this.#loaded = true;
    const stored = await this.#doc.read(void 0);
    if (!stored || typeof stored !== "object") return;
    try {
      if (stored.kind === "cookie" && typeof stored.cookie === "string") {
        if (stored.expires_at_ms && Date.now() >= stored.expires_at_ms - EXPIRY_GUARD_MS) return;
        this.#session = {
          kind: "cookie",
          cookie: stored.cookie,
          accountFingerprint: stored.account_fingerprint ?? fingerprintFromIdentityId(null, stored.cookie),
          deviceId: typeof stored.device_id === "string" ? stored.device_id : this.#config.deviceId,
          region: "rg1",
          expiresAtMs: stored.expires_at_ms ?? null,
          source: stored.source ?? "persisted"
        };
        return;
      }
      if (typeof stored.token === "string") {
        const normalized = normalizeBearerToken(stored.token);
        if (Date.now() >= normalized.expiresAtMs - EXPIRY_GUARD_MS) return;
        if (stored.account_fingerprint && stored.account_fingerprint !== normalized.accountFingerprint) return;
        this.#session = {
          kind: "bearer",
          ...normalized,
          deviceId: typeof stored.device_id === "string" ? stored.device_id : this.#config.deviceId,
          region: typeof stored.region === "string" ? stored.region : "rg1",
          source: "persisted"
        };
      }
    } catch {
    }
  }
  async status() {
    await this.#ensureLoaded();
    const session = this.#session;
    const expired = session?.expiresAtMs != null && Date.now() >= session.expiresAtMs - EXPIRY_GUARD_MS;
    if (!session || expired) {
      return { authenticated: false, kind: null, device_id_available: false, expires_at: null, expires_in_seconds: null, source: null };
    }
    return {
      authenticated: true,
      kind: session.kind,
      device_id_available: Boolean(session.deviceId),
      expires_at: session.expiresAtMs != null ? new Date(session.expiresAtMs).toISOString() : null,
      expires_in_seconds: session.expiresAtMs != null ? Math.max(0, Math.floor((session.expiresAtMs - Date.now()) / 1e3)) : null,
      source: session.source
    };
  }
  async accountFingerprint() {
    await this.#ensureLoaded();
    await this.#require();
    return this.#session.accountFingerprint;
  }
  activeAccountFingerprint() {
    return this.#session?.accountFingerprint ?? null;
  }
  async getRequestIdentity() {
    await this.#ensureLoaded();
    const session = await this.#require();
    return {
      accountFingerprint: session.accountFingerprint,
      ...session.kind === "bearer" ? { authorization: `Bearer ${session.token}` } : { cookie: `ory_kratos_session=${session.cookie}` },
      deviceId: session.deviceId,
      region: session.region
    };
  }
  isCurrentSessionIdentity(identity) {
    const session = this.#session;
    if (!session) return false;
    if (session.expiresAtMs != null && Date.now() >= session.expiresAtMs - EXPIRY_GUARD_MS) return false;
    const sameCredential = session.kind === "bearer" ? `Bearer ${session.token}` === identity.authorization : `ory_kratos_session=${session.cookie}` === identity.cookie;
    return session.accountFingerprint === identity.accountFingerprint && sameCredential && session.deviceId === identity.deviceId && session.region === identity.region;
  }
  // captured: { cookie, deviceId, region, expiresAtMs, identityId, source }
  //        or { authorization, deviceId, region, source } for a raw JWT.
  async set(captured, { persist = true } = {}) {
    let session;
    if (typeof captured.authorization === "string") {
      const normalized = normalizeBearerToken(captured.authorization);
      if (Date.now() >= normalized.expiresAtMs - EXPIRY_GUARD_MS) {
        throw new TripoError("AUTH_EXPIRED", "The captured Tripo Studio JWT is already expired.", { stage: "authentication" });
      }
      session = { kind: "bearer", ...normalized };
    } else if (typeof captured.cookie === "string" && captured.cookie.trim()) {
      const cookie = captured.cookie.trim();
      if (cookie.length > 8192 || /[;\r\n]/.test(cookie)) {
        throw new TripoError("AUTH_CAPTURE_FAILED", "The captured Tripo Studio session cookie is malformed.", { stage: "authentication" });
      }
      if (captured.expiresAtMs != null && Date.now() >= captured.expiresAtMs - EXPIRY_GUARD_MS) {
        throw new TripoError("AUTH_EXPIRED", "The captured Tripo Studio session cookie is already expired.", { stage: "authentication" });
      }
      session = {
        kind: "cookie",
        cookie,
        accountFingerprint: fingerprintFromIdentityId(captured.identityId, cookie),
        expiresAtMs: captured.expiresAtMs ?? null
      };
    } else {
      throw new TripoError("AUTH_CAPTURE_FAILED", "No usable Tripo Studio credential was captured.", { stage: "authentication" });
    }
    const region = captured.region?.trim() || "rg1";
    if (region !== "rg1") {
      throw new TripoError("UNSUPPORTED_REGION", `This build supports Tripo Studio region rg1, but captured ${region}.`, { stage: "authentication" });
    }
    this.#loaded = true;
    this.#session = {
      ...session,
      deviceId: captured.deviceId?.trim() || this.#config.deviceId,
      region,
      source: captured.source ?? "cookie_store"
    };
    if (persist) {
      await this.#doc.write({
        account_fingerprint: this.#session.accountFingerprint,
        captured_at: (/* @__PURE__ */ new Date()).toISOString(),
        device_id: this.#session.deviceId,
        ...this.#session.expiresAtMs != null ? { expires_at_ms: this.#session.expiresAtMs } : {},
        kind: this.#session.kind,
        region: this.#session.region,
        schema_version: 2,
        ...this.#session.kind === "bearer" ? { token: this.#session.token } : { cookie: this.#session.cookie }
      });
    }
    return this.status();
  }
  async clear() {
    this.#session = void 0;
    this.#loaded = true;
    await this.#doc.remove();
  }
  async #require() {
    await this.#ensureLoaded();
    const session = this.#session;
    if (!session) {
      throw new TripoError("AUTH_REQUIRED", "Tripo Studio login is not established. Call tripo_auth_login \u2014 it opens your browser once; afterwards the plugin reuses your web session headlessly.", {
        nextAction: "tripo_auth_login",
        stage: "authentication"
      });
    }
    if (session.expiresAtMs != null && Date.now() >= session.expiresAtMs - EXPIRY_GUARD_MS) {
      await this.clear();
      throw new TripoError("AUTH_EXPIRED", "The persisted Tripo Studio session expired and needs to be refreshed from the browser.", { stage: "authentication" });
    }
    return session;
  }
};

// src/config.mjs
import os2 from "node:os";
import path14 from "node:path";
import { createHash as createHash9 } from "node:crypto";
import { readFileSync as readFileSync2 } from "node:fs";
function defaultDataDir(env) {
  if (process.platform === "win32") {
    return path14.join(env.LOCALAPPDATA ?? path14.join(os2.homedir(), "AppData", "Local"), "TripoStudioPlugin");
  }
  if (process.platform === "darwin") {
    return path14.join(os2.homedir(), "Library", "Application Support", "TripoStudioPlugin");
  }
  return path14.join(env.XDG_STATE_HOME ?? path14.join(os2.homedir(), ".local", "state"), "tripo-studio-plugin");
}
function defaultAssetRoot(env) {
  const home = env.USERPROFILE?.trim() || env.HOME?.trim() || os2.homedir();
  return path14.join(home, "Documents", "TripoStudio");
}
function parsePositiveInteger(value, fallback, name) {
  if (value === void 0 || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TripoError("CONFIGURATION_ERROR", `${name} must be a positive integer.`);
  }
  return parsed;
}
function stableDeviceId(dataDir) {
  const hex = createHash9("sha256").update(`tripo-studio-plugin\0${dataDir}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16] ?? "0", 16) % 4] ?? "8";
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}
function parseRoots(value, fallback) {
  const entries = (value?.trim() ? value.split(path14.delimiter) : fallback).map((entry) => entry.trim()).filter(Boolean).map((entry) => path14.resolve(entry));
  if (entries.length === 0) throw new TripoError("CONFIGURATION_ERROR", "At least one local path root is required.");
  return [...new Set(entries)];
}
var SETTINGS_FIELDS = /* @__PURE__ */ new Set(["asset_root", "schema_version"]);
function normalizeAssetRoot(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || !path14.isAbsolute(trimmed)) {
    throw new TripoError("CONFIGURATION_ERROR", "asset_root must be an absolute path to a dedicated folder.");
  }
  const resolved = path14.resolve(trimmed);
  const samePath = (a, b) => {
    const n = (v) => path14.resolve(v).replace(/[\\/]+$/, "");
    return process.platform === "win32" ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b);
  };
  if (samePath(resolved, path14.parse(resolved).root)) {
    throw new TripoError("CONFIGURATION_ERROR", "asset_root cannot be a filesystem root.");
  }
  if (samePath(resolved, os2.homedir()) || samePath(resolved, os2.tmpdir())) {
    throw new TripoError("CONFIGURATION_ERROR", "asset_root must be a dedicated subdirectory, not home or tmp.");
  }
  return resolved;
}
function readLocalSettings(settingsFile) {
  let text;
  try {
    text = readFileSync2(settingsFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    throw new TripoError("CONFIGURATION_ERROR", "Could not read the local settings file.", { cause: error });
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new TripoError("CONFIGURATION_ERROR", "The local settings file is not valid JSON.", { cause: error });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) || parsed.schema_version !== 1) {
    throw new TripoError("CONFIGURATION_ERROR", "The local settings file schema is not supported.");
  }
  const unknown = Object.keys(parsed).filter((key) => !SETTINGS_FIELDS.has(key));
  if (unknown.length > 0) {
    throw new TripoError("CONFIGURATION_ERROR", `Unsupported local settings fields: ${unknown.sort().join(", ")}.`);
  }
  return { asset_root: normalizeAssetRoot(parsed.asset_root) };
}
function loadConfig(env = process.env) {
  const dataDir = path14.resolve(env.TRIPO_PLUGIN_DATA_DIR ?? defaultDataDir(env));
  const settingsFile = path14.join(dataDir, "settings.json");
  const settings = readLocalSettings(settingsFile);
  const assetRoot = normalizeAssetRoot(settings?.asset_root ?? env.TRIPO_ASSET_ROOT?.trim() ?? defaultAssetRoot(env));
  const outputRoots = parseRoots(env.TRIPO_OUTPUT_ROOTS, [assetRoot]);
  return {
    apiBaseUrl: STUDIO_API_BASE_URL,
    blenderExecutable: env.TRIPO_BLENDER_EXECUTABLE?.trim() || (process.platform === "darwin" ? "/Applications/Blender.app/Contents/MacOS/Blender" : "blender"),
    assetRoot,
    dataDir,
    deviceId: env.TRIPO_DEVICE_ID?.trim() || stableDeviceId(dataDir),
    outputRoots,
    planTtlMs: parsePositiveInteger(env.TRIPO_PLAN_TTL_MS, 30 * 60 * 1e3, "TRIPO_PLAN_TTL_MS"),
    requestTimeoutMs: parsePositiveInteger(env.TRIPO_REQUEST_TIMEOUT_MS, 6e4, "TRIPO_REQUEST_TIMEOUT_MS"),
    settingsFile,
    settingsLoaded: settings !== void 0,
    studioOrigin: STUDIO_ORIGIN,
    tokenCaptureTimeoutMs: parsePositiveInteger(env.TRIPO_TOKEN_CAPTURE_TIMEOUT_MS, 2e4, "TRIPO_TOKEN_CAPTURE_TIMEOUT_MS")
  };
}

// src/studio/schemas.mjs
import { z as z15 } from "zod";
var apiEnvelopeSchema = z15.object({
  code: z15.number(),
  data: z15.unknown().optional(),
  message: z15.string().optional(),
  msg: z15.string().optional()
}).loose();
var temporaryTokenSchema = z15.object({
  host: z15.string().min(1).optional(),
  resource_bucket: z15.string().min(1),
  resource_uri: z15.string().min(1),
  session_token: z15.string().min(1),
  sts_ak: z15.string().min(1),
  sts_sk: z15.string().min(1)
}).loose();
var auditResultSchema = z15.object({
  age_confirm_status: z15.enum(["confirmed", "denied", "unconfirmed"]).optional(),
  result: z15.enum(["pass", "sensitive", "nsfw", "reject"])
}).loose();
var generationReceiptSchema = z15.object({
  operator_id: z15.string().min(1),
  project_id: z15.string().min(1).optional()
}).loose();
var generationResponseSchema = z15.union([
  generationReceiptSchema,
  z15.array(generationReceiptSchema).min(1).transform((entries) => entries[0])
]);
var modelGenerationReceiptsSchema = z15.union([
  generationReceiptSchema.transform((entry) => [entry]),
  z15.array(generationReceiptSchema).min(1).max(120)
]).transform((entries) => [...entries]);
var progressItemSchema = z15.object({
  id: z15.string().optional(),
  left_time: z15.union([z15.number(), z15.string()]).optional(),
  operator_id: z15.string().optional(),
  progress: z15.number().optional(),
  project_id: z15.string().optional(),
  reason: z15.unknown().optional(),
  status: z15.enum(["banned", "cancelled", "expired", "failed", "prepare", "queued", "running", "success", "unknown"])
}).loose();
var progressResponseSchema = z15.array(progressItemSchema);
var projectRetargetArtifactSchema = z15.object({
  model_url: z15.url().max(16384).optional().or(z15.literal("")),
  name: z15.string().min(1).max(256).optional(),
  operator_id: z15.string().min(1).max(256).optional()
}).loose();
var projectRetargetArtifactsSchema = z15.array(projectRetargetArtifactSchema).max(256);
var projectOperatorSchema = z15.object({
  Retarget: projectRetargetArtifactsSchema.optional(),
  retarget: projectRetargetArtifactsSchema.optional(),
  retarget_model: projectRetargetArtifactsSchema.optional()
}).loose();
var sizedCover = z15.object({
  sizes: z15.array(z15.object({ url: z15.url().or(z15.literal("")), width: z15.number().finite().nonnegative() }).loose()).max(32).optional(),
  url: z15.url().or(z15.literal("")).optional()
}).loose();
var projectDetailSchema = z15.object({
  biz_info: z15.object({ short_description: z15.string().max(2e3).optional() }).loose().optional(),
  cover_image: z15.array(z15.url().or(z15.literal(""))).max(8).optional(),
  cover_image_object: z15.array(sizedCover).max(8).optional(),
  id: z15.string().optional(),
  model_url: z15.url().optional().or(z15.literal("")),
  operator: projectOperatorSchema.optional(),
  point_cloud_model_url: z15.url().optional().or(z15.literal("")),
  project_name: z15.string().optional(),
  status: z15.string().optional(),
  visibility: z15.enum(["private", "public", "shareable"]).optional()
}).loose();
var modelAssetSchema = z15.object({
  biz_info: z15.object({ short_description: z15.string().max(2e3).optional() }).loose().optional(),
  collected: z15.boolean().optional(),
  content_risk_level: z15.string().max(128).optional(),
  cover_image: z15.array(z15.url().or(z15.literal(""))).max(8).optional(),
  cover_image_object: z15.array(sizedCover).max(8).optional(),
  create_time: z15.string().max(128).optional(),
  id: z15.string().min(1).max(256),
  is_nsfw: z15.boolean().optional(),
  is_owner: z15.boolean().optional(),
  project_name: z15.string().max(1e3).optional(),
  running_operator: z15.unknown().optional(),
  type: z15.string().max(128).optional(),
  visibility: z15.enum(["private", "public", "shareable"]).optional()
}).loose();
var modelAssetsPageSchema = z15.object({
  max_assets: z15.number().int().nonnegative(),
  projects: z15.array(modelAssetSchema).max(100),
  total: z15.number().int().nonnegative()
}).loose();
var retextureResultSchema = z15.object({
  camera_matrix: z15.array(z15.number().finite()).length(16),
  url: z15.url()
}).loose();
var retextureImagesSchema = z15.object({ images: z15.array(retextureResultSchema) }).loose();
var rigTypeSchema = z15.enum(["aquatic", "avian", "biped", "hexapod", "octopod", "quadruped", "serpentine", "others"]);
var rigPrecheckResultSchema = z15.object({
  riggable: z15.boolean(),
  rig_type: rigTypeSchema
}).loose();
var studioImageModelSchema = z15.enum([
  "flux.1_dev",
  "flux.1_kontext_pro",
  "gemini_2.5_flash_image_preview",
  "gemini_3.1_flash_image_preview",
  "gemini_3_pro_image_preview",
  "gpt_4o",
  "gpt_image_1.5",
  "gpt_image_2",
  "gpt_image_2.5_sunburst",
  "midjourney"
]);
var studioImageOutputSchema = z15.object({
  bucket: z15.string().min(1).max(512),
  image_audit_result: z15.enum(["pass", "sensitive", "nsfw", "reject"]).optional(),
  key: z15.string().min(1).max(2048),
  url: z15.url()
}).loose();
var studioImageAssetSchema = z15.object({
  asset_id: z15.string().min(1).max(256).regex(/^[^\s\u0000-\u001f\u007f]+$/),
  create_time: z15.union([z15.string().max(128), z15.number().finite()]).optional(),
  input: z15.record(z15.string(), z15.unknown()).default({}),
  output: z15.preprocess(
    (value) => value ?? {},
    z15.object({ data: z15.array(studioImageOutputSchema).max(16).default([]) }).loose()
  ).default({ data: [] }),
  status: z15.string().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/),
  type: z15.enum(["generate_image", "multiview_images", "split_image", "upscale_image"])
}).loose();
var studioImageAssetsPageSchema = z15.object({ assets: z15.array(studioImageAssetSchema).max(100) }).loose();
var studioImageTemplateSchema = z15.object({
  description: z15.string().max(4e3).optional(),
  image: z15.union([z15.url(), z15.literal(""), z15.array(z15.url()).max(16)]).optional(),
  tag: z15.array(z15.string().min(1).max(128)).max(32),
  template_id: z15.string().min(1).max(256).regex(/^[^\s\u0000-\u001f\u007f]+$/),
  title: z15.string().min(1).max(512)
}).loose();
var studioImageTemplatesSchema = z15.object({ templates: z15.array(studioImageTemplateSchema).max(500) }).loose();
var studioImageSubmissionSchema = z15.object({ asset_id: z15.string().min(1).max(256) }).loose();
var remoteId = z15.string().min(1).max(256);
var storageArtifact = z15.object({ bucket: z15.string(), key: z15.string(), url: z15.union([z15.url(), z15.literal("")]) }).loose();
var uvContextSchema = z15.object({
  project_id: remoteId,
  current_operator_id: remoteId,
  next_action: z15.enum(["generate", "retry"]),
  candidates: z15.array(z15.object({ operator_id: remoteId, created_at: z15.number().finite().nonnegative(), model: storageArtifact, uv_layout: storageArtifact }).loose()).max(100),
  running_task: z15.object({ operator_id: remoteId, action: z15.enum(["generate", "retry"]), status: z15.enum(["queued", "running"]) }).loose().nullable()
}).loose();
var uvReceiptSchema = z15.object({ operator_id: remoteId, project_id: remoteId, current_operator_id: remoteId, action: z15.enum(["generate", "retry"]), status: z15.literal("queued") }).loose();
var uvApplySchema = z15.object({ project_id: remoteId, previous_operator_id: remoteId, current_operator_id: remoteId }).loose();
var exportReceiptSchema = z15.union([z15.object({ model_url: z15.url() }).loose(), generationReceiptSchema]);
var exportDownloadSchema = z15.object({ model_url: z15.url() }).loose();
var motionTaskSchema = z15.object({ task_id: remoteId, status: z15.enum(["queued", "running", "success", "failed", "expired"]), asset_id: remoteId.nullish() }).loose();
var motionAssetSchema = z15.object({ asset_id: remoteId, motion_url: z15.url(), title: z15.string().optional(), task_id: remoteId.optional(), motion: z15.string().optional(), input: z15.object({ segments: z15.array(z15.unknown()).max(5) }).loose().optional() }).loose();
var motionAssetsSchema = z15.object({ assets: z15.array(motionAssetSchema).max(1e4), active_tasks: z15.array(motionTaskSchema).max(1e3) }).loose();

// src/studio/gateway.mjs
var parseWith = (schema, value) => schema.parse(value);
function summarizePayment(value, depth = 0) {
  if (depth > 5 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => summarizePayment(entry, depth + 1));
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/id|email|phone|avatar|name|token|secret/i.test(key)) continue;
    if (/credit|balance|point|quota|reset|expire|member|plan|subscription|trial|used|total|remain|type|status/i.test(key)) {
      output[key] = summarizePayment(entry, depth + 1);
    } else if (entry !== null && typeof entry === "object") {
      const nested = summarizePayment(entry, depth + 1);
      if (nested && typeof nested === "object" && Object.keys(nested).length > 0) output[key] = nested;
    }
  }
  return output;
}
var StudioGateway = class {
  #http;
  constructor(http) {
    this.#http = http;
  }
  async getUvContext(body) {
    return this.#http.request({ body, method: "POST", path: "/v2/studio/operation/uv_edit/context", retrySafe: true }, (value) => uvContextSchema.parse(value));
  }
  async submitUv(body) {
    return this.#http.request({ body, method: "POST", path: "/v2/studio/operation/uv_edit/generate", retrySafe: false }, (value) => uvReceiptSchema.parse(value));
  }
  async applyUv(body) {
    return this.#http.request({ body, method: "POST", path: "/v2/studio/operation/uv_edit/apply", retrySafe: false }, (value) => uvApplySchema.parse(value));
  }
  async submitExport(body) {
    return this.#http.request({ body, method: "POST", path: "/v2/studio/operation/export", retrySafe: false, timeoutMs: 9e4 }, (value) => exportReceiptSchema.parse(value));
  }
  async getExportDownload(operatorId, name) {
    return this.#http.request({ body: { file_name: name, operator_id: operatorId }, method: "POST", path: "/v2/studio/operation/download_with_name", retrySafe: true }, (value) => exportDownloadSchema.parse(value));
  }
  async submitMotion(body) {
    return this.#http.request({ body, method: "POST", path: "/v2/studio/motion/generate", retrySafe: false, timeoutMs: 9e4 }, (value) => motionTaskSchema.parse(value));
  }
  async getMotionTask(taskId) {
    return this.#http.request({ body: { task_id: taskId }, method: "POST", path: "/v2/studio/motion/get_task", retrySafe: true }, (value) => motionTaskSchema.parse(value));
  }
  async getMotionAsset(assetId) {
    return this.#http.request({ body: { asset_id: assetId }, method: "POST", path: "/v2/studio/motion/get_asset", retrySafe: true }, (value) => motionAssetSchema.parse(value));
  }
  async listMotionAssets() {
    return this.#http.request({ body: {}, method: "POST", path: "/v2/studio/motion/list_assets", retrySafe: true }, (value) => motionAssetsSchema.parse(value));
  }
  async submitImageTransform(endpoint, body) {
    if (!["upscale", "split"].includes(endpoint)) throw new TripoError("INVALID_INPUT", "Unsupported image transform.");
    return this.#http.request({ body, method: "POST", path: `/v2/studio/image/${endpoint}`, retrySafe: false, timeoutMs: 9e4 }, (value) => studioImageSubmissionSchema.parse(value));
  }
  async getPaymentSummary() {
    const data = await this.#http.request(
      { authRecoverySafe: true, method: "GET", path: "/v2/studio/user/profile/payment", retrySafe: true },
      (value) => value
    );
    const summary = summarizePayment(data);
    return summary && typeof summary === "object" && !Array.isArray(summary) ? summary : {};
  }
  // These are read-only quota lookups used by Studio's own pricing display.
  async getOperationQuota() {
    return this.#http.request({ body: {}, method: "POST", path: "/v2/studio/operation/quota", retrySafe: true, authRecoverySafe: true }, (value) => value);
  }
  async getPricingTrials() {
    return this.#http.request({ method: "GET", path: "/v2/studio/marketing/detail", query: { locale: "zh" }, retrySafe: true, authRecoverySafe: true }, (value) => value);
  }
  async requestTemporaryToken(format2) {
    return await this.#http.request(
      { body: { client: "aws", format: format2 }, method: "POST", path: "/v2/studio/storage/temporary_token", retrySafe: true },
      (value) => parseWith(temporaryTokenSchema, value)
    );
  }
  async listModels(input) {
    if (!Number.isSafeInteger(input.offset) || input.offset < 0 || input.offset > 1e6) {
      throw new TripoError("CONFIGURATION_ERROR", "Model-list offset must be an integer from 0 through 1,000,000.", { stage: "model_list" });
    }
    return await this.#http.request(
      {
        method: "GET",
        path: "/v2/studio/assets/v2",
        query: { asset_type: input.assetScope, offset: input.offset, size: 20, type: input.filter },
        retrySafe: true
      },
      (value) => parseWith(modelAssetsPageSchema, value)
    );
  }
  async auditImage(image) {
    return await this.#http.request(
      { body: { image }, method: "POST", path: "/v2/studio/audit/image", retrySafe: true },
      (value) => parseWith(auditResultSchema, value)
    );
  }
  async submitModelGeneration(input) {
    const endpoints = {
      image: "/v2/studio/operation/image_to_model",
      multiview: "/v2/studio/operation/multiview_to_model",
      batch: "/v2/studio/operation/batch_image_to_model",
      text: "/v2/studio/operation/text_to_model"
    };
    return await this.#http.request(
      { body: input.body, method: "POST", path: endpoints[input.mode], retrySafe: false, timeoutMs: 9e4 },
      (value) => parseWith(modelGenerationReceiptsSchema, value)
    );
  }
  async submitModelImport(input) {
    return await this.#http.request(
      {
        body: {
          format: input.format,
          model: input.model,
          name: input.name,
          transform_matrix: input.transform_matrix,
          use_original_uv: input.use_original_uv
        },
        method: "POST",
        path: "/v2/studio/operation/import_user_model",
        retrySafe: false,
        timeoutMs: 9e4
      },
      (value) => parseWith(generationResponseSchema, value)
    );
  }
  async precheckRigging(input) {
    return await this.#http.request(
      { body: { model_version: input.modelVersion, project_id: input.projectId }, method: "POST", path: "/v2/studio/operation/pre_rig_check", retrySafe: true },
      (value) => parseWith(rigPrecheckResultSchema, value)
    );
  }
  async checkSymmetry(image) {
    return this.#http.request({ body: { image: { bucket: image.bucket, key: image.key } }, method: "POST", path: "/v2/studio/operation/symmetry_check", retrySafe: true }, (value) => {
      if (typeof value?.symmetry !== "boolean") throw new TripoError("INSUFFICIENT_EVIDENCE", "Invalid symmetry check response.");
      return value.symmetry;
    });
  }
  async submitPostprocess(endpoint, body) {
    return await this.#http.request(
      { body, method: "POST", path: `/v2/studio/operation/${endpoint}`, retrySafe: false, timeoutMs: 9e4 },
      (value) => parseWith(generationResponseSchema, value)
    );
  }
  async getProgress(operatorIds) {
    if (operatorIds.length > 20 && operatorIds.length <= 120) {
      const pages = [];
      for (let index = 0; index < operatorIds.length; index += 20) pages.push(await this.getProgress(operatorIds.slice(index, index + 20)));
      return pages.flat();
    }
    if (operatorIds.length < 1 || operatorIds.length > 120) {
      throw new TripoError("CONFIGURATION_ERROR", "Progress queries accept between 1 and 20 operator IDs.", { stage: "progress" });
    }
    return await this.#http.request(
      { body: { ids: operatorIds }, method: "POST", path: "/v2/studio/progress", retrySafe: true },
      (value) => parseWith(progressResponseSchema, value)
    );
  }
  async getProject(projectId2, operatorId) {
    return await this.#http.request(
      { method: "GET", path: `/v2/studio/project/detail/v3/${encodeURIComponent(projectId2)}`, query: { operator_id: operatorId }, retrySafe: true },
      (value) => parseWith(projectDetailSchema, value)
    );
  }
  async getRetexture(operatorId) {
    return await this.#http.request(
      { body: { operator_id: operatorId }, method: "POST", path: "/v2/studio/operation/get_retexture", retrySafe: true },
      (value) => parseWith(retextureResultSchema, value)
    );
  }
  async getRetextureImages(projectId2) {
    return await this.#http.request(
      { body: { project_id: projectId2 }, method: "POST", path: "/v2/studio/operation/get_retexture_images", retrySafe: true },
      (value) => parseWith(retextureImagesSchema, value)
    );
  }
  async listStudioImageTemplates() {
    return await this.#http.request(
      { method: "GET", path: "/v2/studio/image/available_templates", retrySafe: true },
      (value) => parseWith(studioImageTemplatesSchema, value)
    );
  }
  async listStudioImageAssets(pageNum, pageSize) {
    if (!Number.isSafeInteger(pageNum) || pageNum < 1 || pageNum > 1e5) {
      throw new TripoError("CONFIGURATION_ERROR", "Image-asset page_num must be an integer from 1 through 100,000.", { stage: "image_assets" });
    }
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new TripoError("CONFIGURATION_ERROR", "Image-asset page_size must be an integer from 1 through 100.", { stage: "image_assets" });
    }
    return await this.#http.request(
      { body: { page_num: pageNum, page_size: pageSize }, method: "POST", path: "/v2/studio/image/image_assets", retrySafe: true },
      (value) => parseWith(studioImageAssetsPageSchema, value)
    );
  }
  async getStudioImageAsset(assetId) {
    return await this.#http.request(
      { body: { asset_id: assetId }, method: "POST", path: "/v2/studio/image/get_image_asset", retrySafe: true },
      (value) => parseWith(studioImageAssetSchema, value)
    );
  }
  async submitStudioImage(input) {
    return await this.#http.request(
      { body: input, method: "POST", path: "/v2/studio/image/gen_image_v2", retrySafe: false, timeoutMs: 9e4 },
      (value) => parseWith(studioImageSubmissionSchema, value)
    );
  }
  async submitStudioMultiview(input) {
    return await this.#http.request(
      { body: input, method: "POST", path: "/v2/studio/image/gen_multiview", retrySafe: false, timeoutMs: 9e4 },
      (value) => parseWith(studioImageSubmissionSchema, value)
    );
  }
  async regenerateStudioImage(assetId) {
    return await this.#http.request(
      { body: { asset_id: assetId }, method: "POST", path: "/v2/studio/image/re_gen_image", retrySafe: false, timeoutMs: 9e4 },
      (value) => parseWith(studioImageSubmissionSchema, value)
    );
  }
  async regenerateStudioMultiview(assetId) {
    return await this.#http.request(
      { body: { asset_id: assetId }, method: "POST", path: "/v2/studio/image/re_gen_multiview", retrySafe: false, timeoutMs: 9e4 },
      (value) => parseWith(studioImageSubmissionSchema, value)
    );
  }
};

// src/studio/http-client.mjs
var MAX_JSON_RESPONSE_BYTES = 2 * 1024 * 1024;
var INSUFFICIENT_CREDITS_REMOTE_CODE = 2010;
function remoteMessage(value, code) {
  return sanitizeMessage(value.message ?? value.msg ?? `Tripo Studio returned code ${code}.`).slice(0, 500);
}
function remoteApiError(envelope) {
  if (envelope.code === INSUFFICIENT_CREDITS_REMOTE_CODE) {
    return new TripoError("INSUFFICIENT_CREDITS", "Tripo Studio credits are insufficient; the remote task was not accepted.", {
      details: { remote_code: envelope.code },
      retryable: false,
      safeToRetryPaidOperation: false,
      submissionState: "not_submitted",
      nextAction: "top_up_or_change_request",
      stage: "remote_api"
    });
  }
  return new TripoError("REMOTE_API_ERROR", remoteMessage(envelope, envelope.code), {
    details: { remote_code: envelope.code },
    retryable: false,
    safeToRetryPaidOperation: false,
    stage: "remote_api"
  });
}
var wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function readJsonResponse(response) {
  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_JSON_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {
    });
    throw new TripoError("REMOTE_SCHEMA_CHANGED", "Tripo Studio returned an unexpectedly large JSON response.", { stage: "response_decode" });
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_JSON_RESPONSE_BYTES) {
        await reader.cancel("response size limit exceeded");
        throw new TripoError("REMOTE_SCHEMA_CHANGED", "Tripo Studio returned an unexpectedly large JSON response.", { stage: "response_decode" });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(combined);
}
var StudioHttpClient = class {
  #config;
  #session;
  #fetch;
  // onAuthFailure(identity) → refresh the persisted session headlessly, then
  // the request is retried once with the new identity. Wired by runtime.
  #authRecovery;
  constructor(config, session, options = {}) {
    this.#config = config;
    this.#session = session;
    this.#fetch = options.fetch ?? fetch;
    this.#authRecovery = options.authRecovery;
  }
  setAuthRecovery(recovery) {
    this.#authRecovery = recovery;
  }
  async request(request, parseData) {
    const attempts = request.retrySafe ? 2 : 1;
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.#requestOnce(request, parseData);
      } catch (error) {
        lastError = error;
        if (error instanceof TripoError && (error.code === "AUTH_EXPIRED" || error.code === "AUTH_REQUIRED") && this.#authRecovery && attempt === 1) {
          try {
            await this.#authRecovery.recover({ reason: error.code === "AUTH_REQUIRED" ? "auth_required" : "auth_expired" });
          } catch {
            throw error;
          }
          try {
            return await this.#requestOnce(request, parseData);
          } catch (retryError) {
            throw retryError;
          }
        }
        const retryable = error instanceof TripoError && error.retryable;
        if (attempt >= attempts || !retryable) throw error;
        await wait(100 * attempt);
      }
    }
    throw lastError;
  }
  async #requestOnce(request, parseData) {
    if (!request.path.startsWith("/v2/")) {
      throw new TripoError("CONFIGURATION_ERROR", "Studio API paths must remain under /v2/.", { stage: "request" });
    }
    const identity = await this.#session.getRequestIdentity();
    const url = new URL(request.path, this.#config.apiBaseUrl);
    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value !== void 0) url.searchParams.set(key, String(value));
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("request timeout")), request.timeoutMs ?? this.#config.requestTimeoutMs);
    let response;
    try {
      response = await this.#fetch(url, {
        method: request.method,
        headers: {
          accept: "application/json",
          ...identity.authorization ? { authorization: identity.authorization } : {},
          ...identity.cookie ? { cookie: identity.cookie } : {},
          "content-type": "application/json",
          origin: this.#config.studioOrigin,
          referer: `${this.#config.studioOrigin}/`,
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
          "x-tripo-device-id": identity.deviceId,
          "x-tripo-region": identity.region,
          "x-tripo-start": performance.now().toString()
        },
        ...request.body === void 0 ? {} : { body: JSON.stringify(request.body) },
        redirect: "error",
        signal: controller.signal
      });
    } catch (error) {
      clearTimeout(timeout);
      throw new TripoError("HTTP_ERROR", "Could not reach Tripo Studio.", {
        cause: error,
        retryable: request.retrySafe ?? false,
        safeToRetryPaidOperation: false,
        stage: "request"
      });
    }
    if (response.status === 401 || response.status === 403) {
      clearTimeout(timeout);
      void response.body?.cancel().catch(() => {
      });
      throw new TripoError("AUTH_EXPIRED", "Tripo Studio login expired; the session will be refreshed headlessly when possible.", {
        details: { http_status: response.status },
        retryable: false,
        stage: "request"
      });
    }
    try {
      let text;
      try {
        text = await readJsonResponse(response);
      } catch (error) {
        if (error instanceof TripoError) throw error;
        if (controller.signal.aborted) {
          throw new TripoError("HTTP_ERROR", "The Tripo Studio response timed out before it completed.", {
            retryable: request.retrySafe ?? false,
            safeToRetryPaidOperation: false,
            stage: "response_decode"
          });
        }
        throw new TripoError("REMOTE_SCHEMA_CHANGED", "Tripo Studio returned invalid UTF-8 JSON.", { cause: error, stage: "response_decode" });
      }
      if (!response.ok) {
        try {
          const envelope2 = apiEnvelopeSchema.safeParse(JSON.parse(text));
          if (envelope2.success && envelope2.data.code !== 0) throw remoteApiError(envelope2.data);
        } catch (error) {
          if (error instanceof TripoError) throw error;
        }
        throw new TripoError("HTTP_ERROR", `Tripo Studio returned HTTP ${response.status}.`, {
          details: { http_status: response.status },
          retryable: (request.retrySafe ?? false) && (response.status === 429 || response.status >= 500),
          stage: "request"
        });
      }
      let parsedJson;
      try {
        parsedJson = JSON.parse(text);
      } catch (error) {
        throw new TripoError("REMOTE_SCHEMA_CHANGED", "Tripo Studio returned a non-JSON response.", { cause: error, stage: "response_decode" });
      }
      const envelope = apiEnvelopeSchema.safeParse(parsedJson);
      if (!envelope.success) {
        throw new TripoError("REMOTE_SCHEMA_CHANGED", "Tripo Studio response envelope changed.", { stage: "response_decode" });
      }
      if (envelope.data.code !== 0) throw remoteApiError(envelope.data);
      try {
        return parseData(envelope.data.data);
      } catch (error) {
        if (error instanceof TripoError) throw error;
        throw new TripoError("REMOTE_SCHEMA_CHANGED", "Tripo Studio response data changed.", { cause: error, stage: "response_decode" });
      }
    } finally {
      clearTimeout(timeout);
    }
  }
};

// src/studio/uploader.mjs
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { createReadStream as createReadStream2 } from "node:fs";
import { stat as stat7 } from "node:fs/promises";
import { Agent as HttpsAgent } from "node:https";
import path15 from "node:path";
var DEFAULT_REQUEST_TIMEOUT_MS = 12e4;
var DEFAULT_UPLOAD_TIMEOUT_MS = 20 * 6e4;
var DEFAULT_CONNECTION_TIMEOUT_MS = 15e3;
var DEFAULT_SOCKET_TIMEOUT_MS = 6e4;
var DEFAULT_MAX_ATTEMPTS = 3;
var CONTENT_TYPES = Object.freeze({
  ".fbx": "application/octet-stream",
  ".glb": "model/gltf-binary",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".obj": "model/obj",
  ".png": "image/png",
  ".stl": "model/stl",
  ".webp": "image/webp"
});
function contentTypeForUpload(filePath) {
  return CONTENT_TYPES[path15.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}
function safeAwsIdentifier(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value)) return void 0;
  if (sanitizeMessage(value) !== value) return void 0;
  return value;
}
function objectRecord(value) {
  return value !== null && typeof value === "object" ? value : void 0;
}
function safeUploadErrorDetails(error) {
  const record = objectRecord(error);
  const metadata = objectRecord(record?.["$metadata"]);
  const details = {};
  const name = safeAwsIdentifier(error instanceof Error ? error.name : record?.["name"]);
  const code = safeAwsIdentifier(record?.["Code"] ?? record?.["code"]);
  const httpStatus = typeof metadata?.["httpStatusCode"] === "number" && Number.isSafeInteger(metadata["httpStatusCode"]) ? metadata["httpStatusCode"] : void 0;
  if (name !== void 0) details.name = name;
  if (code !== void 0) details.code = code;
  if (httpStatus !== void 0) details.http_status = httpStatus;
  const cause = objectRecord(record?.["cause"]);
  const transport = safeAwsIdentifier(cause?.["code"]);
  if (transport !== void 0) details.transport_code = transport;
  return details;
}
function validateTarget(token) {
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(token.resource_bucket)) {
    throw new TripoError("REMOTE_SCHEMA_CHANGED", "Tripo returned an invalid upload bucket.", { stage: "upload" });
  }
  if (token.resource_uri.startsWith("/") || token.resource_uri.includes("\0")) {
    throw new TripoError("REMOTE_SCHEMA_CHANGED", "Tripo returned an invalid upload object key.", { stage: "upload" });
  }
}
var AwsObjectUploader = class {
  #requestTimeoutMs;
  #uploadTimeoutMs;
  constructor(options = {}) {
    this.#requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.#uploadTimeoutMs = options.uploadTimeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS;
  }
  async upload(filePath, token) {
    validateTarget(token);
    const metadata = await stat7(filePath);
    const abortController = new AbortController();
    const deadline = setTimeout(() => abortController.abort(), this.#uploadTimeoutMs);
    deadline.unref();
    let lastError;
    try {
      for (const useAccelerate of [true, false]) {
        if (abortController.signal.aborted) break;
        let client;
        let body;
        try {
          const requestHandler = new NodeHttpHandler({
            connectionTimeout: Math.min(DEFAULT_CONNECTION_TIMEOUT_MS, this.#requestTimeoutMs),
            httpsAgent: new HttpsAgent({ keepAlive: false }),
            requestTimeout: this.#requestTimeoutMs,
            socketTimeout: Math.min(DEFAULT_SOCKET_TIMEOUT_MS, this.#requestTimeoutMs),
            throwOnRequestTimeout: true
          });
          client = new S3Client({
            credentials: {
              accessKeyId: token.sts_ak,
              secretAccessKey: token.sts_sk,
              sessionToken: token.session_token
            },
            maxAttempts: DEFAULT_MAX_ATTEMPTS,
            region: "us-west-2",
            requestChecksumCalculation: "WHEN_REQUIRED",
            requestHandler,
            responseChecksumValidation: "WHEN_REQUIRED",
            useAccelerateEndpoint: useAccelerate
          });
          body = createReadStream2(filePath);
          const upload = new Upload({
            abortController,
            client,
            leavePartsOnError: false,
            params: {
              Body: body,
              Bucket: token.resource_bucket,
              ContentLength: metadata.size,
              ContentType: contentTypeForUpload(filePath),
              Key: token.resource_uri
            },
            partSize: S3_MULTIPART_SIZE,
            queueSize: 2
          });
          await upload.done();
          return { bucket: token.resource_bucket, key: token.resource_uri };
        } catch (error) {
          lastError = error;
          const status = safeUploadErrorDetails(error).http_status;
          const fallbackAllowed = typeof status !== "number" || status === 408 || status === 425 || status === 429 || status >= 500;
          if (!useAccelerate || abortController.signal.aborted || !fallbackAllowed) break;
        } finally {
          body?.destroy();
          try {
            client?.destroy();
          } catch {
          }
        }
      }
      throw new TripoError("HTTP_ERROR", "The file upload to Tripo storage failed.", {
        details: safeUploadErrorDetails(lastError),
        retryable: true,
        safeToRetryPaidOperation: true,
        stage: "upload"
      });
    } finally {
      clearTimeout(deadline);
    }
  }
};

// src/store/tasks.mjs
import { mkdir as mkdir7, readdir, readFile as readFile9 } from "node:fs/promises";
import path16 from "node:path";
var TASK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var ACTIVE_STATUSES = /* @__PURE__ */ new Set(["staged", "dispatching", "queued", "running", "waiting_for_auth"]);
var TERMINAL_TASK_STATUSES = /* @__PURE__ */ new Set(["succeeded", "failed", "canceled", "outcome_unknown", "expired"]);
var TaskStore = class {
  #dir;
  #index;
  #lock;
  constructor(dataDir) {
    this.#dir = path16.join(dataDir, "tasks");
    this.#index = new JsonDocument(path16.join(this.#dir, "index.json"));
    this.#lock = new FileLock(path16.join(dataDir, "locks"));
  }
  #taskDoc(taskId) {
    if (!TASK_ID.test(taskId)) throw new TripoError("INVALID_INPUT", "task_id must be a plugin task identifier.", { stage: "task_store" });
    return new JsonDocument(path16.join(this.#dir, `${taskId}.json`));
  }
  async #readIndex() {
    const index = await this.#index.read({ task_ids: [] });
    return Array.isArray(index.task_ids) ? index.task_ids.filter((id3) => TASK_ID.test(id3)) : [];
  }
  async get(taskId) {
    const record = await this.#taskDoc(taskId).read(void 0);
    if (!record) throw new TripoError("PLAN_NOT_FOUND", `Task ${taskId} does not exist.`, { stage: "task_store" });
    return record;
  }
  async find(taskId) {
    return await this.#taskDoc(taskId).read(void 0);
  }
  async create(record) {
    await mkdir7(this.#dir, { recursive: true, mode: 448 });
    return await this.#lock.withLock("tasks", async () => {
      await this.#taskDoc(record.task_id).write(record);
      const ids = await this.#readIndex();
      await this.#index.write({ task_ids: [record.task_id, ...ids.filter((id3) => id3 !== record.task_id)].slice(0, 5e3) });
      return record;
    });
  }
  // Serialized read-modify-write under the shared lock.
  async update(taskId, mutator) {
    return await this.#lock.withLock("tasks", async () => {
      const doc = this.#taskDoc(taskId);
      const current = await doc.read(void 0);
      if (!current) throw new TripoError("PLAN_NOT_FOUND", `Task ${taskId} does not exist.`, { stage: "task_store" });
      const next = await mutator(current);
      next.revision = (current.revision ?? 0) + 1;
      next.updated_at = isoNow();
      await doc.write(next);
      return next;
    });
  }
  async list({ limit = 50, offset = 0, status, statuses, kind, accountFingerprint, character_group_id } = {}) {
    const ids = await this.#readIndex();
    const output = [];
    let skipped = 0;
    for (const id3 of ids) {
      if (output.length >= limit) break;
      const record = await this.#taskDoc(id3).read(void 0).catch(() => void 0);
      if (!record) continue;
      if (status !== void 0 && record.status !== status) continue;
      if (statuses?.length && !statuses.includes(record.status)) continue;
      if (kind !== void 0 && record.kind !== kind) continue;
      if (character_group_id !== void 0 && (record.character_group?.id ?? "ungrouped") !== character_group_id) continue;
      if (accountFingerprint !== void 0 && record.account_fingerprint !== accountFingerprint) continue;
      if (skipped++ < offset) continue;
      output.push(record);
    }
    return output;
  }
  async listActive() {
    const ids = await this.#readIndex();
    const output = [];
    for (const id3 of ids) {
      const record = await this.#taskDoc(id3).read(void 0).catch(() => void 0);
      if (record && ACTIVE_STATUSES.has(record.status)) output.push(record);
    }
    return output;
  }
  async findFirst(predicate) {
    const ids = await this.#readIndex();
    for (const id3 of ids) {
      const record = await this.#taskDoc(id3).read(void 0).catch(() => void 0);
      if (record && predicate(record)) return record;
    }
    return void 0;
  }
  // Idempotency: same request_hash + account on a non-terminal task reuses it.
  async findByRequestHash(requestHash, accountFingerprint) {
    return await this.findFirst(
      (record) => record.request_hash === requestHash && record.account_fingerprint === accountFingerprint && !TERMINAL_TASK_STATUSES.has(record.status)
    );
  }
  async listDispatching() {
    const ids = await this.#readIndex();
    const output = [];
    for (const id3 of ids) {
      const record = await this.#taskDoc(id3).read(void 0).catch(() => void 0);
      if (record && (record.status === "dispatching" || record.dispatch_state === "dispatching")) output.push(record);
    }
    return output;
  }
};

// src/studio/pricing.mjs
import { createHash as createHash10 } from "node:crypto";
import { z as z16 } from "zod";

// src/studio/pricing-contract.mjs
var pricing_contract_default = {
  "reviewed_at": "2026-10-08T06:30:04.929Z",
  "review_expires_at": "2026-10-15T06:30:04.930Z",
  "sources": [
    {
      "role": "configuration",
      "url": "https://tripo-webapp-assets.tripo3d.ai/studio-prod/_nuxt/BOQlA7aJ.js",
      "sha256": "b48ce6ec709a4ee37cdbcbe1c286ac2ac3b78449982d20befe6a691eefaa4115"
    },
    {
      "role": "formula",
      "url": "https://tripo-webapp-assets.tripo3d.ai/studio-prod/_nuxt/D2TK3lHS.js",
      "sha256": "d0c16efd331425fbf545e1ed6a1be5cdbd15a3a84d62717099cbd88e7d9a4a8d"
    },
    {
      "role": "formula",
      "url": "https://tripo-webapp-assets.tripo3d.ai/studio-prod/_nuxt/d0-kdlow.js",
      "sha256": "4b89d75d52a2f61a2f61bf6dcc306e4ac2ea9fde785ec1daa74562ee3c454e96"
    }
  ]
};

// src/studio/pricing.mjs
var CACHE_MS = 5 * 60 * 1e3;
var QUOTED_KINDS = /* @__PURE__ */ new Set(["model.generate", "image.generate", "model.remesh", "texture.generate", "texture.upscale", "texture.pbr", "texture.edit_preview", "image.upscale", "model.complete_parts", "model.uv_generate", "model.segment"]);
var COST_FIELDS = ["tier", "mode", "model_version", "texture", "texture_quality", "geometry_quality", "pbr", "quad", "smart_poly", "generate_parts", "amount", "request_count", "quality", "action", "face_limit", "face_limits", "delight"];
var IMAGE_KEYS = {
  "flux.1_kontext_pro": "FLUX_1_pro",
  gpt_4o: "GPT_4o",
  gpt_image_2: "GPT_image_2",
  "gpt_image_2.5_sunburst": "GPT_image_2_5",
  midjourney: "Midjourney",
  "gemini_2.5_flash_image_preview": "NanoBanana",
  "gemini_3.1_flash_image_preview": "NanoBanana_2",
  "gemini_3_pro_image_preview": "NanoBanana_pro"
};
function parsePricingConfig(source) {
  const block = source.match(/\{\s*AICompletion\s*:\s*\d+\s*,[^{}]+\}/)?.[0];
  if (!block) throw new Error("Official pricing configuration is unavailable.");
  const credits = {};
  for (const pair of block.slice(1, -1).split(",")) {
    const match = pair.trim().match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(\d+)$/);
    if (!match || Object.hasOwn(credits, match[1])) throw new Error("Unrecognized pricing literal.");
    credits[match[1]] = Number(match[2]);
  }
  const discountBlock = source.match(/imageGenerationByMember\s*:\s*\{([^{}]+)\}/)?.[1];
  const discounts = {};
  for (const pair of (discountBlock ?? "").split(",")) {
    const match = pair.trim().match(/^\[[\w$]+\.(Advanced|Basic|Premium|Professional|Starter|Team)\]\s*:\s*(0?(?:\.\d+)|0|1)$/);
    if (!match) throw new Error("Unrecognized image membership discount.");
    discounts[match[1].toLowerCase()] = Number(match[2]);
  }
  if (!Number.isInteger(credits.GenerateBaseNexusV2) || Object.keys(discounts).length !== 6) throw new Error("Incomplete pricing configuration.");
  return { credits, discounts };
}
function remaining(trial, validRequired = false) {
  if (trial === void 0) return 0;
  if (validRequired && trial.is_valid === false) return 0;
  if (validRequired && trial.is_valid !== true) throw new Error("Trial validity is unavailable.");
  const value = trial.remaining ?? trial.total_count - trial.used_count;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Trial count is unavailable.");
  return value;
}
function calculateQuote(kind, settings, snapshot, account = {}) {
  const c = snapshot.credits, breakdown = [], warnings = [];
  let requests = 1, freeRequests = 0, discount = 1, netKnown = true;
  const member = account.payment?.member?.type;
  const add = (key) => {
    if (!Number.isSafeInteger(c[key])) throw new Error(`Missing official credit key: ${key}`);
    breakdown.push({ key, credits: c[key] });
  };
  const trials = () => {
    if (!account.marketing?.free_trial || typeof account.marketing.free_trial !== "object") throw new Error("Free trial response is unavailable.");
    return account.marketing.free_trial;
  };
  const quota = () => {
    if (!account.quota?.quota || typeof account.quota.quota !== "object") throw new Error("Operation quota response is unavailable.");
    return account.quota.quota;
  };
  const ultraTrial = () => {
    if (!Object.hasOwn(snapshot.discounts, member)) throw new Error("Account membership is unavailable.");
    return member === "team" ? 0 : remaining(trials()["ultra-texture-free-trial"], true);
  };
  let trialType;
  if (kind === "model.generate") {
    requests = settings.request_count ?? 1;
    if (settings.tier === "smart_mesh") {
      if (settings.model_version === NEXUS_V2_MODEL_VERSION) {
        add("GenerateBaseNexusV2");
        trialType = "smart_mesh_v2";
      } else if (settings.model_version === NEXUS_MODEL_VERSION) {
        add("GenerateBaseNexus");
        if (settings.quad) add("GenerateQuad");
      } else throw new Error("Unreviewed Smart Mesh version.");
    } else if (settings.tier === "high_detail") {
      add(settings.texture ? "GenerateWithTexture" : "GenerateBase");
      if (settings.quad) add("GenerateQuad");
      if (settings.generate_parts) {
        add("GenerateGenerateParts");
        netKnown = false;
        warnings.push("Part-generation campaign eligibility has not been verified; base credits are available only.");
      }
      if (settings.smart_poly) add("GenerateSmartPoly");
      if (settings.texture && settings.texture_quality === "detailed") add("GenerateTextureQualityDetailed");
      if (settings.texture && settings.texture_quality === "ultra") {
        add("GenerateTextureQualityExtreme");
        trialType = "ultra";
      }
      if (settings.texture && settings.pbr) add("PBR");
      if (settings.model_version === "v3.1-20260211" && settings.geometry_quality === "detailed") add("GenerateGeometryQualityDetailed");
    } else throw new Error("Generation tier is required.");
  } else if (kind === "image.generate") {
    const key = IMAGE_KEYS[settings.model_version];
    if (!key) throw new Error("This image model has no reviewed price mapping.");
    add(key);
    if (settings.resolution === "4K") add("ImageUpscale4K");
    requests = settings.amount;
    trialType = "image";
  } else if (kind === "model.remesh") {
    add(settings.quad ? "Retopology_Quad" : "Retopology_Triangle");
    if (settings.smart_poly) add("Retopology_SmartPoly");
  } else if (kind === "texture.generate") {
    add("TextureGeneration");
    if (settings.quality === "detailed") add("TextureQualityDetailed");
    if (settings.quality === "ultra") {
      add("TextureQualityExtreme");
      trialType = "ultra";
    }
    if (settings.style || settings.style_image_path) add("TextureStyle");
  } else if (kind === "texture.upscale") {
    if (!["detailed", "ultra"].includes(settings.quality)) throw new Error("Texture upscale quality is required.");
    add(settings.quality === "ultra" ? "UpscalerExtreme" : "Upscaler");
    if (settings.quality === "ultra") trialType = "ultra";
  } else if (kind === "texture.pbr") add("PBR");
  else if (kind === "texture.edit_preview") add("MagicBrush");
  else if (kind === "image.upscale") add("ImageUpscale4K");
  else if (kind === "model.complete_parts") add(settings.mode === "quick_cap" ? "QuickCap" : "AICompletion");
  else if (kind === "model.uv_generate") {
    if (!["generate", "retry"].includes(settings.action)) throw new Error("Smart UV action requires current project context or an explicit action.");
    add(settings.action === "retry" ? "UvEditRetry" : "UvEditGenerate");
    trialType = "uv";
  } else if (kind === "model.segment") {
    add("Segmentation");
    netKnown = false;
    warnings.push("Segmentation campaign eligibility has not been verified; base credits are available only.");
  } else throw new Error("This operation's billing formula has not been verified.");
  const perRequest = breakdown.reduce((sum, row) => sum + row.credits, 0);
  if (!Number.isSafeInteger(requests) || requests < 1 || requests > 30) throw new Error("Input count is required.");
  try {
    if (trialType === "image") {
      discount = snapshot.discounts[member];
      if (discount === void 0) throw new Error("Membership discount is unavailable.");
      freeRequests = Math.min(requests, remaining(trials()["remaining-free-image-count"]));
      if (member === "team") {
        netKnown = false;
        warnings.push("Team workspace billing is not yet verified.");
      }
    } else if (trialType === "smart_mesh_v2") freeRequests = Math.min(requests, remaining(quota().generation?.smart_mesh_v2));
    else if (trialType === "uv") freeRequests = remaining(quota().uv_edit?.generate, true) > 0 ? 1 : 0;
    else if (trialType === "ultra") {
      const count = ultraTrial();
      const batchEligible = ["advanced", "premium", "team"].includes(member);
      freeRequests = count > 0 && (requests === 1 || batchEligible) ? 1 : 0;
    }
  } catch (error) {
    netKnown = false;
    warnings.push(error.message);
  }
  return {
    status: netKnown ? "estimated" : "unknown",
    base_credits: perRequest * requests,
    estimated_credits: netKnown ? Math.ceil(perRequest * (requests - freeRequests) * discount) : null,
    per_request_credits: perRequest,
    request_count: requests,
    breakdown,
    discount_multiplier: discount ?? null,
    free_requests_applied: netKnown ? freeRequests : null,
    ...trialType ? { trial_type: trialType } : {},
    warnings
  };
}
var PricingService = class {
  #gateway;
  #fetch;
  #clock;
  #contract;
  #snapshot;
  #pending;
  constructor(gateway, { fetchImpl = fetch, clock = Date.now, reviewedContract = pricing_contract_default } = {}) {
    this.#gateway = gateway;
    this.#fetch = fetchImpl;
    this.#clock = clock;
    this.#contract = reviewedContract;
  }
  async #load(refresh) {
    const now = this.#clock();
    if (now >= Date.parse(this.#contract.review_expires_at)) throw new Error("Reviewed pricing contract expired; verify the current webpage and update the plugin.");
    if (!refresh && this.#snapshot && now - this.#snapshot.loaded_at < CACHE_MS) return this.#snapshot;
    if (this.#pending) return this.#pending;
    this.#snapshot = void 0;
    this.#pending = (async () => {
      const bodies = await Promise.all(this.#contract.sources.map(async (source) => {
        const url = new URL(source.url);
        if (url.origin !== "https://tripo-webapp-assets.tripo3d.ai" || !url.pathname.startsWith("/studio-prod/_nuxt/")) throw new Error("Unexpected pricing source.");
        let body;
        for (let attempt = 0; attempt < 2; attempt++) {
          let response;
          try {
            response = await this.#fetch(url.href, { redirect: "error", signal: AbortSignal.timeout(15e3) });
          } catch (error) {
            if (attempt === 0) continue;
            throw error;
          }
          if (response.status >= 500 && attempt === 0) continue;
          if (!response.ok) throw new Error("Official pricing source could not be fetched.");
          try {
            body = await response.text();
            break;
          } catch (error) {
            if (attempt === 1) throw error;
          }
        }
        if (body.length > 1e7 || createHash10("sha256").update(body).digest("hex") !== source.sha256) throw new Error("Official pricing source differs from the reviewed contract.");
        return body;
      }));
      const configIndex = this.#contract.sources.findIndex((source) => source.role === "configuration");
      this.#snapshot = { ...parsePricingConfig(bodies[configIndex]), loaded_at: this.#clock() };
      return this.#snapshot;
    })();
    try {
      return await this.#pending;
    } finally {
      this.#pending = void 0;
    }
  }
  async quote(kind, input = {}, { refresh = false, task } = {}) {
    const operation = getOperation(kind);
    if (input.submit === true) throw new TripoError("INVALID_INPUT", "A quote cannot submit a task.");
    const parsed = task ? null : z16.object(operation.inputShape).partial().strict().parse(input);
    const out = { kind, currency: "credits", paid_request_sent: false, server_billing_quote: false, quoted_at: new Date(this.#clock()).toISOString() };
    if (!operation.consumesCredits) return { ...out, status: "free", estimated_credits: 0, base_credits: 0, pricing_type: "operation_contract", warnings: [] };
    if (!QUOTED_KINDS.has(kind)) return { ...out, status: "unknown", estimated_credits: null, base_credits: null, warnings: ["This operation's billing formula has not been verified."] };
    let settings;
    try {
      if (task) {
        settings = kind === "model.generate" ? { ...task.settings, request_count: task.payload.mode === "batch" ? task.payload.body.image.length : 1 } : { ...task.payload, ...task.metadata };
        if (kind === "texture.generate" || kind === "texture.upscale") settings.quality = task.payload.texture_quality;
        if (kind === "texture.generate") settings.style = Boolean(task.payload.style_image);
      } else {
        settings = parsed;
        if (kind === "model.generate") {
          if (!settings.tier || !settings.mode || settings.face_limit === void 0) throw new Error("tier, mode and face_limit are required to quote effective generation settings.");
          const mode = settings.mode === "studio_image" ? "image" : settings.mode === "studio_multiview" ? "multiview" : settings.mode;
          settings = { ...normalizeSettings(settings, mode), tier: settings.tier, request_count: mode === "batch" ? settings.image_paths?.length : 1 };
          if (mode === "batch" && !settings.request_count) throw new Error("image_paths is required to count batch inputs.");
        }
      }
    } catch (error) {
      if (error instanceof z16.ZodError || error instanceof TripoError) throw error;
      return { ...out, status: "unknown", estimated_credits: null, base_credits: null, warnings: [error.message] };
    }
    try {
      const snapshot = await this.#load(refresh);
      const needsMarketing = kind === "image.generate" || kind === "model.generate" && settings.texture && settings.texture_quality === "ultra" || ["texture.generate", "texture.upscale"].includes(kind) && settings.quality === "ultra";
      const needsQuota = kind === "model.uv_generate" || kind === "model.generate" && settings.tier === "smart_mesh" && settings.model_version === NEXUS_V2_MODEL_VERSION;
      const needsPayment = needsMarketing;
      const results = await Promise.allSettled([
        needsPayment ? this.#gateway.getPaymentSummary() : void 0,
        needsMarketing ? this.#gateway.getPricingTrials() : void 0,
        needsQuota ? this.#gateway.getOperationQuota() : void 0
      ]);
      const [payment, marketing, quota] = results.map((result) => result.status === "fulfilled" ? result.value : void 0);
      const calculation = calculateQuote(kind, settings, snapshot, { payment, marketing, quota });
      const effective = Object.fromEntries(COST_FIELDS.filter((key) => settings[key] !== void 0).map((key) => [key, settings[key]]));
      if (kind === "texture.generate") effective.style_reference = Boolean(settings.style || settings.style_image_path);
      return {
        ...out,
        ...calculation,
        effective_settings: effective,
        pricing_type: "reviewed_frontend_estimate",
        member_type: payment?.member?.type ?? null,
        estimate_expires_at: new Date(this.#clock() + CACHE_MS).toISOString(),
        source: { reviewed_at: this.#contract.reviewed_at, review_expires_at: this.#contract.review_expires_at, fetched_at: new Date(snapshot.loaded_at).toISOString(), sources: this.#contract.sources },
        warnings: [...calculation.warnings, "Uses a reviewed frontend version; automatic detection of newer webpage releases is unavailable. Final server billing may differ."]
      };
    } catch (error) {
      return { ...out, status: "unknown", estimated_credits: null, base_credits: null, warnings: [error.message] };
    }
  }
};

// src/runtime.mjs
async function createRuntime(env = process.env) {
  const config = loadConfig(env);
  await mkdir8(config.dataDir, { recursive: true, mode: 448 });
  await mkdir8(config.assetRoot, { recursive: true });
  const session = new SessionManager(config);
  const http = new StudioHttpClient(config, session);
  const gateway = new StudioGateway(http);
  const auth = new AuthCoordinator(config, session);
  http.setAuthRecovery(auth);
  const uploader = new AwsObjectUploader();
  const store = new TaskStore(config.dataDir);
  const pricing = new PricingService(gateway);
  const service = new OperationService({ config, gateway, session, store, uploader, pricing });
  const recovered = await service.recover();
  return { auth, config, gateway, http, recovered, service, session, store, uploader, pricing };
}

// src/studio/model-download.mjs
import path18 from "node:path";

// src/studio/local-artifacts.mjs
import path17 from "node:path";
import { constants } from "node:fs";
import { copyFile as copyFile2, mkdir as mkdir9, stat as stat8 } from "node:fs/promises";
function localArtifact(record, artifact, index = 0) {
  const result = record.result ?? {};
  const file = artifact === "texture" ? result.textures?.[index]?.image_path : artifact === "render" ? result.render_image_path : artifact === "image" ? result.image_path : result.model_path ?? result.image_path ?? result.render_image_path;
  if (!file) throw new TripoError("INSUFFICIENT_EVIDENCE", "The local task has no file for the selected artifact.", { stage: "download" });
  return file;
}
async function copyLocalArtifact(config, sourcePath, requestedPath, defaultName) {
  const source = await resolveOutputPath(config, sourcePath, defaultName);
  const target = await resolveOutputPath(config, requestedPath, defaultName);
  const info = await stat8(source);
  if (!info.isFile()) throw new TripoError("DOWNLOAD_REJECTED", "Local artifact is not a regular file.", { stage: "download" });
  if (source !== target) {
    await mkdir9(path17.dirname(target), { recursive: true });
    await copyFile2(source, target, constants.COPYFILE_EXCL);
  }
  return { bytes: info.size, host: "local", path: target, name: path17.basename(target) };
}

// src/studio/model-download.mjs
async function downloadResolvedArtifact(config, resolved, requestedPath, fetchImpl = fetch) {
  const download = resolved.localPath ? await copyLocalArtifact(config, resolved.localPath, requestedPath, resolved.defaultName) : await downloadArtifact(config, resolved.url, requestedPath, resolved.defaultName, fetchImpl);
  if (path18.extname(resolved.defaultName).toLowerCase() === ".glb") {
    try {
      Object.assign(download, await prepareGlbForBlender(config, download.path));
    } catch (error) {
      download.blender_error = { code: error instanceof TripoError ? error.code : "MODEL_DECODE_FAILED", message: error instanceof TripoError ? error.message : "Could not create the Blender-compatible copy." };
    }
  }
  return download;
}

// src/ui/media.mjs
import { mkdir as mkdir10, readFile as readFile10, writeFile as writeFile5, stat as stat9, realpath as realpath4 } from "node:fs/promises";
import path19 from "node:path";
import { randomUUID as randomUUID5 } from "node:crypto";
import sharp3 from "sharp";
import { z as z17 } from "zod";
var MAX_IMAGE = 20 * 1024 * 1024;
var MAX_MODEL = 32 * 1024 * 1024;
var id2 = z17.string().regex(/^[^\s\u0000-\u001f\u007f]{1,256}$/);
var unavailable = (message) => new TripoError("PREVIEW_UNAVAILABLE", message, { stage: "workbench_preview" });
async function readPreviewUrl(value, limit, fetchImpl = fetch) {
  let url = assertDownloadUrl(value);
  const signal = AbortSignal.timeout(45e3);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetchImpl(url, { redirect: "manual", signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      url = assertDownloadUrl(new URL(response.headers.get("location"), url).href);
      continue;
    }
    if (!response.ok || !response.body) throw unavailable(`\u9884\u89C8\u8BFB\u53D6\u5931\u8D25\uFF08HTTP ${response.status}\uFF09\u3002`);
    if (Number(response.headers.get("content-length")) > limit) {
      await response.body.cancel();
      throw unavailable("\u6587\u4EF6\u8D85\u8FC7\u4EA4\u4E92\u9884\u89C8\u5927\u5C0F\u9650\u5236\uFF0C\u53EF\u4E0B\u8F7D\u540E\u67E5\u770B\u3002");
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > limit) throw unavailable("\u6587\u4EF6\u8D85\u8FC7\u4EA4\u4E92\u9884\u89C8\u5927\u5C0F\u9650\u5236\uFF0C\u53EF\u4E0B\u8F7D\u540E\u67E5\u770B\u3002");
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw unavailable("\u9884\u89C8\u91CD\u5B9A\u5411\u6B21\u6570\u8FC7\u591A\u3002");
}
function validatePreviewGlb(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 1179937895 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(16) !== 1313821514) throw unavailable("\u5F53\u524D\u6587\u4EF6\u4E0D\u662F\u53EF\u9884\u89C8\u7684 GLB \u6A21\u578B\u3002");
  const end = 20 + bytes.readUInt32LE(12);
  if (end > bytes.length) throw unavailable("\u6A21\u578B\u6587\u4EF6\u4E0D\u5B8C\u6574\u3002");
  const json = JSON.parse(bytes.subarray(20, end).toString("utf8").trim());
  for (const entry of [...json.buffers ?? [], ...json.images ?? []]) {
    if (entry.uri && !/^data:/.test(entry.uri)) throw unavailable("\u6A21\u578B\u5305\u542B\u5916\u90E8\u8D44\u6E90\uFF0C\u8BF7\u4E0B\u8F7D\u540E\u67E5\u770B\u3002");
  }
  return json;
}
async function decodePreviewGlb(bytes) {
  validatePreviewGlb(bytes);
  try {
    return await decodeMeshoptGlb(bytes, MAX_MODEL);
  } catch {
    throw unavailable("\u6A21\u578B\u89E3\u7801\u5931\u8D25\u6216\u8D85\u8FC7\u9884\u89C8\u5927\u5C0F\u9650\u5236\uFF0C\u53EF\u4E0B\u8F7D\u540E\u67E5\u770B\u3002");
  }
}
async function imagePayload(bytes, full = false) {
  const image = sharp3(bytes, { limitInputPixels: 64 * 1024 * 1024, animated: false });
  const metadata = await image.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format)) throw unavailable("\u4EC5\u652F\u6301 PNG\u3001JPG \u548C WebP \u56FE\u7247\u3002");
  const webp = await image.rotate().resize(full ? 1400 : 420, full ? 1400 : 420, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  return { data_url: `data:image/webp;base64,${webp.toString("base64")}`, mime_type: "image/webp", width: metadata.width, height: metadata.height, bytes: webp.length };
}
function createWorkbenchMedia(runtime) {
  const projects = /* @__PURE__ */ new Map();
  let projectAccount;
  const { config, gateway, store, session } = runtime;
  const inputPath = async (inputId) => resolveOutputPath(config, path19.join(config.assetRoot, "ui-inputs", `${inputId}.png`), "input.png");
  const fromDisk = async (file, limit, allowedRoots = [config.assetRoot, config.dataDir]) => {
    const canonical = await realpath4(file);
    const roots = await Promise.all(allowedRoots.map((r) => realpath4(r).catch(() => path19.resolve(r))));
    if (!roots.some((r) => {
      const rel = path19.relative(r, canonical);
      return rel === "" || !rel.startsWith("..") && !path19.isAbsolute(rel);
    })) throw unavailable("\u8BE5\u6587\u4EF6\u4E0D\u5728\u5DE5\u4F5C\u53F0\u7684\u7D20\u6750\u76EE\u5F55\u4E2D\u3002");
    if ((await stat9(canonical)).size > limit) throw unavailable("\u6587\u4EF6\u8D85\u8FC7\u4EA4\u4E92\u9884\u89C8\u5927\u5C0F\u9650\u5236\u3002");
    return readFile10(canonical);
  };
  return {
    rememberProjects(items) {
      const account = session.activeAccountFingerprint();
      if (account !== projectAccount) projects.clear();
      projectAccount = account;
      for (const project of items) projects.set(project.id, project);
      while (projects.size > 100) projects.delete(projects.keys().next().value);
    },
    async importImage({ data_base64, name }) {
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data_base64)) throw unavailable("\u56FE\u7247\u7F16\u7801\u65E0\u6548\u3002");
      const bytes = Buffer.from(data_base64, "base64");
      if (!bytes.length || bytes.length > MAX_IMAGE) throw unavailable("\u56FE\u7247\u5FC5\u987B\u5C0F\u4E8E 20 MB\u3002");
      const preview = await imagePayload(bytes, true);
      const inputId = randomUUID5();
      const filePath = await inputPath(inputId);
      await mkdir10(path19.dirname(filePath), { recursive: true, mode: 448 });
      const normalized = await sharp3(bytes, { limitInputPixels: 64 * 1024 * 1024 }).rotate().png().toBuffer();
      if (normalized.length > MAX_IMAGE) throw unavailable("\u89E3\u7801\u540E\u7684\u56FE\u7247\u8D85\u8FC7 20 MB\uFF0C\u8BF7\u538B\u7F29\u540E\u91CD\u65B0\u9009\u62E9\u3002");
      await writeFile5(filePath, normalized, { flag: "wx", mode: 384 });
      return { input_id: inputId, file_path: filePath, name: path19.basename(name).slice(0, 120), width: preview.width, height: preview.height, preview };
    },
    async preview(input) {
      if ([input.project_id, input.asset_id, input.task_id, input.input_id, input.local_path].filter(Boolean).length !== 1) throw unavailable("\u8BF7\u9009\u62E9\u4E00\u4E2A\u6A21\u578B\u3001\u56FE\u7247\u3001\u4EFB\u52A1\u6216\u5DF2\u4E0B\u8F7D\u6587\u4EF6\u3002");
      let projectId2 = input.project_id, assetId = input.asset_id, operatorId, file;
      const model = input.type === "model";
      if (input.local_path) {
        if (!path19.isAbsolute(input.local_path)) throw unavailable("\u8BF7\u63D0\u4F9B\u5DF2\u4E0B\u8F7D\u6587\u4EF6\u7684\u7EDD\u5BF9\u8DEF\u5F84\u3002");
        file = input.local_path;
      }
      if (input.input_id) file = await inputPath(input.input_id);
      if (input.task_id) {
        const task = await store.get(input.task_id);
        if (!task.kind.startsWith("local.") && task.account_fingerprint !== await session.accountFingerprint()) throw unavailable("\u4EFB\u52A1\u5C5E\u4E8E\u53E6\u4E00\u4E2A\u8D26\u53F7\u3002");
        if (task.kind.startsWith("local.") && task.status === "succeeded") {
          file = localArtifact(task, model ? "model" : task.kind === "local.render" ? "render" : task.kind === "local.project_texture" ? "texture" : "image", input.output_index ?? 0);
        } else {
          const result = task.result ?? {};
          if (model && result.models) {
            const selected = result.models[input.output_index ?? 0];
            if (!selected?.project_id || selected.status !== "succeeded") throw unavailable("\u6240\u9009\u6A21\u578B\u8F93\u51FA\u5C1A\u672A\u5B8C\u6210\u3002");
            projectId2 = selected.project_id;
            operatorId = selected.operator_id;
          } else {
            projectId2 = result.project_id ?? task.remote?.project_id ?? task.input_summary?.project_id;
            operatorId = model ? task.remote?.operator_id : void 0;
          }
          assetId = result.asset_id ?? task.remote?.asset_id;
          if (!projectId2 && !assetId) throw unavailable("\u4EFB\u52A1\u6682\u65F6\u6CA1\u6709\u53EF\u9884\u89C8\u7684\u8F93\u51FA\u3002");
        }
      }
      let bytes;
      if (file) bytes = await fromDisk(file, model ? MAX_MODEL : MAX_IMAGE, input.local_path ? config.outputRoots : void 0);
      else if (projectId2) {
        const account = await session.accountFingerprint();
        let detail = !model && account === projectAccount && projects.get(projectId2);
        if (!detail) detail = await gateway.getProject(projectId2, operatorId);
        if (detail.id && detail.id !== projectId2) throw unavailable("\u6A21\u578B\u6807\u8BC6\u4E0E\u8BF7\u6C42\u4E0D\u4E00\u81F4\u3002");
        const cover = detail.cover_image_object?.[0];
        const url = model ? detail.model_url : cover?.sizes?.find((s) => s.width >= 400)?.url ?? cover?.url ?? detail.cover_image?.[0];
        if (!url) throw unavailable(model ? "\u8FD9\u4E2A\u7248\u672C\u5C1A\u65E0\u53EF\u9884\u89C8\u7684 GLB\uFF0C\u8BF7\u7A0D\u540E\u5237\u65B0\u3002" : "\u8FD9\u4E2A\u6A21\u578B\u6CA1\u6709\u7F29\u7565\u56FE\u3002");
        bytes = await readPreviewUrl(url, model ? MAX_MODEL : MAX_IMAGE);
      } else if (assetId) {
        if (model) throw unavailable("\u56FE\u7247\u4E0D\u80FD\u4F5C\u4E3A 3D \u6A21\u578B\u9884\u89C8\u3002");
        const asset = await gateway.getStudioImageAsset(assetId);
        const output = asset.output.data[input.output_index ?? 0];
        if (asset.status !== "success" || !output?.url) throw unavailable("\u56FE\u7247\u5C1A\u672A\u751F\u6210\u5B8C\u6210\u3002");
        if (["reject", "nsfw", "sensitive"].includes(output.image_audit_result)) throw unavailable("\u6B64\u56FE\u7247\u7684\u5185\u5BB9\u5BA1\u6838\u72B6\u6001\u4E0D\u652F\u6301\u9884\u89C8\u3002");
        bytes = await readPreviewUrl(output.url, MAX_IMAGE);
      }
      if (!bytes) throw unavailable("\u6CA1\u6709\u53EF\u7528\u9884\u89C8\u3002");
      if (!model) return imagePayload(bytes, input.type === "image");
      bytes = await decodePreviewGlb(bytes);
      return { data_url: `data:model/gltf-binary;base64,${bytes.toString("base64")}`, mime_type: "model/gltf-binary", bytes: bytes.length, part_names: glbNodeNames(bytes).slice(0, 500) };
    }
  };
}
function registerWorkbenchMedia(server, media) {
  const meta = { ui: { visibility: ["app"] } };
  server.registerTool("tripo_ui_preview", {
    description: "Workbench-only bounded image or self-contained GLB preview. Signed URLs remain private; bytes go in app metadata only.",
    _meta: meta,
    annotations: { readOnlyHint: true },
    inputSchema: { project_id: id2.optional(), asset_id: id2.optional(), task_id: z17.string().uuid().optional(), input_id: z17.string().uuid().optional(), local_path: z17.string().min(1).max(4096).optional().describe("Saved file inside a configured output root; preview the exact downloaded artifact."), output_index: z17.number().int().min(0).max(15).default(0), type: z17.enum(["thumbnail", "image", "model"]).default("thumbnail") }
  }, async (input) => {
    try {
      const preview = await media.preview(input);
      return { ...ok({ mime_type: preview.mime_type, bytes: preview.bytes }, "\u9884\u89C8\u5DF2\u51C6\u5907\u5C31\u7EEA\u3002"), _meta: { tripo: { preview } } };
    } catch (error) {
      return fail2(error);
    }
  });
  server.registerTool("tripo_ui_import_image", {
    description: "Workbench-only import of a user-selected PNG/JPG/WebP image into the configured local asset folder. Does not upload or generate.",
    _meta: meta,
    inputSchema: { name: z17.string().min(1).max(255), data_base64: z17.string().min(4).max(Math.ceil(MAX_IMAGE / 3) * 4 + 4) }
  }, async (input) => {
    try {
      const { preview, ...info } = await media.importImage(input);
      return { ...ok(info, "\u56FE\u7247\u5DF2\u4FDD\u5B58\u5230\u672C\u5730\u7D20\u6750\u76EE\u5F55\u3002"), _meta: { tripo: { preview } } };
    } catch (error) {
      return fail2(error);
    }
  });
}

// src/ui/reviews.mjs
import path20 from "node:path";
import sharp4 from "sharp";
import { readdir as readdir2, readFile as readFile11, stat as stat10 } from "node:fs/promises";
import { z as z18 } from "zod";
var idPattern = /^[0-9a-f-]{36}$/i;
var editableStates = /* @__PURE__ */ new Set(["pending", "editing"]);
var ConfigurationReviews = class {
  constructor(runtime, { timeoutMs = 6e4, now = Date.now, schedule = setTimeout, unschedule = clearTimeout } = {}) {
    this.runtime = runtime;
    this.dir = path20.join(runtime.config.dataDir, "reviews");
    this.lock = new FileLock(path20.join(runtime.config.dataDir, "locks"));
    this.timeoutMs = timeoutMs;
    this.now = now;
    this.schedule = schedule;
    this.unschedule = unschedule;
    this.timers = /* @__PURE__ */ new Map();
  }
  doc(id3) {
    if (!idPattern.test(id3)) throw new TripoError("INVALID_INPUT", "Invalid configuration card id.");
    return new JsonDocument(path20.join(this.dir, `${id3}.json`));
  }
  schema(kind) {
    return z18.object({ ...getOperation(kind).inputShape, ...taskContextShape }).strict();
  }
  async owned(record) {
    if (!record) throw new TripoError("PLAN_NOT_FOUND", "Configuration card does not exist.");
    const fingerprint = getOperation(record.kind).category === "local" ? "local" : await this.runtime.session.accountFingerprint();
    if (record.account_fingerprint !== fingerprint) throw new TripoError("PLAN_MISMATCH", "Configuration card belongs to another account.");
    return record;
  }
  stop(id3) {
    if (this.timers.has(id3)) {
      this.unschedule(this.timers.get(id3));
      this.timers.delete(id3);
    }
  }
  arm(record) {
    this.stop(record.review_id);
    if (record.status !== "pending" || !Number.isFinite(record.deadline_at)) return;
    const timer = this.schedule(() => {
      this.timers.delete(record.review_id);
      this.action({ review_id: record.review_id, action: "confirm", automatic: true }).catch(async (error) => {
        await this.doc(record.review_id).update((r) => r.status === "pending" ? { ...r, status: "failed", deadline_at: null, error: errorSnapshot(error), revision: r.revision + 1 } : r).catch(() => {
        });
      });
    }, Math.max(0, record.deadline_at - this.now()));
    timer?.unref?.();
    this.timers.set(record.review_id, timer);
  }
  close() {
    for (const id3 of this.timers.keys()) this.stop(id3);
  }
  async recover() {
    const files = await readdir2(this.dir).catch((e) => {
      if (e.code === "ENOENT") return [];
      throw e;
    });
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      const record = await new JsonDocument(path20.join(this.dir, file)).read();
      if (record.status === "pending") await this.doc(record.review_id).update((r) => r.status === "pending" ? { ...r, deadline_at: null, revision: r.revision + 1 } : r);
      if (record.status === "submitting" && !this.processAlive(record.submitting_pid)) await this.doc(record.review_id).update((r) => ({ ...r, status: "failed", error: { code: "SUBMISSION_INTERRUPTED", message: "\u63D0\u4EA4\u88AB\u4E2D\u65AD\uFF0C\u8BF7\u67E5\u770B\u4EFB\u52A1\u72B6\u6001\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u8BD5\u3002" } }));
    }
  }
  processAlive(pid) {
    if (!pid) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
  async preview(reviewId, slot) {
    const record = await this.owned(await this.doc(reviewId).read());
    const task = await this.runtime.store.get(record.task_id);
    const snapshot = task.snapshots?.find((s) => s.slot === slot && ["png", "jpeg", "jpg", "webp"].includes(s.format));
    if (!snapshot) {
      const source = task.metadata?.studio_inputs?.find((s) => s.slot === slot);
      if (source && this.runtime.media) return this.runtime.media.preview({ asset_id: source.asset_id, output_index: source.output_index, type: "image" });
    }
    if (!snapshot) throw new TripoError("PREVIEW_UNAVAILABLE", "\u6B64\u89C6\u56FE\u6682\u65F6\u6CA1\u6709\u56FE\u7247\u3002");
    const file = await verifySnapshot(this.runtime.config, task.task_id, snapshot);
    if ((await stat10(file)).size > 20 * 1024 * 1024) throw new TripoError("PREVIEW_UNAVAILABLE", "\u8F93\u5165\u56FE\u7247\u8D85\u8FC7\u9884\u89C8\u5927\u5C0F\u9650\u5236\u3002");
    const bytes = await sharp4(await readFile11(file), { limitInputPixels: 64 * 1024 * 1024 }).rotate().resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    return { mime_type: "image/webp", data_url: `data:image/webp;base64,${bytes.toString("base64")}`, bytes: bytes.length };
  }
  async output(record) {
    const { task } = await this.runtime.service.get(record.task_id);
    if (editableStates.has(record.status) && task.status !== "staged") {
      record = await this.doc(record.review_id).update((r) => ({ ...r, status: task.status === "canceled" ? "canceled" : task.status === "expired" ? "failed" : "submitted", deadline_at: null, revision: r.revision + 1 }));
      this.stop(record.review_id);
    }
    return { review: {
      review_id: record.review_id,
      kind: record.kind,
      status: record.status,
      revision: record.revision,
      deadline_at: record.deadline_at,
      timeout_seconds: this.timeoutMs / 1e3,
      input: record.input,
      sources: [...task.snapshots?.filter((s) => ["png", "jpeg", "jpg", "webp"].includes(s.format)).map((s) => ({ slot: s.slot, name: s.source_name, label: s.label })) ?? [], ...task.metadata?.studio_inputs?.map((s) => ({ slot: s.slot, name: s.slot, label: s.slot })) ?? []],
      schema: z18.toJSONSchema(this.schema(record.kind), { io: "input", unrepresentable: "any" }),
      quote: task.cost_estimate,
      error: record.error ?? null
    }, task };
  }
  async create(kind, input, prepared) {
    const id3 = prepared.task.task_id;
    const record = await this.lock.withLock(`review-${id3}`, async () => {
      const old = await this.doc(id3).read();
      if (old) return this.owned(old);
      const parsed = this.schema(kind).parse({ ...input, submit: false });
      for (const [key, value] of Object.entries(prepared.task.effective_settings ?? {}))
        if (key in this.schema(kind).shape && parsed[key] === void 0 && value !== void 0) parsed[key] = value;
      const r = {
        review_id: id3,
        task_id: id3,
        kind,
        input: parsed,
        account_fingerprint: prepared.task.account_fingerprint,
        status: "pending",
        revision: 0,
        deadline_at: null
      };
      await this.doc(id3).write(r);
      return r;
    });
    this.arm(record);
    return { ...prepared, ...await this.output(record) };
  }
  async action({ review_id, action, revision, input, automatic = false }) {
    let dispatch;
    const record = await this.lock.withLock(`review-${review_id}`, async () => {
      let r = await this.owned(await this.doc(review_id).read());
      if (action === "get") return r;
      if (automatic && (r.status !== "pending" || !Number.isFinite(r.deadline_at) || r.deadline_at > this.now())) {
        this.arm(r);
        return r;
      }
      if (revision !== void 0 && revision !== r.revision) throw new TripoError("PLAN_MISMATCH", "\u914D\u7F6E\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u5237\u65B0\u5361\u7247\u3002");
      if (!editableStates.has(r.status)) return r;
      if (action === "ready") {
        if (r.status !== "pending" || Number.isFinite(r.deadline_at)) return r;
        r.deadline_at = this.now() + this.timeoutMs;
        await this.doc(review_id).write(r);
        this.arm(r);
        return r;
      } else if (action === "edit") {
        r.status = "editing";
        r.deadline_at = null;
      } else if (action === "cancel") {
        await this.runtime.service.cancel(r.task_id);
        r.status = "canceled";
        r.deadline_at = null;
      } else if (action === "save") {
        if (r.status !== "editing") throw new TripoError("STAGING_REQUIRED", "\u5148\u6682\u505C\u5012\u8BA1\u65F6\uFF0C\u518D\u4FEE\u6539\u914D\u7F6E\u3002");
        const parsed = this.schema(r.kind).parse({ ...input, submit: false });
        const prepared = await this.runtime.service.prepare(r.kind, parsed);
        if (prepared.task.status !== "staged") throw new TripoError("STAGING_REQUIRED", "\u76F8\u540C\u914D\u7F6E\u7684\u4EFB\u52A1\u5DF2\u63D0\u4EA4\uFF0C\u8BF7\u67E5\u770B\u5DF2\u6709\u4EFB\u52A1\u3002");
        if (this.runtime.pricing && this.runtime.store) {
          const frozen = await this.runtime.store.get(prepared.task.task_id);
          const quote = await this.runtime.pricing.quote(r.kind, {}, { task: frozen, refresh: true });
          await this.runtime.store.update(frozen.task_id, (task) => ({ ...task, cost_estimate: quote }));
        }
        if (prepared.task.task_id !== r.task_id) await this.runtime.service.cancel(r.task_id);
        r = { ...r, input: parsed, task_id: prepared.task.task_id, status: "pending", deadline_at: null, error: null };
      } else if (action === "confirm") {
        if (r.status === "editing") throw new TripoError("STAGING_REQUIRED", "\u8BF7\u5148\u4FDD\u5B58\u914D\u7F6E\u5E76\u66F4\u65B0\u62A5\u4EF7\u3002");
        const { task } = await this.runtime.service.get(r.task_id);
        if (task.status !== "staged") {
          r.status = "submitted";
          r.deadline_at = null;
        } else {
          const quote = task.cost_estimate;
          if (quote?.estimate_expires_at && Date.parse(quote.estimate_expires_at) <= this.now()) {
            r.status = "editing";
            r.deadline_at = null;
            r.error = { code: "QUOTE_EXPIRED", message: "\u62A5\u4EF7\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u4FDD\u5B58\u914D\u7F6E\u66F4\u65B0\u62A5\u4EF7\u540E\u7EE7\u7EED\u3002" };
          } else {
            r.status = "submitting";
            r.submitting_pid = process.pid;
            r.deadline_at = null;
            dispatch = { task_id: r.task_id, confirmation: task.confirmation, requestHash: task.request_hash };
          }
        }
      } else throw new TripoError("INVALID_INPUT", "Unknown configuration action.");
      r.revision++;
      await this.doc(review_id).write(r);
      this.arm(r);
      return r;
    });
    if (dispatch) {
      try {
        await this.runtime.service.submit(dispatch.task_id, { confirmation: dispatch.confirmation, requestHash: dispatch.requestHash });
        await this.doc(review_id).update((r) => ({ ...r, status: "submitted", revision: r.revision + 1, error: null }));
      } catch (error) {
        await this.doc(review_id).update((r) => ({ ...r, status: "failed", revision: r.revision + 1, error: errorSnapshot(error) }));
      }
      return this.output(await this.doc(review_id).read());
    }
    return this.output(record);
  }
};

// src/ops/asset-groups.mjs
function assetCharacterIndex(records, account) {
  const index = /* @__PURE__ */ new Map();
  for (const task of records) {
    if (task.account_fingerprint !== account || ["staged", "canceled", "failed", "expired"].includes(task.status)) continue;
    const refs = /* @__PURE__ */ new Set();
    const walk = (value) => {
      if (!value || typeof value !== "object") return;
      for (const [key, item] of Object.entries(value)) {
        if (["project_id", "asset_id"].includes(key) && typeof item === "string") refs.add(`${key}:${item}`);
        else if (key === "project_ids" && Array.isArray(item)) item.filter((id3) => typeof id3 === "string").forEach((id3) => refs.add(`project_id:${id3}`));
        else if (typeof item === "object") walk(item);
      }
    };
    walk(task.remote);
    walk(task.result);
    for (const ref of refs) if (!index.has(ref)) index.set(ref, task.character_group ?? null);
  }
  return index;
}
function assetCharacterGroups(index) {
  const groups = /* @__PURE__ */ new Map([[UNGROUPED, { id: UNGROUPED, name: "\u672A\u5206\u7EC4" }]]);
  for (const group of index.values()) if (group) groups.set(group.id, { id: group.id, name: group.name });
  return [...groups.values()];
}
async function characterAssetPage({ fetchPage, annotate, characterGroupId, offset = 0, limit = 20 }) {
  if (characterGroupId === void 0) {
    const page = await fetchPage(offset);
    return { ...page, items: page.items.map(annotate) };
  }
  const matches = [];
  let cursor = 0, skipped = 0;
  for (; ; ) {
    const page = await fetchPage(cursor);
    for (const raw of page.items) {
      const asset = annotate(raw);
      if ((asset.character_group?.id ?? UNGROUPED) !== characterGroupId) continue;
      if (skipped++ < offset) continue;
      matches.push(asset);
      if (matches.length > limit) return { items: matches.slice(0, limit), next_offset: offset + limit, total: null };
    }
    if (page.next_offset === null || page.next_offset <= cursor || !page.items.length) return { items: matches, next_offset: null, total: null };
    cursor = page.next_offset;
  }
}

// src/store/asset-groups.mjs
import path21 from "node:path";
import { randomUUID as randomUUID6 } from "node:crypto";
var assetKey = (asset) => asset.project_id ? `project_id:${asset.project_id}` : `asset_id:${asset.asset_id}`;
var AssetGroupStore = class {
  constructor(dataDir) {
    this.doc = new JsonDocument(path21.join(dataDir, "asset-groups.json"));
    this.lock = new FileLock(path21.join(dataDir, "locks"));
  }
  async read(account) {
    const state = await this.doc.read({ accounts: {} });
    return state.accounts[account] ?? { groups: {}, assignments: {} };
  }
  async assign(account, assets2, { name, group, knownGroups = [] } = {}) {
    return this.lock.withLock("asset-groups", async () => {
      const state = await this.doc.read({ accounts: {} });
      const current = state.accounts[account] ?? { groups: {}, assignments: {} };
      const known = new Map(knownGroups.map((g) => [g.id, g]));
      for (const saved of Object.values(current.groups)) known.set(saved.id, saved);
      let target = group ? known.get(group.id) ?? group : null;
      if (name !== void 0) {
        const named = characterGroup(name, account, "manual");
        target = [...known.values()].find((g) => normalizedCharacter(g.name) === normalizedCharacter(named.name)) ?? { ...named, id: `group_${randomUUID6()}` };
      }
      if (target?.id === "ungrouped") throw new TripoError("INVALID_INPUT", "Choose a named group.");
      if (target) current.groups[target.id] = { ...target, assigned_by: "manual" };
      for (const asset of assets2) current.assignments[assetKey(asset)] = target?.id ?? null;
      state.accounts[account] = current;
      await this.doc.write(state);
      return target;
    });
  }
  async rename(account, group, name, knownGroups = []) {
    const normalizedName = characterGroup(name, account, "manual").name;
    return this.lock.withLock("asset-groups", async () => {
      const state = await this.doc.read({ accounts: {} });
      const current = state.accounts[account] ?? { groups: {}, assignments: {} };
      const known = new Map(knownGroups.map((g) => [g.id, g]));
      for (const saved of Object.values(current.groups)) known.set(saved.id, saved);
      if ([...known.values()].some((g) => g.id !== group.id && normalizedCharacter(g.name) === normalizedCharacter(normalizedName))) {
        throw new TripoError("GROUP_NAME_CONFLICT", "Another asset group already uses this name. Choose a different name, or move assets into that existing group.");
      }
      const renamed = { ...current.groups[group.id] ?? group, name: normalizedName, assigned_by: "manual" };
      current.groups[group.id] = renamed;
      state.accounts[account] = current;
      await this.doc.write(state);
      return renamed;
    });
  }
};
function applyAssetAssignments(index, saved) {
  const result = new Map([...index].map(([key, group]) => [key, group ? saved.groups[group.id] ?? group : null]));
  for (const [key, id3] of Object.entries(saved.assignments)) result.set(key, id3 === null ? null : saved.groups[id3] ?? null);
  return result;
}

// src/studio/model-metadata.mjs
var GENERATION_OPERATIONS = ["text_to_model", "image_to_model", "image_prompt_to_model", "multiview_to_model", "batch_image_to_model"];
var versionString = (value) => typeof value === "string" && value.length > 0 && value.length <= 128 && value !== "default" ? value : null;
function modelGenerationMetadata(asset) {
  const operator = asset.operator;
  let version = null;
  if (asset.type !== "upload") {
    for (const key of GENERATION_OPERATIONS) {
      version = versionString(operator?.[key]?.model_version);
      if (version) break;
    }
    if (!version && (!operator?.type || GENERATION_OPERATIONS.includes(operator.type))) {
      version = versionString(operator?.model_version);
    }
  }
  const nexus = typeof operator?.is_nexus_mesh === "boolean" ? operator.is_nexus_mesh : typeof asset.is_nexus_mesh === "boolean" ? asset.is_nexus_mesh : null;
  return { model_version: version, is_nexus_mesh: version?.startsWith("Nexus-") ? true : nexus };
}

// src/ui/asset-library.mjs
function modelCard(asset) {
  return {
    ...modelGenerationMetadata(asset),
    project_id: asset.id,
    name: asset.project_name ?? asset.biz_info?.short_description ?? asset.id,
    created_at: asset.create_time ?? null,
    visibility: asset.visibility ?? null,
    source_type: asset.type ?? null,
    running: asset.running_operator != null,
    is_owner: asset.is_owner === true,
    thumbnail_available: Boolean(asset.cover_image?.[0] || asset.cover_image_object?.[0]?.url)
  };
}
function imageCard(asset) {
  return {
    asset_id: asset.asset_id,
    created_at: asset.create_time ?? null,
    type: asset.type,
    status: asset.status,
    input: { prompt: asset.input.prompt ?? asset.input.prompt_text ?? null },
    output_count: asset.output.data.length
  };
}
function libraryEntries(assets2, groupId2) {
  const groups = /* @__PURE__ */ new Map(), loose = [];
  for (const asset of assets2) {
    const group = asset.character_group;
    if (!group) {
      loose.push(asset);
      continue;
    }
    if (!groups.has(group.id)) groups.set(group.id, { entry_type: "group", group_id: group.id, name: group.name, count: 0, covers: [], created_at: asset.created_at });
    const entry = groups.get(group.id);
    entry.count++;
    if (entry.covers.length < 4) entry.covers.push(asset);
    if ((Date.parse(asset.created_at) || 0) > (Date.parse(entry.created_at) || 0)) entry.created_at = asset.created_at;
  }
  const summaries = [...groups.values()];
  const entries = groupId2 ? (groupId2 === "ungrouped" ? loose : assets2.filter((a) => a.character_group?.id === groupId2)).map((a) => ({ ...a, entry_type: "asset" })) : [...summaries, ...loose.map((a) => ({ ...a, entry_type: "asset" }))];
  return { entries, groups: summaries };
}
var AssetLibrary = class {
  constructor({ config, gateway, session, store, media }) {
    Object.assign(this, { gateway, session, store, media });
    this.groupStore = new AssetGroupStore(config.dataDir);
    this.cache = /* @__PURE__ */ new Map();
  }
  async catalog(account, type, filter, refresh = false) {
    const key = JSON.stringify([account, type, filter]);
    const cached = this.cache.get(key);
    if (!refresh && cached && cached.expires > Date.now()) return cached.promise;
    const promise = (async () => {
      const assets2 = [], seen = /* @__PURE__ */ new Set();
      let offset = 0, pageNum = 1;
      for (; ; ) {
        const page = type === "models" ? await this.gateway.listModels({ assetScope: "mine", filter, offset }) : await this.gateway.listStudioImageAssets(pageNum, 100);
        const raw = type === "models" ? page.projects : page.assets;
        if (type === "models") this.media?.rememberProjects(raw);
        let added = 0;
        for (const item of raw) {
          const card = type === "models" ? modelCard(item) : imageCard(item), id3 = assetKey(card);
          if (!seen.has(id3)) {
            seen.add(id3);
            assets2.push(card);
            added++;
          }
        }
        offset += raw.length;
        pageNum++;
        if (!raw.length || !added || (type === "models" ? offset >= page.total : raw.length < 100)) break;
      }
      return assets2;
    })();
    const entry = { promise, expires: Date.now() + 3e4 };
    this.cache.set(key, entry);
    promise.catch(() => {
      if (this.cache.get(key) === entry) this.cache.delete(key);
    });
    return promise;
  }
  async context(type, filter = "all", refresh = false) {
    const account = await this.session.accountFingerprint();
    const catalog = type === "all" ? Promise.all([this.catalog(account, "models", filter, refresh), this.catalog(account, "images", "all", refresh)]).then((pages) => pages.flat()) : this.catalog(account, type, filter, refresh);
    const [assets2, records, saved] = await Promise.all([catalog, this.store.list({ limit: 5e3 }), this.groupStore.read(account)]);
    const sourceIndex = assetCharacterIndex(records, account);
    const sourceGroups = [...sourceIndex.values()].filter(Boolean);
    const index = applyAssetAssignments(sourceIndex, saved);
    const annotated = assets2.map((a) => ({ ...a, character_group: index.get(assetKey(a)) ?? null }));
    await this.assertAccount(account);
    return { account, assets: annotated, saved, index, sourceGroups };
  }
  async identities() {
    const account = await this.session.accountFingerprint();
    const [records, saved] = await Promise.all([this.store.list({ limit: 5e3 }), this.groupStore.read(account)]);
    await this.assertAccount(account);
    const sourceIndex = assetCharacterIndex(records, account);
    return { account, saved, index: applyAssetAssignments(sourceIndex, saved), sourceGroups: [...sourceIndex.values()].filter(Boolean) };
  }
  knownGroups({ index, saved, sourceGroups = [] }) {
    const known = /* @__PURE__ */ new Map();
    for (const group of sourceGroups) known.set(group.id, group);
    for (const group of index.values()) if (group) known.set(group.id, group);
    for (const group of Object.values(saved.groups)) known.set(group.id, group);
    return [...known.values()];
  }
  async assertAccount(account) {
    if (await this.session.accountFingerprint() !== account) throw new TripoError("PLAN_MISMATCH", "The active account changed. Refresh the library before grouping assets.");
  }
  async listGroups({ offset = 0, limit = 100, search: search2 = "", include_empty = true, refresh = false } = {}) {
    const context = await this.context("all", "all", refresh);
    const known = new Map(this.knownGroups(context).map((g) => [g.id, { id: g.id, name: g.name, model_count: 0, image_count: 0, total: 0 }]));
    for (const asset of context.assets) {
      if (!asset.character_group) continue;
      const group = known.get(asset.character_group.id);
      group[asset.project_id ? "model_count" : "image_count"]++;
      group.total++;
    }
    const query = search2.trim().toLocaleLowerCase();
    const groups = [...known.values()].filter((g) => (include_empty || g.total > 0) && g.name.toLocaleLowerCase().includes(query)).sort((a, b) => a.name.localeCompare(b.name));
    return { groups: groups.slice(offset, offset + limit), total: groups.length, offset, next_offset: offset + limit < groups.length ? offset + limit : null };
  }
  async list({ type = "models", filter = "all", group_id, offset = 0, limit = 20, search: search2 = "", sort = "recent", refresh = false } = {}) {
    const context = await this.context(type, filter, refresh), { assets: assets2 } = context;
    const { entries, groups } = libraryEntries(assets2, group_id);
    const known = new Map(groups.map((g) => [g.group_id, { id: g.group_id, name: g.name, count: g.count }]));
    for (const group of this.knownGroups(context)) if (!known.has(group.id)) known.set(group.id, { id: group.id, name: group.name, count: 0 });
    if (group_id && group_id !== "ungrouped" && !known.has(group_id)) throw new TripoError("INVALID_INPUT", "The selected group no longer exists in this account. Refresh the library.");
    let filtered = entries;
    if (search2.trim()) {
      const query = search2.trim().toLocaleLowerCase();
      filtered = entries.filter((e) => `${e.name ?? e.input?.prompt ?? e.type ?? ""} ${e.character_group?.name ?? ""}`.toLocaleLowerCase().includes(query) || e.entry_type === "group" && assets2.some((a) => a.character_group?.id === e.group_id && `${a.name ?? a.input?.prompt ?? ""}`.toLocaleLowerCase().includes(query)));
    }
    filtered = [...filtered].sort((a, b) => sort === "name" ? String(a.name ?? a.input?.prompt ?? a.type).localeCompare(String(b.name ?? b.input?.prompt ?? b.type)) : (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
    return {
      entries: filtered.slice(offset, offset + limit),
      groups: [...known.values()],
      group: group_id ? known.get(group_id) ?? null : null,
      total: filtered.length,
      asset_count: assets2.length,
      next_offset: offset + limit < filtered.length ? offset + limit : null,
      offset
    };
  }
  async assign({ type = "all", assets: assets2, name, group_id }, { allowEmpty = false } = {}) {
    if (name !== void 0 && group_id !== void 0) throw new TripoError("INVALID_INPUT", "Specify a name to create a group, or a group_id to change membership, not both.");
    if (!Array.isArray(assets2) || !assets2.length && !(allowEmpty && name !== void 0)) throw new TripoError("INVALID_INPUT", "Select at least one asset.");
    const context = assets2.length ? await this.context(type, "all", true) : await this.identities();
    const allowed = new Set((context.assets ?? []).map(assetKey));
    if (assets2.some((a) => Boolean(a.project_id) === Boolean(a.asset_id) || !allowed.has(assetKey(a)) || (type === "models" ? !a.project_id : type === "images" ? !a.asset_id : false))) throw new TripoError("INVALID_INPUT", "Some selected assets are no longer in this account\u2019s library. Refresh and select them again.");
    const unique = [...new Map(assets2.map((a) => [assetKey(a), a])).values()];
    const known = this.knownGroups(context);
    let group = null;
    if (group_id) {
      group = known.find((g) => g.id === group_id);
      if (!group) throw new TripoError("INVALID_INPUT", "The selected group no longer exists. Refresh the library.");
    }
    await this.assertAccount(context.account);
    const result = await this.groupStore.assign(context.account, unique, { name, group, knownGroups: known });
    return { group: result, assigned: unique.length, paid_request_sent: false };
  }
  async createGroup({ name, assets: assets2 = [] }) {
    return this.assign({ name, assets: assets2 }, { allowEmpty: true });
  }
  async renameGroup({ group_id, name }) {
    const context = await this.identities(), known = this.knownGroups(context);
    const group = known.find((g) => g.id === group_id);
    if (!group) throw new TripoError("INVALID_INPUT", "The selected group no longer exists in this account. Refresh the library.");
    await this.assertAccount(context.account);
    return { group: await this.groupStore.rename(context.account, group, name, known), paid_request_sent: false };
  }
};

// src/ops/asset-group-tools.mjs
import { z as z19 } from "zod";
var identifier3 = z19.string().regex(/^[^\s\u0000-\u001f\u007f]{1,256}$/);
var groupId = z19.string().min(1).max(80).describe("Exact group id returned by tripo_list_asset_groups or a create/rename result. Do not substitute the display name or a task/workflow id.");
var assets = z19.array(z19.union([
  z19.object({ project_id: identifier3.describe("Owned model project_id returned by a model catalog or group member query; not a task_id.") }).strict(),
  z19.object({ asset_id: identifier3.describe("Owned image asset_id returned by an image catalog or group member query; not an output index or local file path.") }).strict()
])).max(500).describe("Up to 500 selected assets. Each entry has exactly one key: {project_id} for a model or {asset_id} for an image. Both types may be mixed; duplicates count once. All entries are validated before this batch is saved.");
var groupName = characterName.describe("Readable group display name, 1\u201380 characters. Matching ignores NFKC variants, repeated whitespace and letter case. Use the user\u2019s intended name; a manual group need not be a character.");
var paging = {
  offset: z19.number().int().min(0).max(1e6).default(0).describe("Start at 0; pass the previous result\u2019s next_offset to continue until it is null."),
  limit: z19.number().int().min(1).max(200).default(100).describe("Maximum entries returned on this page, 1\u2013200. Counts describe the complete matching collection, not only this page.")
};
var search = {
  search: z19.string().max(1e3).default("").describe("Case-insensitive substring filter. Empty string includes all entries in the selected scope."),
  refresh: z19.boolean().default(false).describe("Fetch current Studio catalogs instead of reusing the up-to-30-second catalog cache. Saved local membership and names are read on every query.")
};
function registerAssetGroupTools(tool, library) {
  tool("tripo_list_asset_groups", {
    annotations: { readOnlyHint: true },
    description: 'Discover the groups shown in the Assets workbench when the user asks to organize assets, find a character\u2019s models/images, or choose a destination group. Returns groups with id, name, model_count, image_count and total, plus pagination next_offset. Includes manual and automatic character groups, including empty groups by default. Use the returned id with tripo_list_group_assets, tripo_set_asset_group or tripo_rename_asset_group. Ungrouped assets are queried separately with tripo_list_group_assets(group_id:"ungrouped"). Scoped to the active Studio account; read-only and no credits.',
    inputSchema: { ...paging, ...search, include_empty: z19.boolean().default(true).describe("Include groups with zero current catalog members. Set false when only populated workbench cards are wanted.") }
  }, async (input) => ok(await library.listGroups(input)));
  tool("tripo_list_group_assets", {
    annotations: { readOnlyHint: true },
    description: 'Inspect or collect the members of one asset group before viewing, moving or removing them. Returns paged assets with model project_id or image asset_id, group metadata, matching total and next_offset; follow next_offset to collect every matching member. Defaults to models and images together. Use a discovered group id, or the literal "ungrouped" for assets with no membership. Empty groups return no assets. This reads asset membership, not task history; use tripo_get_task for recorded task provenance. Read-only and no credits.',
    inputSchema: { group_id: groupId.describe('Exact discovered group id, or the literal "ungrouped" to list loose assets.'), type: z19.enum(["all", "models", "images"]).default("all").describe("all includes both model and image members; models/images selects only that asset type."), ...paging, ...search, sort: z19.enum(["recent", "name"]).default("recent").describe("recent sorts newest first; name sorts model names or image prompts alphabetically.") }
  }, async (input) => {
    const result = await library.list(input);
    const { entries, ...rest } = result;
    return ok({ ...rest, assets: entries });
  });
  tool("tripo_create_asset_group", {
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    description: "Create an asset group when the user asks to group selected models/images or prepare a named collection. Pass name and optional assets; omit assets to create an empty group. If a group already has the same normalized name, reuse it and add the supplied members. Selected assets move out of their previous groups; they are not duplicated. Returns group.id, group.name and the unique assigned count. Populated groups appear as one preview card per asset type with a member count; empty groups remain queryable but have no root card. Saves local membership for the active account, shared with the workbench. No generation, Studio writes or credits.",
    inputSchema: { name: groupName, assets: assets.default([]) }
  }, async (input) => ok(await library.createGroup(input)));
  tool("tripo_set_asset_group", {
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    description: "Change the membership of selected existing assets when the user asks to add to a group, move between groups, or remove from a group. Pass an existing group_id to add/move; pass JSON null to remove membership, including an automatic character assignment. Removal keeps the assets and explicitly prevents automatic regrouping from their recorded task lineage. Each asset has one group. Supply 1\u2013500 model/image references; every reference is validated before this batch is saved, and any invalid reference rejects the whole batch. Returns the destination group (null for removal) and unique assigned count. Create a missing destination with tripo_create_asset_group first. Changes local asset membership only; no task edits, deletion, Studio writes or credits.",
    inputSchema: { group_id: groupId.nullable().describe('Existing destination group id to add/move members, or JSON null to leave them ungrouped. The string "ungrouped" is read-only and is not a write destination.'), assets: assets.min(1) }
  }, async (input) => ok(await library.assign(input)));
  tool("tripo_rename_asset_group", {
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    description: "Rename the display name of an existing manual or automatic asset group when the user asks to change its name. Pass the discovered group_id and new name. Preserves the group id and all model/image memberships, updates both asset pages, and applies the name to later outputs linked to the same automatic group identity. Returns the updated group. A name used by another group returns GROUP_NAME_CONFLICT; renaming never merges groups. To merge, collect the source members with tripo_list_group_assets and move them with tripo_set_asset_group. Does not rename Studio assets or change task character_name/lineage. Local only; no credits.",
    inputSchema: { group_id: groupId, name: groupName }
  }, async (input) => ok(await library.renameGroup(input)));
}

// src/server.mjs
var identifier4 = z20.string().regex(/^[^\s\u0000-\u001f\u007f]{1,256}$/);
var taskIdShape = z20.string().uuid().describe("Plugin task id returned by any tripo_* creation tool.");
var OPERATION_TOOLS = {
  "image.generate": "tripo_generate_image",
  "image.multiview": "tripo_generate_multiview",
  "image.regenerate": "tripo_regenerate_image",
  "model.animate": "tripo_animate_model",
  "model.export": "tripo_export_model",
  "model.uv_generate": "tripo_generate_uv",
  "model.uv_apply": "tripo_apply_uv",
  "motion.generate": "tripo_generate_motion",
  "model.apply_motion": "tripo_apply_motion",
  "image.upscale": "tripo_upscale_image",
  "image.split": "tripo_split_image",
  "local.render": "tripo_render_model",
  "local.inspect_parts": "tripo_inspect_local_parts",
  "local.edit_parts": "tripo_edit_parts",
  "local.project_texture": "tripo_bake_texture_projection",
  "local.paint": "tripo_paint_texture",
  "local.crop": "tripo_crop_image",
  "model.complete_parts": "tripo_complete_parts",
  "model.generate": "tripo_generate_model",
  "model.import": "tripo_import_model",
  "model.remesh": "tripo_remesh_model",
  "model.rig": "tripo_rig_model",
  "model.segment": "tripo_segment_model",
  "texture.edit_apply": "tripo_apply_texture_edits",
  "texture.edit_preview": "tripo_preview_texture_edit",
  "texture.generate": "tripo_generate_texture",
  "texture.pbr": "tripo_generate_pbr",
  "texture.upscale": "tripo_upscale_texture"
};
async function main() {
  const runtime = await createRuntime();
  const { auth, config, gateway, service, session, store, pricing } = runtime;
  const icon = await readFile12(path22.join(path22.dirname(fileURLToPath2(import.meta.url)), "..", "ui", "tripo-logo.png"));
  const icons = [{ src: `data:image/png;base64,${icon.toString("base64")}`, mimeType: "image/png", sizes: ["60x60"] }];
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION, icons });
  const setRequestHandler = server.server.setRequestHandler.bind(server.server);
  server.server.setRequestHandler = (schema, handler) => setRequestHandler(schema, async (request, extra) => {
    const result = await handler(request, extra);
    if (request.method !== "tools/list") return result;
    return { ...result, tools: result.tools.map((tool2) => tool2.name === "tripo_open_workbench" ? { ...tool2, icons } : tool2) };
  });
  new OpenAIExtensions(server);
  const media = createWorkbenchMedia(runtime);
  registerWorkbenchMedia(server, media);
  const assetLibrary = new AssetLibrary({ ...runtime, media });
  server.registerTool("tripo_ui_asset_library", {
    description: "Browse asset/group cards and persist multi-selected assets in a named local group. Group membership never submits Studio operations or consumes credits.",
    _meta: { ui: { visibility: ["app"] } },
    inputSchema: { action: z20.enum(["list", "assign"]), type: z20.enum(["models", "images"]).default("models"), filter: z20.enum(["all", "rigged", "smart_mesh", "textured", "untextured"]).default("all"), group_id: z20.string().max(80).optional(), name: characterName.optional(), assets: z20.array(z20.union([z20.object({ project_id: identifier4 }).strict(), z20.object({ asset_id: identifier4 }).strict()])).min(1).max(500).optional(), offset: z20.number().int().min(0).max(1e6).default(0), limit: z20.number().int().min(1).max(100).default(20), search: z20.string().max(1e3).default(""), sort: z20.enum(["recent", "name"]).default("recent"), refresh: z20.boolean().default(false) }
  }, async (input) => {
    try {
      return ok(await (input.action === "list" ? assetLibrary.list(input) : assetLibrary.assign(input)));
    } catch (error) {
      return fail2(error);
    }
  });
  const reviews = new ConfigurationReviews({ ...runtime, media });
  await reviews.recover();
  server.registerTool("tripo_ui_review", {
    description: "Configuration card actions: acknowledge visible controls to start the 60-second window, pause editing, save and requote, confirm, cancel, or read status. Confirmation or the authorized deadline submits the durable task once.",
    _meta: { ui: { visibility: ["app"] } },
    inputSchema: { review_id: taskIdShape, action: z20.enum(["get", "ready", "edit", "save", "confirm", "cancel", "preview"]), slot: z20.string().max(100).optional(), revision: z20.number().int().optional(), input: z20.record(z20.string(), z20.unknown()).optional() }
  }, async (input) => {
    try {
      if (input.action === "preview") {
        const preview = await reviews.preview(input.review_id, input.slot);
        return { ...ok({ mime_type: preview.mime_type, bytes: preview.bytes }), _meta: { tripo: { preview } } };
      }
      return ok(await reviews.action(input));
    } catch (error) {
      return fail2(error);
    }
  });
  const tool = (name, { card = false, ...meta }, handler) => registerAppTool(server, name, { ...meta, _meta: { ui: { ...card ? { resourceUri: RESULT_CARD_RESOURCE_URI } : {}, visibility: name === "tripo_auth_import" ? ["model"] : ["model", "app"] } } }, async (input) => {
    let result;
    try {
      result = await handler(input);
    } catch (error) {
      result = fail2(error);
    }
    return { ...result, _meta: { ...result._meta, tripo: { ...result._meta?.tripo, tool_name: name, presentation: card ? "card" : "data" } } };
  });
  registerAssetGroupTools(tool, assetLibrary);
  tool(
    "tripo_auth_login",
    {
      description: "Log into Tripo Studio. Reuses your existing browser session when one is valid; otherwise opens Tripo Studio once in your default browser and waits for sign-in. Afterwards everything runs headlessly \u2014 no browser stays open. headless_only=true only re-reads the browser session without opening anything.",
      inputSchema: { headless_only: z20.boolean().optional() }
    },
    async ({ headless_only }) => {
      if (headless_only) {
        const refreshed = await auth.refresh();
        if (!refreshed) throw new TripoError("AUTH_REQUIRED", "No usable Tripo Studio session was found in the browser cookie store; run tripo_auth_login without headless_only to sign in.", { nextAction: "tripo_auth_login" });
        return ok({ refreshed: true, session: await session.status() });
      }
      const status = await auth.login();
      return ok({ session: status }, "Tripo Studio session captured; the plugin now works headlessly.");
    }
  );
  tool(
    "tripo_auth_status",
    { description: "Report whether a usable Tripo Studio session exists (no credentials returned).", inputSchema: {} },
    async () => ok({ session: await session.status(), account_fingerprint: session.activeAccountFingerprint() })
  );
  tool(
    "tripo_auth_import",
    {
      description: "Import a Tripo Studio session cookie directly (ory_kratos_session value) \u2014 for machines without a browser. Validated against the API before it is stored.",
      inputSchema: { session_cookie: z20.string().min(10).max(8192) }
    },
    async ({ session_cookie }) => ok({ session: await auth.importCookie(session_cookie) }, "Tripo Studio session imported and validated.")
  );
  tool(
    "tripo_auth_logout",
    { description: "Clear the persisted Tripo session. The browser's own sign-in is untouched.", inputSchema: {} },
    async () => ok(await auth.logout())
  );
  tool(
    "tripo_get_payment",
    { description: "Read-only Tripo account plan/credit summary (fields depend on Studio's response).", inputSchema: {} },
    async () => ok({ payment: await gateway.getPaymentSummary() })
  );
  tool(
    "tripo_list_models",
    {
      description: "List Studio model projects. Returns paging offsets, card metadata and url_available flags (never raw URLs).",
      inputSchema: {
        asset_scope: z20.enum(["mine", "collected", "team"]).default("mine"),
        filter: z20.enum(["all", "rigged", "smart_mesh", "textured", "untextured"]).default("all"),
        offset: z20.number().int().min(0).max(1e6).default(0),
        character_group_id: z20.string().max(80).optional().describe("Filter assets by a local character group before pagination; ungrouped selects assets without a recorded character.")
      }
    },
    async (input) => {
      const account = await session.accountFingerprint();
      const index = applyAssetAssignments(assetCharacterIndex(await store.list({ limit: 5e3 }), account), await assetLibrary.groupStore.read(account));
      const page = await characterAssetPage({
        characterGroupId: input.character_group_id,
        offset: input.offset,
        annotate: (asset) => ({ ...asset, character_group: index.get(`project_id:${asset.id}`) ?? null }),
        fetchPage: async (offset) => {
          const remote = await gateway.listModels({ assetScope: input.asset_scope, filter: input.filter, offset });
          media.rememberProjects(remote.projects);
          const consumed = offset + remote.projects.length;
          return { ...remote, items: remote.projects, next_offset: consumed < remote.total && remote.projects.length ? consumed : null };
        }
      });
      return ok({
        asset_scope: input.asset_scope,
        filter: input.filter,
        max_assets: page.max_assets,
        character_groups: assetCharacterGroups(index),
        models: page.items.map((asset) => ({
          ...modelGenerationMetadata(asset),
          character_group: asset.character_group,
          collected: asset.collected === true,
          content_warning: asset.is_nsfw === true || ["nsfw", "sensitive"].includes((asset.content_risk_level ?? "").toLowerCase()),
          created_at: asset.create_time ?? null,
          description: asset.biz_info?.short_description ?? null,
          is_owner: asset.is_owner === true,
          name: asset.project_name ?? asset.biz_info?.short_description ?? asset.id,
          open_path: `/workspace/generate/${encodeURIComponent(asset.id)}`,
          page_offset: input.offset,
          project_id: asset.id,
          running: asset.running_operator !== void 0 && asset.running_operator !== null,
          source_type: asset.type ?? null,
          thumbnail_available: Boolean(asset.cover_image?.[0] || asset.cover_image_object?.[0]?.url),
          visibility: asset.visibility ?? null
        })),
        next_offset: page.next_offset,
        offset: input.offset,
        page_size: 20,
        total: page.total
      });
    }
  );
  tool(
    "tripo_get_model",
    {
      description: "Project detail for one Studio model: capability flags (textured/segmented/rigged/rig_type/\u2026), optional animation presets, and optional GLB part names. include: capabilities (default), animation_presets, parts, operator_detail.",
      inputSchema: {
        include: z20.array(z20.enum(["capabilities", "animation_presets", "parts", "operator_detail"])).default(["capabilities"]),
        project_id: identifier4
      }
    },
    async (input) => {
      const detail = await gateway.getProject(input.project_id);
      if (detail.id && detail.id !== input.project_id) {
        throw new TripoError("INSUFFICIENT_EVIDENCE", "Tripo returned a different project than requested.", { stage: "project" });
      }
      const capabilities = projectCapabilities(input.project_id, detail);
      const out = {
        capabilities,
        model_url_available: Boolean(detail.model_url),
        project_id: input.project_id,
        project_name: detail.project_name ?? null,
        remote_status: detail.status ?? null,
        visibility: detail.visibility ?? null
      };
      if (input.include.includes("animation_presets")) {
        out.animation_presets = capabilities.rig_type ? listAnimationPresets({ rigType: capabilities.rig_type }) : listAnimationPresets();
      }
      if (input.include.includes("operator_detail")) {
        out.operator_detail = stripUrls(detail.operator ?? {});
      }
      if (input.include.includes("parts")) {
        out.parts = await loadPartNames(config, gateway, input.project_id, detail);
      }
      return ok(out);
    }
  );
  tool(
    "tripo_list_image_assets",
    { description: "List Studio image assets including generation, multiview, upscale and subject split results, with local character groups.", inputSchema: { page_num: z20.number().int().min(1).max(1e5).default(1), page_size: z20.number().int().min(1).max(100).default(20), character_group_id: z20.string().max(80).optional().describe("Filter assets by character before pagination; ungrouped selects assets without a recorded character.") } },
    async (input) => {
      const account = await session.accountFingerprint();
      const index = applyAssetAssignments(assetCharacterIndex(await store.list({ limit: 5e3 }), account), await assetLibrary.groupStore.read(account));
      const page = await characterAssetPage({
        characterGroupId: input.character_group_id,
        offset: (input.page_num - 1) * input.page_size,
        limit: input.page_size,
        annotate: (asset) => ({ ...asset, character_group: index.get(`asset_id:${asset.asset_id}`) ?? null }),
        fetchPage: async (offset) => {
          const remote = await gateway.listStudioImageAssets(Math.floor(offset / input.page_size) + 1, input.page_size);
          return { items: remote.assets, next_offset: remote.assets.length >= input.page_size ? offset + input.page_size : null };
        }
      });
      return ok({
        character_groups: assetCharacterGroups(index),
        assets: page.items.map((asset) => ({
          character_group: asset.character_group,
          asset_id: asset.asset_id,
          created_at: asset.create_time ?? null,
          input: {
            model_version: asset.input.model_version ?? null,
            prompt: typeof asset.input.prompt === "string" ? asset.input.prompt.slice(0, 1e3) : asset.input.prompt_text?.slice(0, 1e3) ?? null
          },
          output_count: asset.output.data.length,
          outputs: asset.output.data.map((output, index2) => ({ content_warning: ["sensitive", "nsfw"].includes(output.image_audit_result ?? ""), index: index2 })),
          status: asset.status,
          type: asset.type
        })),
        has_more: page.next_offset !== null,
        page_num: input.page_num,
        page_size: input.page_size
      });
    }
  );
  tool(
    "tripo_get_image_asset",
    { description: "One Studio image asset with its output slots (urls resolvable via tripo_download).", inputSchema: { asset_id: identifier4 } },
    async ({ asset_id }) => {
      const asset = await gateway.getStudioImageAsset(asset_id);
      return ok({
        asset_id: asset.asset_id,
        input: stripUrls(asset.input),
        outputs: asset.output.data.map((output, index) => ({
          content_warning: ["sensitive", "nsfw"].includes(output.image_audit_result ?? ""),
          index,
          url_available: Boolean(output.url)
        })),
        status: asset.status,
        type: asset.type
      });
    }
  );
  tool(
    "tripo_list_image_templates",
    { description: "Studio image-generation templates (style presets) with tags/categories.", inputSchema: { category: z20.string().optional(), query: z20.string().optional() } },
    async (input) => {
      const response = await gateway.listStudioImageTemplates();
      const category = input.category?.trim().toLowerCase();
      const query = input.query?.trim().toLowerCase();
      const templates = response.templates.filter((template) => {
        const tags = template.tag.map((tag) => tag.toLowerCase());
        if (category && category !== "all" && !tags.includes(category)) return false;
        if (query && !`${template.title}
${template.description ?? ""}
${template.tag.join("\n")}`.toLowerCase().includes(query)) return false;
        return true;
      });
      return ok({
        categories: [...new Set(response.templates.flatMap((t) => t.tag))].sort(),
        templates: templates.map((template) => ({
          description: template.description ?? null,
          has_preview: Boolean(typeof template.image === "string" ? template.image : template.image?.[0]),
          tags: template.tag,
          template_id: template.template_id,
          title: template.title
        }))
      });
    }
  );
  tool(
    "tripo_list_animation_presets",
    { description: "Studio animation retarget presets (preset:<rig_type>:<name>).", inputSchema: { query: z20.string().optional(), rig_type: z20.string().optional() } },
    async (input) => ok({ presets: listAnimationPresets({ query: input.query, rigType: input.rig_type }) })
  );
  tool(
    "tripo_list_operations",
    { description: "Capability catalog: available operation kinds, descriptions and credit flags. Input schemas are in each registered tool definition.", inputSchema: {} },
    async () => ok({ operations: operationCatalog(), session: await session.status() })
  );
  tool("tripo_quote_operation", {
    description: "Read-only credit estimate from reviewed official frontend rules and live member discounts/free quotas. Give kind + cost-related input (IDs/prompts/paths can be omitted), or task_id to quote frozen parameters. No upload, staging or paid request. Returns unknown for unverified billing; this is not a server billing guarantee. Model generation requires tier, mode and face_limit. Smart UV needs action or a staged task.",
    inputSchema: { kind: z20.enum(Object.keys(OPERATION_TOOLS)).optional(), input: z20.record(z20.string(), z20.unknown()).optional(), task_id: taskIdShape.optional(), refresh: z20.boolean().default(false) }
  }, async ({ kind, input, task_id, refresh }) => {
    if (task_id !== void 0) {
      if (kind !== void 0 || input !== void 0) throw new TripoError("INVALID_INPUT", "Use task_id alone, or kind + input.");
      const task = await store.get(task_id);
      const fingerprint = getOperation(task.kind).category === "local" ? "local" : await session.accountFingerprint();
      if (task.account_fingerprint !== fingerprint) throw new TripoError("INVALID_INPUT", "Task belongs to another account.");
      return ok({ quote: await pricing.quote(task.kind, {}, { task, refresh }), task_id, request_hash: task.request_hash });
    }
    if (!kind) throw new TripoError("INVALID_INPUT", "Specify kind or task_id.");
    return ok({ quote: await pricing.quote(kind, input ?? {}, { refresh }) });
  });
  for (const [kind, toolName] of Object.entries(OPERATION_TOOLS)) {
    const operation = getOperation(kind);
    tool(
      toolName,
      {
        card: kind !== "local.inspect_parts",
        description: `${operation.description}${operation.consumesCredits ? " Consumes Studio credits." : ""} AI: supply character_name from the user's context for character work; reuse canonical names or parent_task_id across follow-up operations for automatic UI grouping.`,
        inputSchema: { ...operation.inputShape, ...taskContextShape, review: z20.boolean().default(true).describe("Render an editable configuration card; auto-submit 60 seconds after the card is displayed unless editing or canceled. Set false only for draft-only/workbench flows.") }
      },
      async (input) => {
        const { review, ...operationInput } = input;
        const prepared = await service.prepare(kind, operationInput);
        const result = review !== false && prepared.task.status === "staged" ? await reviews.create(kind, operationInput, prepared) : prepared;
        return ok(result, result.review ? "\u914D\u7F6E\u5361\u7247\u5DF2\u51C6\u5907\u5C31\u7EEA\uFF1A\u53EF\u4FEE\u6539\u3001\u786E\u8BA4\u6216\u53D6\u6D88\uFF1B60 \u79D2\u540E\u81EA\u52A8\u63D0\u4EA4\uFF0C\u7F16\u8F91\u65F6\u6682\u505C\u3002" : `${toolName} \u2192 task ${prepared.task.task_id} (${prepared.task.status})${prepared.deduplicated ? " [deduplicated]" : ""}`);
      }
    );
  }
  tool(
    "tripo_submit_task",
    {
      description: "Dispatch a previously staged task to Studio. Requires the exact confirmation string returned at staging; the paid write crosses the durable boundary exactly once.",
      inputSchema: { confirmation: z20.string(), request_hash: z20.string().length(64).optional(), task_id: taskIdShape }
    },
    async (input) => ok(await service.submit(input.task_id, { confirmation: input.confirmation, requestHash: input.request_hash }))
  );
  tool(
    "tripo_task_sync",
    { description: "Refresh one task's remote progress/status from Studio.", inputSchema: { task_id: taskIdShape } },
    async (input) => ok(await service.sync(input.task_id))
  );
  tool(
    "tripo_task_wait",
    {
      description: "Poll a task until it reaches a terminal state or the timeout elapses.",
      inputSchema: { poll_seconds: z20.number().min(1).max(120).default(5), task_id: taskIdShape, timeout_seconds: z20.number().min(1).max(3600).default(300) }
    },
    async (input) => ok(await service.wait(input.task_id, input.timeout_seconds, input.poll_seconds))
  );
  tool(
    "tripo_task_cancel",
    { description: "Cancel a staged (never-submitted) task. Already-submitted remote work cannot be withdrawn.", inputSchema: { task_id: taskIdShape } },
    async (input) => ok(await service.cancel(input.task_id))
  );
  tool(
    "tripo_task_reconcile",
    {
      description: `Adopt confirmed remote IDs into an outcome_unknown task (Studio Studio UI lists operator/asset ids). Requires confirmation "${RECONCILE_CONFIRMATION}".`,
      inputSchema: {
        confirmation: z20.string(),
        remote: z20.object({ motion_task_id: identifier4.optional(), asset_id: identifier4.optional(), operator_id: identifier4.optional(), operator_ids: z20.array(identifier4).min(1).max(120).optional(), project_ids: z20.array(identifier4.nullable()).min(1).max(120).optional(), project_id: identifier4.optional() }).strict(),
        task_id: taskIdShape
      }
    },
    async (input) => ok(await service.reconcile(input.task_id, input))
  );
  tool(
    "tripo_list_tasks",
    {
      description: "List plugin tasks (optionally filtered). Newest first.",
      inputSchema: { character_group_id: z20.string().max(80).optional().describe("Use an id from tripo_list_task_groups, or ungrouped. Filter is applied before pagination."), kind: z20.string().optional(), limit: z20.number().int().min(1).max(200).default(50), offset: z20.number().int().min(0).max(5e3).default(0), status: z20.string().optional(), statuses: z20.array(z20.string()).min(1).max(12).optional() }
    },
    async (input) => ok(await service.list(input))
  );
  tool("tripo_list_task_groups", { description: "Read character groups and full retained task counts (up to 5000 tasks), optionally filtered by status. Use these names/ids to reuse existing character identities; grouping does not consume credits.", inputSchema: { statuses: z20.array(z20.string()).min(1).max(12).optional() } }, async (input) => ok(await service.listGroups(input)));
  tool("tripo_set_task_character", { description: "Correct one existing task's local character group without changing frozen Studio inputs, request hash, confirmation or dispatch. character_name:null moves it to ungrouped. Existing descendants are unchanged; future tasks inherit the corrected group.", inputSchema: { task_id: taskIdShape, character_name: characterName.nullable() } }, async (input) => ok(await service.setCharacter(input.task_id, input.character_name)));
  tool(
    "tripo_get_task",
    {
      description: "Full public view of one task: status, frozen snapshot summary, remote ids, result, error and (optionally) the event log.",
      inputSchema: { include_events: z20.boolean().default(false), task_id: taskIdShape }
    },
    async (input) => {
      const result = await service.get(input.task_id);
      return ok(input.include_events ? result : { task: result.task });
    }
  );
  tool("tripo_show_result", {
    card: true,
    description: "Show a task, Studio model/image, or saved GLB/image in a persistent result preview card. Use once when presenting a completed artifact if no creation card is already following that task, or when the user asks to view an existing result. Background get/list/sync/wait/quote/download tools return data only and must not be followed by repeated presentation calls for the same artifact. Does not submit generation or consume credits.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    inputSchema: {
      task_id: taskIdShape.optional(),
      project_id: identifier4.optional(),
      asset_id: identifier4.optional(),
      local_path: z20.string().optional().describe("Saved GLB, PNG, JPEG or WebP inside an allowed output root."),
      output_index: z20.number().int().min(0).max(119).default(0)
    }
  }, async (input) => {
    if ([input.task_id, input.project_id, input.asset_id, input.local_path].filter(Boolean).length !== 1)
      throw new TripoError("INVALID_INPUT", "Provide exactly one of task_id, project_id, asset_id, or local_path.");
    let data, preview;
    if (input.task_id) {
      data = { task: (await service.get(input.task_id)).task };
      preview = { task_id: input.task_id, type: data.task.kind.startsWith("image.") || ["local.render", "local.crop", "local.paint", "local.project_texture"].includes(data.task.kind) ? "image" : "model", output_index: input.output_index };
    } else if (input.project_id) {
      const detail = await gateway.getProject(input.project_id);
      if (detail.id && detail.id !== input.project_id) throw new TripoError("INSUFFICIENT_EVIDENCE", "Tripo returned a different project than requested.");
      data = { project_id: input.project_id, project_name: detail.project_name ?? null };
      preview = { project_id: input.project_id, type: "model" };
    } else if (input.asset_id) {
      const asset = await gateway.getStudioImageAsset(input.asset_id);
      data = { asset_id: input.asset_id, status: asset.status };
      preview = { asset_id: input.asset_id, type: "image", output_index: input.output_index };
    } else {
      const extension = path22.extname(input.local_path).toLowerCase();
      if (![".glb", ".png", ".jpg", ".jpeg", ".webp"].includes(extension)) throw new TripoError("INVALID_INPUT", "Only saved GLB, PNG, JPEG or WebP files can be previewed.");
      preview = { local_path: input.local_path, type: extension === ".glb" ? "model" : "image" };
      await media.preview(preview);
      data = { download: { path: input.local_path } };
    }
    return ok({ ...data, preview_target: preview }, "\u4EA7\u7269\u9884\u89C8\u5DF2\u51C6\u5907\u5C31\u7EEA\u3002");
  });
  tool("tripo_list_motions", { description: "List generated motion assets and active motion tasks; URLs remain private.", inputSchema: {} }, async () => ok(stripUrls(await gateway.listMotionAssets())));
  tool("tripo_get_motion", { description: "Inspect a generated motion asset (use tripo_download motion_asset_id to download).", inputSchema: { motion_asset_id: identifier4 } }, async (input) => ok(stripUrls(await gateway.getMotionAsset(input.motion_asset_id))));
  tool("tripo_get_uv_context", { description: "Read Smart UV candidates, current operator, next action and running task without submitting.", inputSchema: { project_id: identifier4 } }, async (input) => ok(stripUrls((await uvContext(runtime, input.project_id)).context)));
  tool(
    "tripo_download",
    {
      description: "Save remote model/image/motion/export/UV artifacts, or copy local render/paint/bake outputs into an allowed output root. GLB downloads retain the source at path and return blender_path for an automatically Meshopt-decoded copy when needed. Choose GLB/FBX/OBJ/USDZ/STL/3MF with tripo_export_model format first, then download its task_id; download has no format conversion parameter. Signed URLs stay private; output_index selects batch models, images or baked part textures.",
      inputSchema: {
        asset_id: identifier4.optional().describe("Studio image asset id (alternative to task_id/project_id)."),
        motion_asset_id: identifier4.optional(),
        artifact: z20.enum(["model", "uv_layout", "image", "render", "texture"]).default("model"),
        output_index: z20.number().int().min(0).max(119).optional(),
        path: z20.string().optional().describe("Absolute destination path inside an allowed output root; default: <asset_root>/downloads/."),
        project_id: identifier4.optional().describe("Studio project id; downloads its current model."),
        task_id: taskIdShape.optional()
      }
    },
    async (input) => {
      const resolved = await resolveDownloadTarget(runtime, input);
      const downloaded = await downloadResolvedArtifact(config, resolved, input.path);
      if (input.task_id) {
        await store.update(input.task_id, (record) => {
          if (resolved.verification) record.result = { ...record.result, ...resolved.verification, export_model_path: resolved.localPath };
          record.downloads.push({ ...downloaded, output_index: input.output_index ?? 0, artifact: input.artifact, at: (/* @__PURE__ */ new Date()).toISOString(), name: resolved.defaultName });
          record.events.push({ at: (/* @__PURE__ */ new Date()).toISOString(), detail: { bytes: downloaded.bytes, name: resolved.defaultName }, type: "download.completed" });
          return record;
        }).catch(() => {
        });
      }
      return ok({ download: downloaded, source: resolved.source, ...resolved.verification ? { texture_resolution: resolved.verification } : {} });
    }
  );
  tool(
    "tripo_run_workflow",
    {
      description: "Chain up to eight operations through the shared durable lifecycle. Copy previous project, motion asset, UV candidate, local model, render camera or baked textures with the corresponding *_from_previous flags. wait_between waits for success before dependencies.",
      inputSchema: {
        steps: z20.array(
          z20.object({
            input: z20.record(z20.string(), z20.unknown()).default({}),
            operation: z20.enum(Object.keys(OPERATION_TOOLS)),
            project_id_from_previous: z20.boolean().optional(),
            motion_asset_id_from_previous: z20.boolean().optional(),
            candidate_operator_id_from_previous: z20.boolean().optional(),
            model_path_from_previous: z20.boolean().optional(),
            render_from_previous: z20.boolean().optional(),
            textures_from_previous: z20.boolean().optional(),
            submit: z20.boolean().optional()
          }).strict()
        ).min(1).max(8),
        submit: z20.boolean().default(true).describe("Execute each reached step; only operations marked consumes_credits are billed."),
        ...taskContextShape,
        wait_between: z20.boolean().default(true),
        workflow_name: z20.string().max(120).optional()
      }
    },
    async (input) => {
      const workflowId = crypto.randomUUID();
      const tasks = [];
      let previous;
      for (const [index, step] of input.steps.entries()) {
        const stepInput = { ...step.input };
        const result = previous?.task.result;
        const requireResult = (field) => {
          if (!result?.[field]) throw new TripoError("STAGING_REQUIRED", `Previous step has no ${field}; wait for it to succeed before chaining.`);
          return result[field];
        };
        if (step.project_id_from_previous) stepInput.project_id = requireResult("project_id");
        if (step.motion_asset_id_from_previous) stepInput.motion_asset_id = requireResult("motion_asset_id");
        if (step.candidate_operator_id_from_previous) stepInput.candidate_operator_id = requireResult("candidate_operator_id");
        if (step.model_path_from_previous) stepInput.model_path = requireResult("model_path");
        if (step.textures_from_previous) stepInput.textures = requireResult("textures");
        if (step.render_from_previous) for (const field of ["camera_matrix", "fov_degrees", "viewport_width", "viewport_height"]) stepInput[field] = requireResult(field);
        stepInput.submit = (step.submit ?? input.submit) && !(step.project_id_from_previous && !previous);
        const prepared = await service.prepare(step.operation, stepInput, { parentTaskId: previous?.task.task_id ?? input.parent_task_id, workflowId, characterName: previous ? void 0 : input.character_name });
        tasks.push({ operation: step.operation, step: index, task: prepared.task });
        previous = prepared;
        if (input.wait_between && !["staged", "succeeded"].includes(prepared.task.status)) {
          const waited = await service.wait(prepared.task.task_id, 1800, 10);
          previous = { task: waited.task };
          tasks[tasks.length - 1].task = waited.task;
          if (!["succeeded"].includes(waited.task.status)) break;
        }
      }
      return ok({ tasks, workflow_id: workflowId });
    }
  );
  tool(
    "tripo_open_in_studio",
    { description: "Return the Studio workspace deep link for a project (open it in any browser).", inputSchema: { project_id: identifier4.optional() } },
    async (input) => ok({ url: `${STUDIO_ORIGIN}/workspace/generate${input.project_id ? `/${encodeURIComponent(input.project_id)}` : ""}` })
  );
  const workbenchPath = path22.join(path22.dirname(fileURLToPath2(import.meta.url)), "..", "ui", "workbench.html");
  const workbenchScript = path22.join(path22.dirname(workbenchPath), "..", "dist", "workbench.js");
  registerAppTool(server, "tripo_open_workbench", {
    title: "Tripo \u5DE5\u4F5C\u53F0",
    description: "\u6253\u5F00 Tripo \u5DE5\u4F5C\u53F0\uFF1A\u4ECE\u4FA7\u8FB9\u680F\u67E5\u770B\u6A21\u578B\u3001\u56FE\u7247\u4E0E\u6301\u4E45\u4EFB\u52A1\uFF0C\u6216\u5728\u5BF9\u8BDD\u65C1\u7EE7\u7EED\u5904\u7406\u6307\u5B9A\u9879\u76EE/\u4EFB\u52A1\u3002\u53EA\u6253\u5F00\u754C\u9762\uFF0C\u4E0D\u63D0\u4EA4\u751F\u6210\u6216\u6D88\u8017\u79EF\u5206\u3002",
    inputSchema: { view: z20.enum(["assets", "tasks", "create"]).default("assets"), project_id: identifier4.optional(), task_id: taskIdShape.optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    icons,
    _meta: { ui: { resourceUri: WORKBENCH_RESOURCE_URI, visibility: ["model", "app"] }, "openai/ui": { entrypoints: [{ type: "global" }, { type: "thread" }] } }
  }, async (input) => ok({ ...input, session: await session.status() }, "Tripo \u5DE5\u4F5C\u53F0\u5DF2\u51C6\u5907\u5C31\u7EEA\u3002"));
  const uiMeta = {
    ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: ["data:", "blob:"] } },
    "openai/ui": { preferredDisplayMode: "fullscreen", availableDisplayModes: ["fullscreen", "inline"] }
  };
  registerAppResource(
    server,
    "workbench",
    WORKBENCH_RESOURCE_URI,
    { description: "Tripo \u5DE5\u4F5C\u53F0\uFF1A\u4FA7\u8FB9\u680F\u5E94\u7528\u4E0E\u5BF9\u8BDD\u9762\u677F\u3002", mimeType: RESOURCE_MIME_TYPE, _meta: uiMeta },
    async () => {
      const [html, script] = await Promise.all([readFile12(workbenchPath, "utf8"), readFile12(workbenchScript, "utf8")]);
      return { contents: [{ mimeType: RESOURCE_MIME_TYPE, text: html.replace("<!-- WORKBENCH_SCRIPT -->", () => `<script>${script.replace(/<\/script/gi, "<\\/script")}</script>`), uri: WORKBENCH_RESOURCE_URI, _meta: uiMeta }] };
    }
  );
  const cardMeta = {
    ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: ["data:", "blob:"] } },
    "openai/ui": { preferredDisplayMode: "inline", availableDisplayModes: ["inline"] }
  };
  registerAppResource(
    server,
    "result-card",
    RESULT_CARD_RESOURCE_URI,
    { description: "Tripo \u5DE5\u5177\u7ED3\u679C\u5361\u7247\uFF1A\u4EFB\u52A1\u72B6\u6001\u3001\u56FE\u7247\u4E0E\u6A21\u578B\u9884\u89C8\u3002", mimeType: RESOURCE_MIME_TYPE, _meta: cardMeta },
    async () => {
      const [html, script] = await Promise.all([
        readFile12(path22.join(path22.dirname(workbenchPath), "result-card.html"), "utf8"),
        readFile12(path22.join(path22.dirname(workbenchScript), "result-card.js"), "utf8")
      ]);
      return { contents: [{
        uri: RESULT_CARD_RESOURCE_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: html.replace("<!-- CARD_SCRIPT -->", () => `<script>${script.replace(/<\/script/gi, "<\\/script")}</script>`),
        _meta: cardMeta
      }] };
    }
  );
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] ready (recovered ${runtime.recovered} interrupted task(s))`);
}
async function resolveDownloadTarget(runtime, input) {
  const { gateway, store } = runtime;
  const count = [input.task_id, input.project_id, input.asset_id, input.motion_asset_id].filter(Boolean).length;
  if (count !== 1) throw new TripoError("INVALID_INPUT", "Provide exactly one of task_id, project_id, asset_id, or motion_asset_id.", { stage: "download" });
  if (input.motion_asset_id) {
    const asset = await gateway.getMotionAsset(input.motion_asset_id);
    return { defaultName: `${input.motion_asset_id}-motion.glb`, source: { motion_asset_id: input.motion_asset_id }, url: asset.motion_url };
  }
  if (input.asset_id) {
    const asset = await gateway.getStudioImageAsset(input.asset_id);
    const index = input.output_index ?? 0;
    const output = asset.output.data[index];
    if (asset.status !== "success" || !output?.url) {
      throw new TripoError("INSUFFICIENT_EVIDENCE", "The image asset has no completed output at that index.", { stage: "download" });
    }
    return { defaultName: `${input.asset_id}-${index}.png`, source: { asset_id: input.asset_id, output_index: index }, url: output.url };
  }
  if (input.project_id) {
    const detail2 = await gateway.getProject(input.project_id);
    if (!detail2.model_url) throw new TripoError("INSUFFICIENT_EVIDENCE", "This project has no downloadable model artifact yet.", { stage: "download" });
    return { defaultName: `${input.project_id}.glb`, source: { project_id: input.project_id }, url: detail2.model_url };
  }
  const record = await store.get(input.task_id);
  if (record.status !== "succeeded" && !(record.result?.models?.[input.output_index ?? 0]?.status === "succeeded")) {
    throw new TripoError("STAGING_REQUIRED", `Task ${input.task_id} is ${record.status}, not succeeded.`, { stage: "download" });
  }
  if (record.kind.startsWith("local.")) {
    const localPath = localArtifact(record, input.artifact, input.output_index ?? 0);
    return { localPath, defaultName: path22.basename(localPath), source: { task_id: record.task_id, artifact: input.artifact, output_index: input.output_index ?? 0 } };
  }
  if (record.result?.export_url) {
    return prepareExportDownload(runtime, record);
  }
  if (record.result?.motion_asset_id) {
    const asset = await gateway.getMotionAsset(record.result.motion_asset_id);
    return { defaultName: `${asset.asset_id}-motion.glb`, source: { task_id: record.task_id }, url: asset.motion_url };
  }
  if (record.kind === "model.uv_generate") {
    const context = await gateway.getUvContext({ project_id: record.payload.project_id, current_operator_id: record.payload.current_operator_id });
    const candidate = context.candidates.find((item) => item.operator_id === record.result.candidate_operator_id);
    const url = input.artifact === "uv_layout" ? candidate?.uv_layout.url : candidate?.model.url;
    if (!url) throw new TripoError("INSUFFICIENT_EVIDENCE", "UV candidate artifact is unavailable.");
    return { defaultName: `${record.task_id}.${input.artifact === "uv_layout" ? "png" : "glb"}`, source: { task_id: record.task_id, artifact: input.artifact }, url };
  }
  if (record.result?.models) {
    const model = record.result.models[input.output_index ?? 0];
    if (!model?.project_id || model.status !== "succeeded") throw new TripoError("INSUFFICIENT_EVIDENCE", "Selected model output is unavailable.");
    const detail2 = await gateway.getProject(model.project_id, model.operator_id);
    if (!detail2.model_url) throw new TripoError("INSUFFICIENT_EVIDENCE", "Selected model output has no artifact.");
    return { defaultName: `${model.project_id}.glb`, source: { task_id: record.task_id, project_id: model.project_id, output_index: model.output_index }, url: detail2.model_url };
  }
  if (record.remote?.asset_id) {
    const asset = await gateway.getStudioImageAsset(record.remote.asset_id);
    const index = input.output_index ?? 0;
    const output = asset.output.data[index];
    if (!output?.url) throw new TripoError("INSUFFICIENT_EVIDENCE", "The task output index has no downloadable artifact.", { stage: "download" });
    return { defaultName: `${record.remote.asset_id}-${index}.png`, source: { asset_id: record.remote.asset_id, output_index: index, task_id: record.task_id }, url: output.url };
  }
  const animationUrl = record.result?.animation_model_url;
  if (animationUrl) {
    return { defaultName: `${record.task_id}-animation.glb`, source: { task_id: record.task_id }, url: animationUrl };
  }
  const projectId2 = record.result?.project_id ?? record.remote?.project_id;
  if (!projectId2) throw new TripoError("INSUFFICIENT_EVIDENCE", "The task has no downloadable project artifact.", { stage: "download" });
  const detail = await gateway.getProject(projectId2, record.remote?.operator_id);
  if (!detail.model_url) throw new TripoError("INSUFFICIENT_EVIDENCE", "The project has no downloadable model artifact.", { stage: "download" });
  return { defaultName: `${projectId2}.glb`, source: { project_id: projectId2, task_id: record.task_id }, url: detail.model_url };
}
async function loadPartNames(config, gateway, projectId2, detail) {
  if (!detail.model_url) throw new TripoError("INSUFFICIENT_EVIDENCE", "The project has no downloadable GLB to inspect.", { stage: "parts" });
  const cacheDir = path22.join(config.dataDir, "model-cache");
  const target = path22.join(cacheDir, `${projectId2}.glb`);
  const downloaded = await downloadArtifact({ ...config, outputRoots: [path22.join(config.dataDir, "model-cache")] }, detail.model_url, target, `${projectId2}.glb`);
  const { readFile: readFile13 } = await import("node:fs/promises");
  const bytes = await readFile13(downloaded.path);
  const names = glbNodeNames(bytes);
  return { part_names: names.slice(0, 500), truncated: names.length > 500 };
}
main().catch((error) => {
  console.error(`[${SERVER_NAME}] fatal:`, error);
  process.exitCode = 1;
});
