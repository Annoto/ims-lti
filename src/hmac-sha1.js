const crypto = require('crypto');
const url = require('url');
const utils = require('./utils');

// Cleaning invloves:
//   stripping the oauth_signature from the params
//   encoding the values ( yes this double encodes them )
//   sorting the key/value pairs
//   joining them with &
//   encoding them again
//
// Returns a string representing the request
const _clean_request_body = function(body, query) {
  const out = [];

  const encodeParam = (key, val) => `${key}=${utils.special_encode(val)}`;

  const cleanParams = function(params) {
    if (typeof params !== 'object') {
      return;
    }

    for (let key in params) {
      const vals = params[key];
      if (key === 'oauth_signature') {
        continue;
      }
      if (Array.isArray(vals) === true) {
        for (let val of vals) {
          out.push(encodeParam(key, val));
        }
      } else {
        out.push(encodeParam(key, vals));
      }
    }
  };

  cleanParams(body);
  cleanParams(query);

  return utils.special_encode(out.sort().join('&'));
};

class HMAC_SHA1 {
  toString() {
    return 'HMAC_SHA1';
  }

  build_signature_raw(
    req_url,
    parsed_url,
    method,
    params,
    consumer_secret,
    token
  ) {
    const sig = [
      method.toUpperCase(),
      utils.special_encode(req_url),
      _clean_request_body(params, parsed_url.query),
    ];

    return this.sign_string(sig.join('&'), consumer_secret, token);
  }

  build_signature(req, body, consumer_secret, token) {
    const hapiRawReq = req.raw && req.raw.req;
    if (hapiRawReq) {
      req = hapiRawReq;
    }

    let originalUrl = req.originalUrl || req.url;
    let { protocol } = req;

    if (protocol === undefined) {
      const { encrypted } = req.connection;
      protocol = (encrypted && 'https') || 'http';
    }

    const parsedUrl = url.parse(originalUrl, true);
    const hitUrl = protocol + '://' + req.headers.host + parsedUrl.pathname;
    let query = {};

    // Since canvas/schoology may include query parameters in the body we need to omit them from the query params
    if (parsedUrl.query) {
      const familyCode = body.tool_consumer_info_product_family_code;
      if (['canvas', 'schoology'].includes(familyCode)) {
        Object.keys(parsedUrl.query).forEach((key) => {
            if (typeof body[key] !== 'undefined') {
              return;
            }
            query[key] = parsedUrl.query[key];
        });
      } else {
        query = parsedUrl.query;
      }
    }

    return this.build_signature_raw(
      hitUrl,
      { query },
      req.method,
      body,
      consumer_secret,
      token
    );
  }

  sign_string(str, key, token) {
    key = `${key}&`;
    if (token) {
      key += token;
    }

    return crypto
      .createHmac('sha1', key)
      .update(str)
      .digest('base64');
  }
}

module.exports = HMAC_SHA1;
